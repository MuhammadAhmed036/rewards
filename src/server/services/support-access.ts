import { and, count, desc, eq, gt, isNull, like, lt, ne, sql } from "drizzle-orm";
import { db } from "../db";
import {
  auditEvents,
  emailOutbox,
  ledgerEntries,
  memberships,
  membershipBalances,
  redemptions,
  supportGrants,
  supportReports,
  tenants,
  users,
  webhookDeliveries,
} from "../db/schema";
import { RequestContext, assertCan } from "../security/permissions";
import { logAuditEvent } from "./audit";

/** The shortest and longest an owner can open their account to support for. */
export const SUPPORT_GRANT_HOURS = [1, 24, 168] as const;

// ---------------------------------------------------------------------------
// Owner side: allow support in, see who has been, close the door
// ---------------------------------------------------------------------------

export async function listSupportGrants(ctx: RequestContext) {
  assertCan(ctx, "tenant.manage");
  const grants = await db
    .select({ id: supportGrants.id, reason: supportGrants.reason, expiresAt: supportGrants.expiresAt, revokedAt: supportGrants.revokedAt, createdAt: supportGrants.createdAt })
    .from(supportGrants)
    .where(eq(supportGrants.tenantId, ctx.tenantId!))
    .orderBy(desc(supportGrants.createdAt))
    .limit(10);
  // Every time support looked, and who: shown to the owner so access is never silent
  const visits = await db
    .select({ id: auditEvents.id, action: auditEvents.action, createdAt: auditEvents.createdAt, who: users.name, email: users.email })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorUserId))
    .where(
      and(
        eq(auditEvents.tenantId, ctx.tenantId!),
        like(auditEvents.action, "support.%"),
        ne(auditEvents.action, "support.grant_created"),
        ne(auditEvents.action, "support.grant_revoked")
      )
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(20);
  return { grants, visits, hours: SUPPORT_GRANT_HOURS };
}

/** The owner lets the platform's support team look at this business for a limited time. */
export async function grantSupportAccess(ctx: RequestContext, params: { hours: number; reason: string }) {
  assertCan(ctx, "tenant.manage");
  if (!(SUPPORT_GRANT_HOURS as readonly number[]).includes(params.hours)) throw new Error("Choose 1 hour, 1 day or 7 days.");
  const reason = params.reason.trim();
  if (reason.length < 5) throw new Error("Say briefly what you need help with.");
  const expiresAt = new Date(Date.now() + params.hours * 3600_000);
  const [grant] = await db.insert(supportGrants).values({ tenantId: ctx.tenantId!, reason: reason.slice(0, 500), grantedBy: ctx.userId, expiresAt }).returning();
  await logAuditEvent(ctx, { action: "support.grant_created", targetType: "support_grant", targetId: grant.id, reason, metadata: { hours: params.hours } });
  return { id: grant.id, expiresAt };
}

export async function revokeSupportAccess(ctx: RequestContext, id: string) {
  assertCan(ctx, "tenant.manage");
  const [row] = await db
    .update(supportGrants)
    .set({ revokedAt: new Date() })
    .where(and(eq(supportGrants.id, id), eq(supportGrants.tenantId, ctx.tenantId!), isNull(supportGrants.revokedAt)))
    .returning();
  if (!row) throw new Error("That access has already ended.");
  await logAuditEvent(ctx, { action: "support.grant_revoked", targetType: "support_grant", targetId: id });
  return { revoked: true };
}

// ---------------------------------------------------------------------------
// Support agent side: read-only, only while a grant is open, every look recorded
// ---------------------------------------------------------------------------

async function openGrant(tenantId: string) {
  const [g] = await db
    .select()
    .from(supportGrants)
    .where(and(eq(supportGrants.tenantId, tenantId), isNull(supportGrants.revokedAt), gt(supportGrants.expiresAt, new Date())))
    .orderBy(desc(supportGrants.expiresAt))
    .limit(1);
  return g ?? null;
}

function assertAgent(ctx: RequestContext) {
  assertCan(ctx, "support.read");
  if (ctx.role !== "support_agent") throw new Error("FORBIDDEN: This area is for the support team.");
}

/** Businesses that have opened their account to support right now. */
export async function listAccessibleTenants(ctx: RequestContext) {
  assertAgent(ctx);
  return db
    .select({ tenantId: tenants.id, name: tenants.name, slug: tenants.slug, reason: supportGrants.reason, expiresAt: supportGrants.expiresAt })
    .from(supportGrants)
    .innerJoin(tenants, eq(tenants.id, supportGrants.tenantId))
    .where(and(isNull(supportGrants.revokedAt), gt(supportGrants.expiresAt, new Date())))
    .orderBy(supportGrants.expiresAt);
}

/**
 * What a support agent sees about one business: enough to work out why a customer, a transaction, an email or
 * a pass has gone wrong (FR-114). It never includes passwords, QR codes, email text or private notes, and nothing here can
 * change a balance.
 */
