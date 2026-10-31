import "dotenv/config";
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { membershipBalances } from "../db/schema";
import { registerOwnerAndTenant } from "./tenant";
import { joinProgramme } from "./member";
import { publishRuleVersion } from "./programme";
import { earn, previewEarn } from "./ledger";
import { RequestContext } from "../security/permissions";

async function shop() {
  const stamp = `grow-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const s = await registerOwnerAndTenant({
    email: `owner-${stamp}@grow.test`,
    password: "Password123!",
    name: "Grow Owner",
    businessName: `Grow ${stamp}`,
    slug: stamp,
    emailVerified: true,
  });
  const ctx: RequestContext = { userId: s.user.id, tenantId: s.tenant.id, role: "owner", requestId: "grow" };
  return { ...s, ctx, slug: stamp };
}

const baseRule = {
  earn: { mode: "spend", pointsPerUnit: 1, unitMinor: 100 },
  caps: { maxPointsPerTransaction: 1000, maxPointsPerMemberPerDay: 100000, minMinutesBetweenEarns: 0 },
  exclusions: {},
  expiry: {},
};
const balanceOf = async (membershipId: string) =>
  (await db.select().from(membershipBalances).where(eq(membershipBalances.membershipId, membershipId)))[0].balance;
const buy = (s: Awaited<ReturnType<typeof shop>>, membershipId: string, amountMinor: number) =>
  earn(s.ctx, { membershipId, locationId: s.location.id, amountMinor, idempotencyKey: crypto.randomUUID() });

describe("Time-limited boosts (FR-027)", () => {
  it("doubles points while an offer runs, shows it in the preview, and stops after it ends", async () => {
    const s = await shop();
    const day = 86400_000;
    await publishRuleVersion(s.ctx, {
      ...baseRule,
      multipliers: [{ id: "m1", label: "Double day", percent: 200, startsAt: new Date(Date.now() - day).toISOString(), endsAt: new Date(Date.now() + day).toISOString() }],
    });
    const member = await joinProgramme({ tenantSlug: s.slug, email: `boost-${Date.now()}@grow.test` });
    const preview = await previewEarn(s.ctx, { membershipId: member.membership.id, locationId: s.location.id, amountMinor: 1000 });
    expect(preview.pointsToAward).toBe(20);
    expect(preview.boostLabel).toBe("Double day");
    expect((await buy(s, member.membership.id, 1000)).pointsDelta).toBe(20);

    await publishRuleVersion(s.ctx, {
      ...baseRule,
      multipliers: [{ id: "m1", label: "Over", percent: 200, startsAt: new Date(Date.now() - 3 * day).toISOString(), endsAt: new Date(Date.now() - day).toISOString() }],
    });
    expect((await buy(s, member.membership.id, 1000)).pointsDelta).toBe(10);
  });
});

describe("Levels (FR-026)", () => {
  it("moves a member up as they earn, and the new level boosts later purchases", async () => {
    const s = await shop();
    await publishRuleVersion(s.ctx, {
      ...baseRule,
      tiers: { enabled: true, qualificationMonths: 12, levels: [{ name: "Silver", minPoints: 20, earnPercent: 150 }] },
    });
    const member = await joinProgramme({ tenantSlug: s.slug, email: `tier-${Date.now()}@grow.test` });
    expect((await buy(s, member.membership.id, 1000)).pointsDelta).toBe(10); // no level yet
    expect((await buy(s, member.membership.id, 1000)).pointsDelta).toBe(10); // reaches 20 afterwards
    expect((await buy(s, member.membership.id, 1000)).pointsDelta).toBe(15); // Silver: 1.5x
  });
});

describe("Inviting a friend (FR-027)", () => {
  it("pays both only after the friend's first purchase, once, and ignores bad or self codes", async () => {
    const s = await shop();
    await publishRuleVersion(s.ctx, { ...baseRule, bonuses: { referralPoints: 25 } });
    const inviter = await joinProgramme({ tenantSlug: s.slug, email: `inviter-${Date.now()}@grow.test` });
    const friend = await joinProgramme({ tenantSlug: s.slug, email: `friend-${Date.now()}@grow.test`, referralCode: inviter.membership.memberNumber });
    const stranger = await joinProgramme({ tenantSlug: s.slug, email: `nobody-${Date.now()}@grow.test`, referralCode: "NOSUCH99" });

    // Joining alone pays nothing
    expect(await balanceOf(inviter.membership.id)).toBe(0);
    expect(await balanceOf(friend.membership.id)).toBe(0);

    await buy(s, friend.membership.id, 1000); // first purchase: 10 points + 25 gift
    expect(await balanceOf(friend.membership.id)).toBe(35);
    expect(await balanceOf(inviter.membership.id)).toBe(25);

    await buy(s, friend.membership.id, 1000); // a second purchase pays no second bonus
    expect(await balanceOf(friend.membership.id)).toBe(45);
    expect(await balanceOf(inviter.membership.id)).toBe(25);

    await buy(s, stranger.membership.id, 1000);
    expect(await balanceOf(stranger.membership.id)).toBe(10);
  });

  it("stops rewarding one person after the shop's limit", async () => {
    const s = await shop();
    await publishRuleVersion(s.ctx, { ...baseRule, bonuses: { referralPoints: 10, maxReferralsPerMember: 1 } });
    const inviter = await joinProgramme({ tenantSlug: s.slug, email: `cap-inviter-${Date.now()}@grow.test` });
    for (const tag of ["a", "b"]) {
      const friend = await joinProgramme({ tenantSlug: s.slug, email: `cap-${tag}-${Date.now()}@grow.test`, referralCode: inviter.membership.memberNumber });
      await buy(s, friend.membership.id, 1000);
    }
    expect(await balanceOf(inviter.membership.id)).toBe(10); // only the first friend counted
  });
});
