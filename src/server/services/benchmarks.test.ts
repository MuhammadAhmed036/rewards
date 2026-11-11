import "dotenv/config";
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { tenants } from "../db/schema";
import { registerOwnerAndTenant } from "./tenant";
import { joinProgramme } from "./member";
import { publishRuleVersion } from "./programme";
import { createReward } from "./rewards";
import { earn, requestRedemption, confirmRedemption } from "./ledger";
import { getBenchmarks, participatingFigures, setBenchmarkParticipation } from "./benchmarks";
import { MIN_PEER_SHOPS, metricsFor, quantile, standing } from "@/lib/benchmarks";
import { RequestContext } from "../security/permissions";

describe("Benchmark maths (FR-105)", () => {
  it("finds the typical shop and the middle half, in between neighbours when needed", () => {
    expect(quantile([10, 20, 30, 40, 50], 0.5)).toBe(30);
    expect(quantile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(quantile([10, 20, 30, 40, 50], 0.25)).toBe(20);
    expect(quantile([7], 0.75)).toBe(7);
    expect(() => quantile([], 0.5)).toThrow();
  });

  it("places a shop among the others", () => {
    expect([standing(60, 20, 40, 55), standing(45, 20, 40, 55), standing(25, 20, 40, 55), standing(5, 20, 40, 55)]).toEqual(["top", "above", "below", "bottom"]);
  });

  it("works the three figures out the same way for every shop", () => {
    expect(metricsFor({ buyers: 40, repeaters: 10, purchases: 100, redeemers: 4 })).toEqual({ repeatRate: 25, visitsPerCustomer: 2.5, redemptionRate: 10 });
    expect(metricsFor({ buyers: 0, repeaters: 0, purchases: 0, redeemers: 0 })).toEqual({ repeatRate: 0, visitsPerCustomer: 0, redemptionRate: 0 });
  });
});

async function shop(tag: string) {
  const stamp = `bm-${tag}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const s = await registerOwnerAndTenant({
    email: `owner-${stamp}@bm.test`,
    password: "Password123!",
    name: "Bench Owner",
    businessName: `Bench ${stamp}`,
    slug: stamp,
    emailVerified: true,
  });
  const ctx: RequestContext = { userId: s.user.id, tenantId: s.tenant.id, role: "owner", requestId: "bm" };
  await publishRuleVersion(ctx, {
    earn: { mode: "spend", pointsPerUnit: 1, unitMinor: 100 },
    caps: { maxPointsPerTransaction: 5000, maxPointsPerMemberPerDay: 100000, minMinutesBetweenEarns: 0 },
    exclusions: {},
    expiry: {},
    bonuses: { welcomePoints: 5 },
  });
  return { ...s, ctx, slug: stamp };
}
type Shop = Awaited<ReturnType<typeof shop>>;

const buy = (s: Shop, membershipId: string) =>
  earn(s.ctx, { membershipId, locationId: s.location.id, amountMinor: 1000, idempotencyKey: crypto.randomUUID() });

/** Three customers: one buys twice and uses a reward, two buy once. Welcome bonuses must not count as purchases. */
async function trade(s: Shop) {
  const reward = await createReward(s.ctx, { title: "Tea", costPoints: 10, locationIds: [] });
  const ids: Array<{ id: string; userId: string }> = [];
  for (let i = 0; i < 3; i++) {
    const m = await joinProgramme({ tenantSlug: s.slug, email: `c${i}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@bm.test` });
    ids.push({ id: m.membership.id, userId: m.membership.userId });
  }
  await buy(s, ids[0].id);
  await buy(s, ids[0].id);
  await buy(s, ids[1].id);
  await buy(s, ids[2].id);
  const cust: RequestContext = { userId: ids[0].userId, tenantId: s.tenant.id, role: "customer", requestId: "bm-c" };
  const claim = await requestRedemption(cust, { membershipId: ids[0].id, rewardId: reward.id });
  await confirmRedemption(s.ctx, { code: claim.code, locationId: s.location.id, idempotencyKey: crypto.randomUUID() });
}

describe("Benchmarks (FR-105)", () => {
  it("counts only shops that switched it on, and only purchases", async () => {
    const [on, off, suspended] = [await shop("on"), await shop("off"), await shop("sus")];
    for (const s of [on, off, suspended]) await trade(s);
    await setBenchmarkParticipation(on.ctx, true);
    await setBenchmarkParticipation(suspended.ctx, true);
    await db.update(tenants).set({ status: "suspended" }).where(eq(tenants.id, suspended.tenant.id));

    const figures = await participatingFigures();
    expect(figures.find((f) => f.tenantId === on.tenant.id)).toMatchObject({ buyers: 3, repeaters: 1, purchases: 4, redeemers: 1 });
    expect(figures.find((f) => f.tenantId === off.tenant.id)).toBeUndefined();
    expect(figures.find((f) => f.tenantId === suspended.tenant.id)).toBeUndefined();

    await setBenchmarkParticipation(on.ctx, false);
    expect((await participatingFigures()).find((f) => f.tenantId === on.tenant.id)).toBeUndefined();
  });

  it("shows nothing until the shop takes part, and nothing until enough other shops do", async () => {
    const s = await shop("gate");
    await trade(s);
    const before = await getBenchmarks(s.ctx);
    expect(before).toMatchObject({ participating: false, metrics: [], peers: 0 });
    expect(before.note).toMatch(/Switch this on/);

    await setBenchmarkParticipation(s.ctx, true);
    const alone = await getBenchmarks(s.ctx);
    expect(alone.metrics).toEqual([]);
    expect(alone.note).toMatch(new RegExp(`${MIN_PEER_SHOPS} other shops`));
    expect(alone.methodology.length).toBeGreaterThan(2);
  });

  it("compares a shop with the spread of the others, never one named shop", async () => {
    const mine = await shop("me");
    const peers = [await shop("p1"), await shop("p2")];
    for (const s of [mine, ...peers]) {
      await trade(s);
      await setBenchmarkParticipation(s.ctx, true);
    }

    // Small limits so a handful of shops is enough here; shops always see the published ones
    const result = await getBenchmarks(mine.ctx, { minPeers: 2, minBuyers: 3 });
    expect(result.note).toBeNull();
    expect(result.peers).toBeGreaterThanOrEqual(2);
    const repeat = result.metrics.find((m) => m.key === "repeatRate")!;
    expect(repeat.you).toBe(33.3);
    expect(repeat.middleHalf[0]).toBeLessThanOrEqual(repeat.typical);
    expect(repeat.typical).toBeLessThanOrEqual(repeat.middleHalf[1]);
    expect(["top", "above", "below", "bottom"]).toContain(repeat.standing);

    // Nothing in what a shop receives identifies another shop
    const text = JSON.stringify(result);
    for (const s of peers) {
      expect(text).not.toContain(s.tenant.id);
      expect(text).not.toContain(s.slug);
    }

    await setBenchmarkParticipation(mine.ctx, false);
    for (const s of peers) await setBenchmarkParticipation(s.ctx, false);
  });
});
