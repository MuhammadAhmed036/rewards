import crypto from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { organisations, tenants } from "../db/schema";
import { RequestContext, assertCan } from "../security/permissions";
import { logAuditEvent } from "./audit";

/**
 * Groups of brands (FR-015). The owner of one brand starts a group; other brands join with its code and can leave
 * whenever they like. Every brand keeps its own customers, points and staff. What the group's owner gets is a
 * combined report of counts per brand: never a customer's name, email or balance.
 */

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // no 0/O, 1/I/L
function newJoinCode() {
  const bytes = crypto.randomBytes(10);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}
const normaliseCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

async function ownTenant(ctx: RequestContext) {
  assertCan(ctx, "tenant.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");
  const [t] = await db
    .select({ id: tenants.id, name: tenants.name, organisationId: tenants.organisationId })
    .from(tenants)
    .where(eq(tenants.id, ctx.tenantId))
    .limit(1);
  if (!t) throw new Error("Business not found");
  return t;
}

export async function createGroup(ctx: RequestContext, rawName: string) {
  const t = await ownTenant(ctx);
  const name = rawName.trim();
  if (name.length < 2 || name.length > 120) throw new Error("Give the group a name (2 to 120 characters).");
  if (t.organisationId) throw new Error("This business is already in a group. Leave it first.");

  const org = await db.transaction(async (tx) => {
    const [o] = await tx
      .insert(organisations)
      .values({ name, ownerUserId: ctx.userId, ownerTenantId: t.id, joinCode: newJoinCode() })
      .returning();
    await tx.update(tenants).set({ organisationId: o.id }).where(eq(tenants.id, t.id));
    return o;
  });
  await logAuditEvent(ctx, { action: "group.created", targetType: "organisation", targetId: org.id, metadata: { name } });
  return { id: org.id, name: org.name };
}

/** A brand agrees to be part of a group. From then on the group's owner sees its combined totals. */
export async function joinGroup(ctx: RequestContext, rawCode: string) {
  const t = await ownTenant(ctx);
  if (t.organisationId) throw new Error("This business is already in a group. Leave it first.");
  const code = normaliseCode(rawCode);
  const [org] = code ? await db.select().from(organisations).where(eq(organisations.joinCode, code)).limit(1) : [];
  if (!org) throw new Error("That code doesn't match a group. Check it and try again.");

  await db.update(tenants).set({ organisationId: org.id }).where(eq(tenants.id, t.id));
  await logAuditEvent(ctx, { action: "group.joined", targetType: "organisation", targetId: org.id, metadata: { group: org.name } });
  return { id: org.id, name: org.name };
}

/** A brand leaves its group. The brand that started the group has to disband it instead. */
export async function leaveGroup(ctx: RequestContext) {
  const t = await ownTenant(ctx);
  if (!t.organisationId) throw new Error("This business isn't in a group.");
  const [org] = await db.select().from(organisations).where(eq(organisations.id, t.organisationId)).limit(1);
  if (org?.ownerTenantId === t.id) throw new Error("This business started the group. Remove the group instead of leaving it.");
  await db.update(tenants).set({ organisationId: null }).where(eq(tenants.id, t.id));
  await logAuditEvent(ctx, { action: "group.left", targetType: "organisation", targetId: t.organisationId });
  return { left: true };
}

async function ownedGroup(ctx: RequestContext) {
  const t = await ownTenant(ctx);
  if (!t.organisationId) throw new Error("This business isn't in a group.");
  const [org] = await db.select().from(organisations).where(eq(organisations.id, t.organisationId)).limit(1);
  if (!org || org.ownerUserId !== ctx.userId || org.ownerTenantId !== t.id) throw new Error("Only the owner of the group can do this.");
  return org;
}

/** The group's owner takes a brand out. */
export async function removeBrand(ctx: RequestContext, tenantId: string) {
  const org = await ownedGroup(ctx);
  if (tenantId === org.ownerTenantId) throw new Error("You can't remove your own business. Remove the group instead.");
  const [gone] = await db
    .update(tenants)
    .set({ organisationId: null })
    .where(and(eq(tenants.id, tenantId), eq(tenants.organisationId, org.id)))
    .returning({ id: tenants.id });
  if (!gone) throw new Error("That business isn't in your group.");
  await logAuditEvent(ctx, { action: "group.brand_removed", targetType: "organisation", targetId: org.id, metadata: { tenantId } });
  return { removed: true };
}

/** Ends the group: every brand goes back to being on its own. Nobody's customers or points are touched. */
export async function disbandGroup(ctx: RequestContext) {
  const org = await ownedGroup(ctx);
  await db.transaction(async (tx) => {
    await tx.update(tenants).set({ organisationId: null }).where(eq(tenants.organisationId, org.id));
    await tx.delete(organisations).where(eq(organisations.id, org.id));
  });
  await logAuditEvent(ctx, { action: "group.disbanded", targetType: "organisation", targetId: org.id, metadata: { name: org.name } });
  return { disbanded: true };
}

