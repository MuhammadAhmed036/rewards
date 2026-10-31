import crypto from "crypto";
import { and, count, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { invoices, locations, staffMembers, tenants } from "../db/schema";
import { RequestContext, assertCan } from "../security/permissions";
import { logAuditEvent } from "./audit";

/**
 * Plans, trials, invoices and what happens when a payment is late (FR-111 to FR-113).
 *
 * Payments are recorded by a platform admin, not taken by a payment provider: no card details pass through the
 * platform, and any payment service can be added later in `markInvoicePaid`'s place.
 */

export const PLANS = {
  free: { name: "Free", priceMinor: 0, limits: { maxStaff: 3, maxLocations: 1 } },
  pro: { name: "Pro", priceMinor: 2900, limits: { maxStaff: 25, maxLocations: 10 } },
} as const;
export type PlanId = keyof typeof PLANS;

/** Days a late payment can run before growth features pause. Customers are never affected. */
export const GRACE_DAYS = 14;
const DAY = 86400_000;

type TenantBilling = Pick<typeof tenants.$inferSelect, "plan" | "billingStatus" | "trialEndsAt" | "pastDueSince">;

/** What a business can and can't do right now because of its plan and payments. */
export function billingState(t: TenantBilling, now = new Date()) {
  const trialDaysLeft = t.billingStatus === "trialing" && t.trialEndsAt ? Math.max(0, Math.ceil((t.trialEndsAt.getTime() - now.getTime()) / DAY)) : null;
  const daysOverdue = t.billingStatus === "past_due" && t.pastDueSince ? Math.max(0, Math.floor((now.getTime() - t.pastDueSince.getTime()) / DAY)) : 0;
  // Growth features pause after the grace period. Earning, redeeming, viewing, exporting and everything already set up keep working.
  const restricted = t.billingStatus === "canceled" || (t.billingStatus === "past_due" && daysOverdue >= GRACE_DAYS);
  const message =
    t.billingStatus === "past_due"
      ? restricted
        ? "Your payment is overdue, so adding team members, locations, offers and imports is paused. Your customers can still earn and spend points. Pay your invoice to switch these back on."
        : `Your payment is overdue. Everything keeps working for now; please pay within ${GRACE_DAYS - daysOverdue} more day${GRACE_DAYS - daysOverdue === 1 ? "" : "s"} to avoid some features pausing.`
      : t.billingStatus === "canceled"
        ? "Your plan has ended, so adding team members, locations, offers and imports is paused. Your customers and their points are kept, and they can still earn and spend."
        : t.billingStatus === "trialing"
          ? `Your trial ends in ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"}.`
          : null;
  return { plan: t.plan, status: t.billingStatus, trialDaysLeft, daysOverdue, restricted, message };
}

/** Throws a plain message if the business's payments have paused growth features. Never used on earn or redeem. */
export async function assertGrowthAllowed(tenantId: string, what: string) {
  const [t] = await db
    .select({ plan: tenants.plan, billingStatus: tenants.billingStatus, trialEndsAt: tenants.trialEndsAt, pastDueSince: tenants.pastDueSince })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!t) return;
  const state = billingState(t);
  if (state.restricted) throw new Error(`BILLING_PAUSED: ${what} is paused because your plan payment is overdue. Your customers are not affected. Pay your invoice to carry on.`);
}

export async function getBillingOverview(ctx: RequestContext) {
  assertCan(ctx, "tenant.manage");
  const tenantId = ctx.tenantId!;
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!t) throw new Error("Business not found");
  const [staff] = await db.select({ n: count() }).from(staffMembers).where(and(eq(staffMembers.tenantId, tenantId), sql`${staffMembers.status} in ('active', 'invited')`));
  const [locs] = await db.select({ n: count() }).from(locations).where(and(eq(locations.tenantId, tenantId), eq(locations.status, "active")));
  const limits = t.limits as { maxStaff?: number; maxLocations?: number };
  const list = await db.select().from(invoices).where(eq(invoices.tenantId, tenantId)).orderBy(desc(invoices.issuedAt)).limit(24);
  const used = { staff: Number(staff?.n ?? 0), locations: Number(locs?.n ?? 0) };
  return {
    plan: { id: t.plan, name: PLANS[t.plan as PlanId]?.name ?? t.plan, priceMinor: PLANS[t.plan as PlanId]?.priceMinor ?? 0 },
    currency: t.currency,
    state: billingState(t),
    trialEndsAt: t.trialEndsAt,
    usage: {
      staff: { used: used.staff, limit: limits.maxStaff ?? null, over: limits.maxStaff !== undefined && used.staff > limits.maxStaff },
      locations: { used: used.locations, limit: limits.maxLocations ?? null, over: limits.maxLocations !== undefined && used.locations > limits.maxLocations },
    },
    invoices: list,
  };
}

