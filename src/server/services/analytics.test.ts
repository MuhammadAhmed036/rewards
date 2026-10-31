import "dotenv/config";
import { describe, it, expect } from "vitest";
import { db } from "../db";
import { ledgerEntries } from "../db/schema";
import { registerOwnerAndTenant, createLocation } from "./tenant";
import { joinProgramme } from "./member";
import { publishRuleVersion } from "./programme";
import { createReward } from "./rewards";
import { earn, requestRedemption, confirmRedemption } from "./ledger";
import { getAnalytics } from "./analytics";
import { RequestContext } from "../security/permissions";

async function shop() {
  const stamp = `an-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const s = await registerOwnerAndTenant({
    email: `owner-${stamp}@an.test`,
    password: "Password123!",
    name: "Analytics Owner",
    businessName: `Analytics ${stamp}`,
    slug: stamp,
    emailVerified: true,
  });
  const ctx: RequestContext = { userId: s.user.id, tenantId: s.tenant.id, role: "owner", requestId: "an" };
  await publishRuleVersion(ctx, {
    earn: { mode: "spend", pointsPerUnit: 1, unitMinor: 100 },
    caps: { maxPointsPerTransaction: 1000, maxPointsPerMemberPerDay: 100000, minMinutesBetweenEarns: 0 },
    exclusions: {},
    expiry: {},
    bonuses: { welcomePoints: 5 },
  });
  return { ...s, ctx, slug: stamp };
}

describe("Insights (FR-102, FR-103)", () => {
  it("works out repeat rate, earn-to-redeem, locations and the previous-period comparison from the ledger", async () => {
    const s = await shop();
    const branch = await createLocation(s.ctx, { name: "Second branch" });
    const buy = (membershipId: string, locationId: string, amountMinor: number) =>
      earn(s.ctx, { membershipId, locationId, amountMinor, idempotencyKey: crypto.randomUUID() });

    const regular = await joinProgramme({ tenantSlug: s.slug, email: `reg-${Date.now()}@an.test` });
    const once = await joinProgramme({ tenantSlug: s.slug, email: `once-${Date.now()}@an.test` });
    await joinProgramme({ tenantSlug: s.slug, email: `lurker-${Date.now()}@an.test` }); // never buys

    await buy(regular.membership.id, s.location.id, 1000);
    await buy(regular.membership.id, branch.id, 2000);
    await buy(once.membership.id, s.location.id, 500);

    // The regular uses a reward
    const reward = await createReward(s.ctx, { title: "Free tea", type: "free_item", costPoints: 5, locationIds: [] });
    const custCtx: RequestContext = { userId: regular.membership.userId, tenantId: s.tenant.id, role: "customer", requestId: "an-c" };
    const request = await requestRedemption(custCtx, { membershipId: regular.membership.id, rewardId: reward.id });
    await confirmRedemption(s.ctx, { code: request.code, locationId: s.location.id, idempotencyKey: crypto.randomUUID() });

    const a = await getAnalytics(s.ctx, "30d");

    // Two customers bought; one of them twice
    expect(a.repeat).toMatchObject({ buyers: 2, repeaters: 1, ratePercent: 50 });
    // Two ever bought, one ever redeemed
    expect(a.earnToRedeem).toMatchObject({ earners: 2, redeemers: 1, ratePercent: 50 });
    // Three joined, three bought or redeemed (the lurker only got a welcome bonus, which is not a visit)
    expect(a.comparison.current.newMembers).toBe(3);
    expect(a.comparison.current.purchases).toBe(3);
    expect(a.comparison.current.redemptions).toBe(1);
    // Nothing happened in the period before this one
    expect(a.comparison.previous).toMatchObject({ newMembers: 0, purchases: 0 });

    // Locations side by side: main has 2 purchases, the branch 1
    const main = a.locations.find((l) => l.id === s.location.id)!;
    const second = a.locations.find((l) => l.id === branch.id)!;
    expect(main).toMatchObject({ purchases: 2, customers: 2, redemptions: 1 });
    expect(second).toMatchObject({ purchases: 1, customers: 1, redemptions: 0 });

    // This month's cohort has just joined, so it has no "next month" result yet
    expect(a.cohorts.at(-1)).toMatchObject({ size: 3, month1: null });
    expect(a.definitions.repeatRate).toBeTruthy();
    expect(a.timezone).toBe("Europe/London");
  });

  it("counts expired points as breakage and treats bonuses as not-a-visit", async () => {
    const s = await shop();
    const m = await joinProgramme({ tenantSlug: s.slug, email: `brk-${Date.now()}@an.test` });
    await earn(s.ctx, { membershipId: m.membership.id, locationId: s.location.id, amountMinor: 2000, idempotencyKey: crypto.randomUUID() });
    // 20 purchase points + 5 welcome = 25 awarded; expire 10 of them
    await db.insert(ledgerEntries).values({
      tenantId: s.tenant.id,
      membershipId: m.membership.id,
      type: "expire",
      pointsDelta: -10,
      idempotencyKey: `expire-test-${Date.now()}`,
    });
    const a = await getAnalytics(s.ctx, "all");
    expect(a.breakage).toMatchObject({ awarded: 25, expired: 10, ratePercent: 40 });
    expect(a.comparison.current.purchases).toBe(1); // the welcome bonus is not a purchase
    expect(a.comparison.previous).toBeNull(); // no "before" for all time
  });

  it("measures an offer by who bought within the window after it went out", async () => {
    const { sendCampaign } = await import("./campaigns");
    const { processOutbox } = await import("./email");
    const s = await shop();
    const buyer = await joinProgramme({ tenantSlug: s.slug, email: `buyer-${Date.now()}@an.test`, marketingOptIn: true });
    await joinProgramme({ tenantSlug: s.slug, email: `quiet-${Date.now()}@an.test`, marketingOptIn: true });
    const c = await sendCampaign(s.ctx, { subject: "Come back", body: "We miss you, come in this week.", audience: {} });
    await processOutbox(50); // deliver the emails
    // Only one of the two buys after the offer
    await earn(s.ctx, { membershipId: buyer.membership.id, locationId: s.location.id, amountMinor: 1500, idempotencyKey: crypto.randomUUID() });

    const a = await getAnalytics(s.ctx, "30d");
    const row = a.campaigns.find((x) => x.id === c.id)!;
    expect(row.reached).toBe(2);
    expect(row.converted).toBe(1);
    expect(row.ratePercent).toBe(50);
  });

  it("keeps a location-scoped manager to their own locations, and needs the analytics permission", async () => {
    const s = await shop();
    const branch = await createLocation(s.ctx, { name: "Not theirs" });
    const scoped: RequestContext = { ...s.ctx, role: "manager", locationIds: [s.location.id] };
    const a = await getAnalytics(scoped, "30d");
    expect(a.locations.map((l) => l.id)).toEqual([s.location.id]);
    expect(a.locations.some((l) => l.id === branch.id)).toBe(false);

    await expect(getAnalytics({ ...s.ctx, role: "staff" }, "30d")).rejects.toThrow(/FORBIDDEN/);
  });
});
