import "dotenv/config";
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { redemptions, rewards, membershipBalances } from "../db/schema";
import { registerOwnerAndTenant } from "./tenant";
import { joinProgramme } from "./member";
import { publishRuleVersion } from "./programme";
import { createReward, getRewards, updateReward } from "./rewards";
import { earn, requestRedemption, confirmRedemption, cancelRedemptionRequest } from "./ledger";
import { partialValueMinor } from "@/lib/partial-reward";
import { RequestContext } from "../security/permissions";

async function shop() {
  const stamp = `pr-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const s = await registerOwnerAndTenant({
    email: `owner-${stamp}@pr.test`,
    password: "Password123!",
    name: "Hold Owner",
    businessName: `Hold ${stamp}`,
    slug: stamp,
    emailVerified: true,
  });
  const ctx: RequestContext = { userId: s.user.id, tenantId: s.tenant.id, role: "owner", requestId: "pr" };
  await publishRuleVersion(ctx, {
    earn: { mode: "spend", pointsPerUnit: 1, unitMinor: 100 },
    caps: { maxPointsPerTransaction: 5000, maxPointsPerMemberPerDay: 100000, minMinutesBetweenEarns: 0 },
    exclusions: {},
    expiry: {},
    bonuses: { welcomePoints: 0 },
  });
  return { ...s, ctx };
}

type Shop = Awaited<ReturnType<typeof shop>>;

/** A customer with exactly `points` points. */
async function customer(s: Shop, points: number) {
  const m = await joinProgramme({ tenantSlug: s.tenant.slug, email: `c-${Date.now()}-${Math.floor(Math.random() * 100000)}@pr.test` });
  await earn(s.ctx, { membershipId: m.membership.id, locationId: s.location.id, amountMinor: points * 100, idempotencyKey: crypto.randomUUID() });
  const ctx: RequestContext = { userId: m.membership.userId, tenantId: s.tenant.id, role: "customer", requestId: "pr-c" };
  return { membershipId: m.membership.id, ctx };
}

const claim = (c: Awaited<ReturnType<typeof customer>>, rewardId: string, points?: number) =>
  requestRedemption(c.ctx, { membershipId: c.membershipId, rewardId, points });

describe("Reservations (FR-066)", () => {
  it("holds the points of an open claim until it is cancelled or runs out", async () => {
    const s = await shop();
    const reward = await createReward(s.ctx, { title: "Big cake", costPoints: 80, locationIds: [] });
    const c = await customer(s, 100);

    const first = await claim(c, reward.id);
    // 100 points, 80 held: a second claim for 80 can't be made, and the menu shows only 20 as free
    await expect(claim(c, reward.id)).rejects.toThrow(/INSUFFICIENT_BALANCE.*20 available.*80 are held/);
    const [seen] = await getRewards(s.tenant.id, { memberBalance: 100, membershipId: c.membershipId });
    expect(seen.availablePoints).toBe(20);
    expect(seen.eligible).toBe(false);

    // Giving it back frees the points straight away
    expect(await cancelRedemptionRequest(c.ctx, first.redemptionId)).toEqual({ cancelled: true })
    await claim(c, reward.id);

    // A claim that runs out stops holding anything
    await db.update(redemptions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(redemptions.membershipId, c.membershipId));
    await claim(c, reward.id);
  });

  it("holds the shop's limited stock for the customer who claimed, then frees it", async () => {
    const s = await shop();
    const reward = await createReward(s.ctx, { title: "Last cake", costPoints: 10, quantityTotal: 1, locationIds: [] });
    const [a, b, c] = [await customer(s, 50), await customer(s, 50), await customer(s, 50)];

    const held = await claim(a, reward.id);
    await expect(claim(b, reward.id)).rejects.toThrow(/on hold for other customers/);
    const [seenByB] = await getRewards(s.tenant.id, { memberBalance: 50, membershipId: b.membershipId });
    expect(seenByB.unavailableReason).toMatch(/On hold/);

    await cancelRedemptionRequest(a.ctx, held.redemptionId);
    const mine = await claim(b, reward.id);
    await confirmRedemption(s.ctx, { code: mine.code, locationId: s.location.id, idempotencyKey: crypto.randomUUID() });
    await expect(claim(c, reward.id)).rejects.toThrow(/out of stock/);
    const [row] = await db.select().from(rewards).where(eq(rewards.id, reward.id));
    expect(row.quantityRedeemed).toBe(1);
  });

  it("lets only one of two claims made at the same moment take the points", async () => {
    const s = await shop();
    const reward = await createReward(s.ctx, { title: "Race cake", costPoints: 80, locationIds: [] });
    const c = await customer(s, 100);
    const results = await Promise.allSettled([claim(c, reward.id), claim(c, reward.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });

  it("keeps the claim for as long as the reward says, and counts open claims towards a per-customer limit", async () => {
    const s = await shop();
    const reward = await createReward(s.ctx, { title: "Pre-order", costPoints: 10, holdMinutes: 120, perMemberLimit: 1, locationIds: [] });
    const c = await customer(s, 100);
    const first = await claim(c, reward.id);
    const minutes = (first.expiresAt.getTime() - Date.now()) / 60000;
    expect(minutes).toBeGreaterThan(118);
    expect(minutes).toBeLessThanOrEqual(120);
    await expect(claim(c, reward.id)).rejects.toThrow(/limit of 1/);
    await expect(createReward(s.ctx, { title: "Bad", costPoints: 10, holdMinutes: 5000 })).rejects.toThrow(/24 hours/);
  });

  it("only the customer who made a claim can give it back, and a used claim can't be cancelled", async () => {
    const s = await shop();
    const reward = await createReward(s.ctx, { title: "Tea", costPoints: 10, locationIds: [] });
    const [a, b] = [await customer(s, 50), await customer(s, 50)];
    const mine = await claim(a, reward.id);
    await expect(cancelRedemptionRequest(b.ctx, mine.redemptionId)).rejects.toThrow(/not found/);
    await confirmRedemption(s.ctx, { code: mine.code, locationId: s.location.id, idempotencyKey: crypto.randomUUID() });
    await expect(cancelRedemptionRequest(a.ctx, mine.redemptionId)).rejects.toThrow(/already used/);
  });
});

describe("Partial redemption (FR-066)", () => {
  it("rounds the value down so the shop never gives more than the points paid for", () => {
    expect(partialValueMinor(500, 500, 250)).toBe(250);
    expect(partialValueMinor(100, 3, 1)).toBe(33);
    expect(partialValueMinor(999, 1000, 999)).toBe(998);
  });

  it("gives a proportional part of the value for part of the points, and doesn't use up stock", async () => {
    const s = await shop();
    const reward = await createReward(s.ctx, {
      title: "£5 voucher",
      type: "fixed_value",
      costPoints: 500,
      allowPartial: true,
      valueMinor: 500,
      minPartialPoints: 100,
      quantityTotal: 3,
      perMemberLimit: 1,
      locationIds: [],
    });
    const c = await customer(s, 300);

    const part = await claim(c, reward.id, 250);
    expect(part).toMatchObject({ isPartial: true, costPoints: 250, valueMinor: 250 });
    const done = await confirmRedemption(s.ctx, { code: part.code, locationId: s.location.id, idempotencyKey: crypto.randomUUID() });
    expect(done).toMatchObject({ pointsDeducted: 250, isPartial: true, valueMinor: 250, newBalance: 50 });

    const [row] = await db.select().from(rewards).where(eq(rewards.id, reward.id));
    expect(row.quantityRedeemed).toBe(0);
    // A part use doesn't count as "having had" a reward limited to once per customer
    const [bal] = await db.select().from(membershipBalances).where(eq(membershipBalances.membershipId, c.membershipId));
    expect(bal.balance).toBe(50);
  });

  it("refuses amounts that aren't allowed", async () => {
    const s = await shop();
    const partial = await createReward(s.ctx, {
      title: "Voucher",
      costPoints: 500,
      allowPartial: true,
      valueMinor: 500,
      minPartialPoints: 100,
      locationIds: [],
    });
    const whole = await createReward(s.ctx, { title: "Whole only", costPoints: 100, locationIds: [] });
    const c = await customer(s, 400);

    await expect(claim(c, partial.id, 50)).rejects.toThrow(/at least 100/);
    await expect(claim(c, partial.id, 12.5)).rejects.toThrow(/whole number/);
    await expect(claim(c, partial.id, 600)).rejects.toThrow(/more than the 500/);
    // More than the customer has: the balance check still applies to a part
    await expect(claim(c, partial.id, 450)).rejects.toThrow(/INSUFFICIENT_BALANCE/);
    await expect(claim(c, whole.id, 40)).rejects.toThrow(/in full/);
    // Asking for exactly the full cost is a normal claim
    expect(await claim(c, whole.id, 100)).toMatchObject({ isPartial: false, costPoints: 100 });
  });

  it("offers a part to a customer who can't afford the whole reward, and needs the value set up", async () => {
    const s = await shop();
    const reward = await createReward(s.ctx, {
      title: "Voucher",
      costPoints: 500,
      allowPartial: true,
      valueMinor: 500,
      minPartialPoints: 100,
      locationIds: [],
    });
    const poor = await customer(s, 150);
    const [seen] = await getRewards(s.tenant.id, { memberBalance: 150, membershipId: poor.membershipId });
    expect(seen).toMatchObject({ eligible: true, fullyEligible: false, pointsShortfall: 350 });
    const tooPoor = await customer(s, 50);
    const [none] = await getRewards(s.tenant.id, { memberBalance: 50, membershipId: tooPoor.membershipId });
    expect(none.eligible).toBe(false);

    await expect(createReward(s.ctx, { title: "No value", costPoints: 500, allowPartial: true, minPartialPoints: 100 })).rejects.toThrow(/worth/);
    await expect(createReward(s.ctx, { title: "No min", costPoints: 500, allowPartial: true, valueMinor: 500 })).rejects.toThrow(/smallest/);
    await expect(updateReward(s.ctx, reward.id, { minPartialPoints: 500 })).rejects.toThrow(/less than the full cost/);
  });
});