// ---------------------------------------------------------------------------
// Platform admin
// ---------------------------------------------------------------------------

/** Moves a business to a plan, optionally with a free trial. Lowering a plan never removes anyone: it only stops new additions past the limit. */
export async function setTenantPlan(ctx: RequestContext, tenantId: string, params: { plan: PlanId; trialDays?: number; reason: string }) {
  assertCan(ctx, "platform.admin");
  if (!(params.plan in PLANS)) throw new Error("Unknown plan.");
  if (!params.reason.trim()) throw new Error("Give a reason for the change.");
  const trialDays = Math.min(Math.max(params.trialDays ?? 0, 0), 90);
  const [existing] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!existing) throw new Error("Tenant not found");

  const trialEndsAt = trialDays > 0 ? new Date(Date.now() + trialDays * DAY) : null;
  const [updated] = await db
    .update(tenants)
    .set({
      plan: params.plan,
      limits: { ...(existing.limits as Record<string, unknown>), ...PLANS[params.plan].limits },
      billingStatus: trialDays > 0 ? "trialing" : "active",
      trialEndsAt,
      pastDueSince: null,
    })
    .where(eq(tenants.id, tenantId))
    .returning();

  const [staff] = await db.select({ n: count() }).from(staffMembers).where(and(eq(staffMembers.tenantId, tenantId), sql`${staffMembers.status} in ('active', 'invited')`));
  const [locs] = await db.select({ n: count() }).from(locations).where(and(eq(locations.tenantId, tenantId), eq(locations.status, "active")));
  const limits = PLANS[params.plan].limits;
  const over = [
    Number(staff?.n ?? 0) > limits.maxStaff ? `${staff?.n} team members (limit ${limits.maxStaff})` : null,
    Number(locs?.n ?? 0) > limits.maxLocations ? `${locs?.n} locations (limit ${limits.maxLocations})` : null,
  ].filter(Boolean);

  await logAuditEvent(ctx, { action: "billing.plan_changed", targetType: "tenant", targetId: tenantId, tenantId, reason: params.reason, metadata: { from: existing.plan, to: params.plan, trialDays } });
  return { plan: updated.plan, status: updated.billingStatus, trialEndsAt, overLimit: over };
}