/** A new code, so the old one stops working. Brands already in the group are not affected. */
export async function newGroupCode(ctx: RequestContext) {
  const org = await ownedGroup(ctx);
  const joinCode = newJoinCode();
  await db.update(organisations).set({ joinCode }).where(eq(organisations.id, org.id));
  await logAuditEvent(ctx, { action: "group.code_changed", targetType: "organisation", targetId: org.id });
  return { joinCode };
}

export const GROUP_REPORT_DAYS = 30;

export interface BrandFigures {
  id: string;
  name: string;
  isYours: boolean;
  members: number;
  newMembers: number;
  buyers: number;
  purchases: number;
  pointsAwarded: number;
  redemptions: number;
  outstandingPoints: number;
}

/**
 * What this business sees about groups: whether it is in one, and for the group's owner the combined report.
 * The report is counts only. Money isn't added up because brands can use different currencies.
 */
export async function getGroup(ctx: RequestContext) {
  const t = await ownTenant(ctx);
  if (!t.organisationId) return { inGroup: false as const };
  const [org] = await db.select().from(organisations).where(eq(organisations.id, t.organisationId)).limit(1);
  if (!org) return { inGroup: false as const };

  const isOwner = org.ownerUserId === ctx.userId && org.ownerTenantId === t.id;
  const brands = await db
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.organisationId, org.id))
    .orderBy(tenants.name);

  const base = {
    inGroup: true as const,
    name: org.name,
    isOwner,
    brandCount: brands.length,
    // Members of a group see which brands are in it, so they know who else their totals are shared alongside
    brands: brands.map((b) => ({ id: b.id, name: b.name, isYours: b.id === t.id })),
  };
  if (!isOwner) return { ...base, joinCode: null, report: null };

  const rows = await db.execute<{
    id: string; name: string; members: number; new_members: number; buyers: number; purchases: number;
    points_awarded: number; redemptions: number; outstanding_points: number;
  }>(sql`
    select t.id, t.name,
      (select count(*) from memberships m where m.tenant_id = t.id and m.status = 'active')::int as members,
      (select count(*) from memberships m where m.tenant_id = t.id and m.joined_at >= now() - make_interval(days => ${GROUP_REPORT_DAYS}))::int as new_members,
      (select count(distinct le.membership_id) from ledger_entries le
        where le.tenant_id = t.id and le.type = 'earn' and le.reason_code is distinct from 'bonus'
          and le.occurred_at >= now() - make_interval(days => ${GROUP_REPORT_DAYS}))::int as buyers,
      (select count(*) from ledger_entries le
        where le.tenant_id = t.id and le.type = 'earn' and le.reason_code is distinct from 'bonus'
          and le.occurred_at >= now() - make_interval(days => ${GROUP_REPORT_DAYS}))::int as purchases,
      (select coalesce(sum(le.points_delta), 0) from ledger_entries le
        where le.tenant_id = t.id and le.type = 'earn' and le.occurred_at >= now() - make_interval(days => ${GROUP_REPORT_DAYS}))::int as points_awarded,
      (select count(*) from ledger_entries le
        where le.tenant_id = t.id and le.type = 'redeem' and le.occurred_at >= now() - make_interval(days => ${GROUP_REPORT_DAYS}))::int as redemptions,
      (select coalesce(sum(b.balance), 0) from membership_balances b where b.tenant_id = t.id)::int as outstanding_points
    from tenants t
    where t.organisation_id = ${org.id}
    order by t.name
  `);
  const figures: BrandFigures[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    isYours: r.id === t.id,
    members: r.members,
    newMembers: r.new_members,
    buyers: r.buyers,
    purchases: r.purchases,
    pointsAwarded: r.points_awarded,
    redemptions: r.redemptions,
    outstandingPoints: r.outstanding_points,
  }));
  const sum = (key: Exclude<keyof BrandFigures, "id" | "name" | "isYours">) => figures.reduce((n, f) => n + f[key], 0);
  return {
    ...base,
    joinCode: org.joinCode,
    report: {
      days: GROUP_REPORT_DAYS,
      brands: figures,
      // Customers can belong to several brands, so a combined "buyers" would double count: only brand figures are shown for them
      totals: {
        members: sum("members"),
        newMembers: sum("newMembers"),
        purchases: sum("purchases"),
        pointsAwarded: sum("pointsAwarded"),
        redemptions: sum("redemptions"),
        outstandingPoints: sum("outstandingPoints"),
      },
    },
  };
}