export async function getSupportView(ctx: RequestContext, tenantId: string, memberNumber?: string) {
  assertAgent(ctx);
  const grant = await openGrant(tenantId);
  if (!grant) throw new Error("FORBIDDEN: This business hasn't opened its account to support, or the time has run out.");
  // Looking is itself recorded where the owner can see it
  await logAuditEvent(ctx, { action: "support.viewed", targetType: "tenant", targetId: tenantId, tenantId, reason: grant.reason, metadata: memberNumber ? { memberNumber } : {} });

  const [tenant] = await db
    .select({ name: tenants.name, slug: tenants.slug, status: tenants.status, plan: tenants.plan, timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const [allMembers] = await db.select({ n: count() }).from(memberships).where(eq(memberships.tenantId, tenantId));
  const [suspended] = await db.select({ n: count() }).from(memberships).where(and(eq(memberships.tenantId, tenantId), eq(memberships.status, "suspended")));

  // Redemption codes that were asked for but never confirmed or expired: a likely source of "I didn't get my reward"
  const stuckRedemptions = await db
    .select({ id: redemptions.id, status: redemptions.status, costPoints: redemptions.costPoints, createdAt: redemptions.createdAt, expiresAt: redemptions.expiresAt, memberNumber: memberships.memberNumber })
    .from(redemptions)
    .innerJoin(memberships, eq(memberships.id, redemptions.membershipId))
    .where(and(eq(redemptions.tenantId, tenantId), eq(redemptions.status, "pending"), lt(redemptions.expiresAt, new Date())))
    .orderBy(desc(redemptions.createdAt))
    .limit(20);

  const emailProblems = await db
    .select({ id: emailOutbox.id, template: emailOutbox.template, status: emailOutbox.status, attempts: emailOutbox.attempts, lastError: emailOutbox.lastError, createdAt: emailOutbox.createdAt })
    .from(emailOutbox)
    .where(and(eq(emailOutbox.tenantId, tenantId), sql`${emailOutbox.status} in ('failed', 'dead')`))
    .orderBy(desc(emailOutbox.createdAt))
    .limit(20);

  const openReports = await db
    .select({ id: supportReports.id, message: supportReports.message, createdAt: supportReports.createdAt, memberNumber: memberships.memberNumber })
    .from(supportReports)
    .leftJoin(memberships, eq(memberships.id, supportReports.membershipId))
    .where(and(eq(supportReports.tenantId, tenantId), eq(supportReports.status, "open")))
    .orderBy(desc(supportReports.createdAt))
    .limit(20);

  const [hooks] = await db
    .select({ failing: sql<number>`count(*) filter (where ${webhookDeliveries.status} in ('failed', 'dead'))::int` })
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.tenantId, tenantId));

  let member: null | { memberNumber: string; status: string; balance: number; lifetimeEarned: number; history: Array<{ at: Date; type: string; points: number; reason: string | null; note: string | null }> } = null;
  if (memberNumber) {
    const [m] = await db
      .select({ id: memberships.id, memberNumber: memberships.memberNumber, status: memberships.status, balance: membershipBalances.balance, earned: membershipBalances.lifetimeEarned })
      .from(memberships)
      .leftJoin(membershipBalances, eq(membershipBalances.membershipId, memberships.id))
      .where(and(eq(memberships.tenantId, tenantId), eq(memberships.memberNumber, memberNumber.trim().toUpperCase())))
      .limit(1);
    if (m) {
      const history = await db
        .select({ at: ledgerEntries.occurredAt, type: ledgerEntries.type, points: ledgerEntries.pointsDelta, reason: ledgerEntries.reasonCode, note: ledgerEntries.note })
        .from(ledgerEntries)
        .where(eq(ledgerEntries.membershipId, m.id))
        .orderBy(desc(ledgerEntries.occurredAt))
        .limit(30);
      member = { memberNumber: m.memberNumber, status: m.status, balance: m.balance ?? 0, lifetimeEarned: m.earned ?? 0, history };
    }
  }

  return {
    tenant,
    grant: { expiresAt: grant.expiresAt, reason: grant.reason },
    counts: { members: Number(allMembers?.n ?? 0), suspended: Number(suspended?.n ?? 0) },
    stuckRedemptions,
    emailProblems,
    openReports,
    failingWebhookDeliveries: hooks?.failing ?? 0,
    member,
    readOnly: true,
  };
}

// ---------------------------------------------------------------------------
// Platform admin: who is on the support team
// ---------------------------------------------------------------------------

export async function listSupportAgents(ctx: RequestContext) {
  assertCan(ctx, "platform.admin");
  return db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(eq(users.isSupportAgent, true)).orderBy(users.email);
}

/** Adds or removes someone from the support team. They must already have an account and not be a customer or shop user. */
export async function setSupportAgent(ctx: RequestContext, email: string, enabled: boolean) {
  assertCan(ctx, "platform.admin");
  const address = email.toLowerCase().trim();
  const [user] = await db.select({ id: users.id, isPlatformAdmin: users.isPlatformAdmin }).from(users).where(eq(users.email, address)).limit(1);
  if (!user) throw new Error("No account has that email yet. They need to be registered first.");
  if (user.isPlatformAdmin) throw new Error("That person is already a platform admin.");
  if (enabled) {
    const [card] = await db.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, user.id)).limit(1);
    const { staffMembers } = await import("../db/schema");
    const [staff] = await db.select({ id: staffMembers.id }).from(staffMembers).where(eq(staffMembers.userId, user.id)).limit(1);
    if (card || staff) throw new Error("That email is used as a customer or by a shop. Support agents need their own account.");
  }
  await db.update(users).set({ isSupportAgent: enabled }).where(eq(users.id, user.id));
  await logAuditEvent(ctx, { action: enabled ? "support.agent_added" : "support.agent_removed", targetType: "user", targetId: user.id, metadata: { email: address } });
  return { enabled };
}