function invoiceNumber() {
  const d = new Date();
  return `INV-${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function createInvoice(ctx: RequestContext, tenantId: string, params: { description: string; amountMinor: number; dueInDays: number }) {
  assertCan(ctx, "platform.admin");
  if (!params.description.trim()) throw new Error("Describe what the invoice is for.");
  if (!Number.isInteger(params.amountMinor) || params.amountMinor <= 0 || params.amountMinor > 100_000_00) throw new Error("Enter an amount above zero.");
  const [t] = await db.select({ currency: tenants.currency }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!t) throw new Error("Tenant not found");
  const [row] = await db
    .insert(invoices)
    .values({
      tenantId,
      number: invoiceNumber(),
      description: params.description.trim().slice(0, 255),
      amountMinor: params.amountMinor,
      currency: t.currency,
      dueAt: new Date(Date.now() + Math.min(Math.max(params.dueInDays, 0), 90) * DAY),
      createdBy: ctx.userId,
    })
    .returning();
  await logAuditEvent(ctx, { action: "billing.invoice_created", targetType: "invoice", targetId: row.id, tenantId, metadata: { number: row.number, amountMinor: row.amountMinor } });
  return row;
}

/** After a payment or a void, a business with nothing overdue goes back to active. */
async function settleStatus(tenantId: string) {
  const [late] = await db
    .select({ since: sql<Date | null>`min(${invoices.dueAt})` })
    .from(invoices)
    .where(and(eq(invoices.tenantId, tenantId), eq(invoices.status, "open"), lt(invoices.dueAt, new Date())));
  const [t] = await db.select({ billingStatus: tenants.billingStatus }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!late?.since && t?.billingStatus === "past_due") {
    await db.update(tenants).set({ billingStatus: "active", pastDueSince: null }).where(eq(tenants.id, tenantId));
  }
}

export async function markInvoicePaid(ctx: RequestContext, invoiceId: string) {
  assertCan(ctx, "platform.admin");
  const [row] = await db.update(invoices).set({ status: "paid", paidAt: new Date() }).where(and(eq(invoices.id, invoiceId), eq(invoices.status, "open"))).returning();
  if (!row) throw new Error("That invoice isn't open.");
  await settleStatus(row.tenantId);
  await logAuditEvent(ctx, { action: "billing.invoice_paid", targetType: "invoice", targetId: row.id, tenantId: row.tenantId, metadata: { number: row.number } });
  return row;
}

export async function voidInvoice(ctx: RequestContext, invoiceId: string) {
  assertCan(ctx, "platform.admin");
  const [row] = await db.update(invoices).set({ status: "void" }).where(and(eq(invoices.id, invoiceId), eq(invoices.status, "open"))).returning();
  if (!row) throw new Error("That invoice isn't open.");
  await settleStatus(row.tenantId);
  await logAuditEvent(ctx, { action: "billing.invoice_voided", targetType: "invoice", targetId: row.id, tenantId: row.tenantId, metadata: { number: row.number } });
  return row;
}

export async function cancelPlan(ctx: RequestContext, tenantId: string, reason: string) {
  assertCan(ctx, "platform.admin");
  if (!reason.trim()) throw new Error("Give a reason for the change.");
  await db.update(tenants).set({ billingStatus: "canceled" }).where(eq(tenants.id, tenantId));
  await logAuditEvent(ctx, { action: "billing.plan_canceled", targetType: "tenant", targetId: tenantId, tenantId, reason });
  return { status: "canceled" };
}

export async function adminBillingView(ctx: RequestContext, tenantId: string) {
  assertCan(ctx, "platform.admin");
  return getBillingOverview({ ...ctx, tenantId, role: "owner" });
}

/**
 * Daily: a trial that has ended without payment, and an invoice past its due date, both make a business "past due".
 * That starts the grace period; nothing is deleted and customers are never touched.
 */
export async function runBillingJobs(now = new Date()) {
  let pastDue = 0;
  const endedTrials = await db
    .update(tenants)
    .set({ billingStatus: "past_due", pastDueSince: sql`${tenants.trialEndsAt}` })
    .where(and(eq(tenants.billingStatus, "trialing"), lt(tenants.trialEndsAt, now), eq(tenants.plan, "pro")))
    .returning({ id: tenants.id });
  pastDue += endedTrials.length;

  const lateInvoices = await db
    .select({ tenantId: invoices.tenantId, since: sql<Date>`min(${invoices.dueAt})` })
    .from(invoices)
    .where(and(eq(invoices.status, "open"), lt(invoices.dueAt, now)))
    .groupBy(invoices.tenantId);
  for (const l of lateInvoices) {
    const moved = await db
      .update(tenants)
      .set({ billingStatus: "past_due", pastDueSince: new Date(l.since) })
      .where(and(eq(tenants.id, l.tenantId), eq(tenants.billingStatus, "active")))
      .returning({ id: tenants.id });
    pastDue += moved.length;
  }
  // A trial on the free plan just ends: it was never charged
  await db.update(tenants).set({ billingStatus: "active", trialEndsAt: null }).where(and(eq(tenants.billingStatus, "trialing"), lt(tenants.trialEndsAt, now), eq(tenants.plan, "free")));
  return { pastDue };
}
