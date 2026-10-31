import "dotenv/config";
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { tenants, users } from "../db/schema";
import { registerOwnerAndTenant, createLocation } from "./tenant";
import { joinProgramme } from "./member";
import { earn } from "./ledger";
import { addStaffMember } from "./staff";
import { sendCampaign } from "./campaigns";
import { GRACE_DAYS, PLANS, billingState, cancelPlan, createInvoice, getBillingOverview, markInvoicePaid, runBillingJobs, setTenantPlan, voidInvoice } from "./billing";
import { RequestContext } from "../security/permissions";

let admin: RequestContext;
beforeAll(async () => {
  // A real platform admin, because invoices record who raised them
  const [u] = await db.insert(users).values({ email: `admin-${Date.now()}@bill.test`, name: "Admin", isPlatformAdmin: true }).returning();
  admin = { userId: u.id, role: "platform_admin", requestId: "admin", isPlatformAdmin: true };
});
const DAY = 86400_000;

async function shop() {
  const stamp = `bill-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const s = await registerOwnerAndTenant({ email: `owner-${stamp}@bill.test`, password: "Password123!", name: "Bill Owner", businessName: `Bill ${stamp}`, slug: stamp, emailVerified: true });
  const ctx: RequestContext = { userId: s.user.id, tenantId: s.tenant.id, role: "owner", requestId: "bill" };
  return { ...s, ctx, slug: stamp, tag: stamp };
}
const row = async (id: string) => (await db.select().from(tenants).where(eq(tenants.id, id)))[0];

describe("What each status means (FR-113)", () => {
  const base = { plan: "pro", trialEndsAt: null, pastDueSince: null } as const;
  it("keeps everything on during a trial and a short lateness, and pauses growth only after the grace period", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    expect(billingState({ ...base, billingStatus: "active" }, now)).toMatchObject({ restricted: false, message: null });
    const trial = billingState({ ...base, billingStatus: "trialing", trialEndsAt: new Date(now.getTime() + 3 * DAY) }, now);
    expect(trial).toMatchObject({ restricted: false, trialDaysLeft: 3 });
    expect(trial.message).toMatch(/3 days/);
    const late = billingState({ ...base, billingStatus: "past_due", pastDueSince: new Date(now.getTime() - 5 * DAY) }, now);
    expect(late.restricted).toBe(false);
    expect(late.message).toMatch(/overdue/);
    const paused = billingState({ ...base, billingStatus: "past_due", pastDueSince: new Date(now.getTime() - GRACE_DAYS * DAY) }, now);
    expect(paused.restricted).toBe(true);
    expect(paused.message).toMatch(/customers can still earn/i);
    expect(billingState({ ...base, billingStatus: "canceled" }, now).restricted).toBe(true);
  });
});

describe("Plans, trials, invoices and overdue payments (FR-112, FR-113)", () => {
  it("changes plan with the plan's limits, starts a trial, and never removes anyone when the plan shrinks", async () => {
    const s = await shop();
    expect((await getBillingOverview(s.ctx)).plan.id).toBe("free");

    const up = await setTenantPlan(admin, s.tenant.id, { plan: "pro", trialDays: 14, reason: "Sales deal" });
    expect(up).toMatchObject({ plan: "pro", status: "trialing" });
    expect((await row(s.tenant.id)).limits).toMatchObject(PLANS.pro.limits);
    expect((await getBillingOverview(s.ctx)).state.trialDaysLeft).toBe(14);

    // Two extra team members and locations, then back to free: they stay, but the business is flagged over the limit
    await addStaffMember(s.ctx, { email: `a-${s.tag}@bill.test`, name: "A", role: "staff", temporaryPassword: "Password123!" });
    await addStaffMember(s.ctx, { email: `b-${s.tag}@bill.test`, name: "B", role: "staff", temporaryPassword: "Password123!" });
    await createLocation(s.ctx, { name: "Second" });
    const down = await setTenantPlan(admin, s.tenant.id, { plan: "free", reason: "Downgrade" });
    expect(down.overLimit.join(" ")).toMatch(/locations/);
    const overview = await getBillingOverview(s.ctx);
    expect(overview.usage.locations).toMatchObject({ used: 2, limit: 1, over: true });
    // They can't add another past the limit
    await expect(createLocation(s.ctx, { name: "Third" })).rejects.toThrow(/limit reached/i);

    await expect(setTenantPlan(admin, s.tenant.id, { plan: "pro", reason: "  " })).rejects.toThrow(/reason/);
    await expect(setTenantPlan({ ...s.ctx }, s.tenant.id, { plan: "pro", reason: "x" })).rejects.toThrow(/FORBIDDEN/);
  });

  it("makes a business past due when an invoice is late, pauses growth after the grace period, and a payment restores it", async () => {
    const s = await shop();
    await joinProgramme({ tenantSlug: s.slug, email: `yes-${s.tag}@bill.test`, marketingOptIn: true });
    const inv = await createInvoice(admin, s.tenant.id, { description: "Pro, November", amountMinor: 2900, dueInDays: 14 });
    expect(inv.number).toMatch(/^INV-\d{6}-[0-9A-F]{6}$/);
    expect(inv.status).toBe("open");

    await runBillingJobs();
    expect((await row(s.tenant.id)).billingStatus).toBe("active"); // not due yet

    // The due date passes
    const { invoices } = await import("../db/schema");
    await db.update(invoices).set({ dueAt: new Date(Date.now() - 20 * DAY) }).where(eq(invoices.id, inv.id));
    await runBillingJobs();
    expect(await row(s.tenant.id)).toMatchObject({ billingStatus: "past_due" });
    expect((await getBillingOverview(s.ctx)).state).toMatchObject({ status: "past_due", restricted: true });

    // Growth features are paused...
    await expect(sendCampaign(s.ctx, { subject: "Hello again", body: "A note for the regulars here.", audience: {} })).rejects.toThrow(/BILLING_PAUSED|paused/);
    await expect(addStaffMember(s.ctx, { email: `c-${s.tag}@bill.test`, name: "C", role: "staff", temporaryPassword: "Password123!" })).rejects.toThrow(/paused/);
    // ...but customers are not affected, and nothing is deleted
    const member = await joinProgramme({ tenantSlug: s.slug, email: `walk-${s.tag}@bill.test` });
    const earned = await earn(s.ctx, { membershipId: member.membership.id, locationId: s.location.id, amountMinor: 1000, idempotencyKey: crypto.randomUUID() });
    expect(earned.pointsDelta).toBe(10);

    await markInvoicePaid(admin, inv.id);
    expect(await row(s.tenant.id)).toMatchObject({ billingStatus: "active", pastDueSince: null });
    await expect(markInvoicePaid(admin, inv.id)).rejects.toThrow(/isn't open/);
    await expect(sendCampaign(s.ctx, { subject: "Hello again", body: "A note for the regulars here.", audience: {} })).resolves.toBeDefined();
  });

  it("ends a pro trial that wasn't paid, lets a void clear a debt, and cancelling pauses growth but keeps the data", async () => {
    const s = await shop();
    await setTenantPlan(admin, s.tenant.id, { plan: "pro", trialDays: 1, reason: "Trial" });
    await db.update(tenants).set({ trialEndsAt: new Date(Date.now() - 2 * DAY) }).where(eq(tenants.id, s.tenant.id));
    await runBillingJobs();
    expect(await row(s.tenant.id)).toMatchObject({ billingStatus: "past_due" });

    // A void invoice no longer counts against them
    const inv = await createInvoice(admin, s.tenant.id, { description: "Mistake", amountMinor: 500, dueInDays: 0 });
    await voidInvoice(admin, inv.id);
    expect((await getBillingOverview(s.ctx)).invoices.find((i) => i.id === inv.id)?.status).toBe("void");

    await expect(createInvoice(admin, s.tenant.id, { description: "x", amountMinor: 0, dueInDays: 1 })).rejects.toThrow(/above zero/);
    await expect(cancelPlan(admin, s.tenant.id, "")).rejects.toThrow(/reason/);
    await cancelPlan(admin, s.tenant.id, "Asked to leave");
    expect((await getBillingOverview(s.ctx)).state.restricted).toBe(true);
    const member = await joinProgramme({ tenantSlug: s.slug, email: `still-${s.tag}@bill.test` });
    expect(member.membership.id).toBeDefined(); // customers can still join and earn
  });

  it("a free-plan trial simply ends without being charged", async () => {
    const s = await shop();
    await db.update(tenants).set({ billingStatus: "trialing", trialEndsAt: new Date(Date.now() - DAY) }).where(eq(tenants.id, s.tenant.id));
    await runBillingJobs();
    expect(await row(s.tenant.id)).toMatchObject({ billingStatus: "active", trialEndsAt: null });
  });
});
