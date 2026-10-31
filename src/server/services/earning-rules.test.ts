import "dotenv/config";
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { emailOutbox, ledgerEntries, memberships, tenants } from "../db/schema";
import { registerOwnerAndTenant, createLocation } from "./tenant";
import { joinProgramme } from "./member";
import { publishRuleVersion } from "./programme";
import { earn, previewEarn } from "./ledger";
import { previewAudience } from "./campaigns";
import { runDailyLoyaltyJobs } from "./loyalty-jobs";
import { earnBlockedReason, ruleConfigSchema } from "@/lib/points";
import { RequestContext } from "../security/permissions";

async function shop() {
  const stamp = `rules-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const s = await registerOwnerAndTenant({ email: `owner-${stamp}@rules.test`, password: "Password123!", name: "Rules Owner", businessName: `Rules ${stamp}`, slug: stamp, emailVerified: true });
  const ctx: RequestContext = { userId: s.user.id, tenantId: s.tenant.id, role: "owner", requestId: "rules" };
  return { ...s, ctx, slug: stamp, tag: stamp };
}
const base = { earn: { mode: "spend", pointsPerUnit: 1, unitMinor: 100 }, caps: { minMinutesBetweenEarns: 0, maxPointsPerMemberPerDay: 100000 }, exclusions: {}, expiry: {} };

describe("Where and when points can be earned (FR-022)", () => {
  const parse = (extra: object) => ruleConfigSchema.parse({ ...base, ...extra });

  it("reads the earning window in the shop's own time zone, including windows that cross midnight", () => {
    const weekdays = parse({ earningWindow: { enabled: true, days: [1, 2, 3, 4, 5], from: "09:00", to: "17:00" } });
    // Monday 3 Nov 2026, 12:00 UTC is 12:00 in London (winter) and 21:00 in Tokyo
    const monNoon = new Date("2026-11-02T12:00:00Z");
    expect(earnBlockedReason(weekdays, "loc", monNoon, "Europe/London")).toBeNull();
    expect(earnBlockedReason(weekdays, "loc", monNoon, "Asia/Tokyo")).toMatch(/between 09:00 and 17:00/);
    expect(earnBlockedReason(weekdays, "loc", new Date("2026-11-07T12:00:00Z"), "Europe/London")).toMatch(/Mon, Tue, Wed, Thu, Fri/); // a Saturday
    const night = parse({ earningWindow: { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], from: "22:00", to: "02:00" } });
    expect(earnBlockedReason(night, "loc", new Date("2026-11-02T23:30:00Z"), "Europe/London")).toBeNull();
    expect(earnBlockedReason(night, "loc", new Date("2026-11-03T01:00:00Z"), "Europe/London")).toBeNull();
    expect(earnBlockedReason(night, "loc", new Date("2026-11-03T12:00:00Z"), "Europe/London")).not.toBeNull();
    expect(earnBlockedReason(parse({}), "loc", monNoon, "Europe/London")).toBeNull(); // off by default
  });

  it("only allows the chosen locations", () => {
    const only = parse({ locationEligibility: ["a"] });
    expect(earnBlockedReason(only, "a", new Date(), "UTC")).toBeNull();
    expect(earnBlockedReason(only, "b", new Date(), "UTC")).toMatch(/can't be earned at this location/);
    expect(earnBlockedReason(parse({ locationEligibility: "all" }), "b", new Date(), "UTC")).toBeNull();
  });

  it("is enforced by the server at the till: preview and earn both refuse a location that isn't included", async () => {
    const s = await shop();
    const branch = await createLocation(s.ctx, { name: "Pop-up" });
    await publishRuleVersion(s.ctx, { ...base, locationEligibility: [s.location.id] });
    const m = await joinProgramme({ tenantSlug: s.slug, email: `el-${s.tag}@rules.test` });
    await expect(previewEarn(s.ctx, { membershipId: m.membership.id, locationId: branch.id, amountMinor: 500 })).rejects.toThrow(/NOT_ELIGIBLE/);
    await expect(earn(s.ctx, { membershipId: m.membership.id, locationId: branch.id, amountMinor: 500, idempotencyKey: crypto.randomUUID() })).rejects.toThrow(/NOT_ELIGIBLE/);
    expect((await earn(s.ctx, { membershipId: m.membership.id, locationId: s.location.id, amountMinor: 500, idempotencyKey: crypto.randomUUID() })).pointsDelta).toBe(5);
    // A rule can't name another business's location
    const other = await shop();
    await expect(publishRuleVersion(s.ctx, { ...base, locationEligibility: [other.location.id] })).rejects.toThrow(/isn't part of your business/);
  });

  it("refuses to earn outside the window and says when it is allowed", async () => {
    const s = await shop();
    await db.update(tenants).set({ timezone: "Europe/London" }).where(eq(tenants.id, s.tenant.id));
    // A window that is never open today: every day except today
    const today = new Date().getUTCDay();
    await publishRuleVersion(s.ctx, { ...base, earningWindow: { enabled: true, days: [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== today && d !== (today + 6) % 7 && d !== (today + 1) % 7), from: "00:00", to: "23:59" } });
    const m = await joinProgramme({ tenantSlug: s.slug, email: `win-${s.tag}@rules.test` });
    await expect(earn(s.ctx, { membershipId: m.membership.id, locationId: s.location.id, amountMinor: 500, idempotencyKey: crypto.randomUUID() })).rejects.toThrow(/NOT_ELIGIBLE: Points can only be earned on/);
    await publishRuleVersion(s.ctx, { ...base, earningWindow: { enabled: false } });
    await expect(earn(s.ctx, { membershipId: m.membership.id, locationId: s.location.id, amountMinor: 500, idempotencyKey: crypto.randomUUID() })).resolves.toBeDefined();
  });

  it("leaves out the part of a bill that doesn't qualify, such as a gift card", async () => {
    const s = await shop();
    await publishRuleVersion(s.ctx, base);
    const m = await joinProgramme({ tenantSlug: s.slug, email: `ex-${s.tag}@rules.test` });
    const p = await previewEarn(s.ctx, { membershipId: m.membership.id, locationId: s.location.id, amountMinor: 3000, tipMinor: 200, excludedMinor: 1000 });
    expect(p.pointsToAward).toBe(18); // 30.00 - 2.00 tip - 10.00 not eligible
    const done = await earn(s.ctx, { membershipId: m.membership.id, locationId: s.location.id, amountMinor: 3000, tipMinor: 200, excludedMinor: 1000, idempotencyKey: crypto.randomUUID() });
    expect(done.pointsDelta).toBe(18);
    const [entry] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.id, done.entryId));
    expect(entry.basisAmountMinor).toBe(3000);
  });
});

describe("Campaign segments (FR-091)", () => {
  it("picks people by where they earned, their level, and how much they earned lately", async () => {
    const s = await shop();
    const branch = await createLocation(s.ctx, { name: "Second branch" });
    await publishRuleVersion(s.ctx, { ...base, tiers: { enabled: true, qualificationMonths: 12, levels: [{ name: "Silver", minPoints: 20, earnPercent: 100 }, { name: "Gold", minPoints: 100, earnPercent: 100 }] } });
    const join = (n: string) => joinProgramme({ tenantSlug: s.slug, email: `${n}-${s.tag}@rules.test`, marketingOptIn: true });
    const none = await join("none");
    const silver = await join("silver");
    const gold = await join("gold");
    const buy = (id: string, loc: string, amountMinor: number) => earn(s.ctx, { membershipId: id, locationId: loc, amountMinor, idempotencyKey: crypto.randomUUID() });
    await buy(none.membership.id, s.location.id, 500); // 5
    await buy(silver.membership.id, branch.id, 3000); // 30
    await buy(gold.membership.id, s.location.id, 15000); // 150 (cap permitting)

    expect((await previewAudience(s.ctx, {})).recipients).toBe(3);
    expect((await previewAudience(s.ctx, { tier: "Silver" })).recipients).toBe(1);
    expect((await previewAudience(s.ctx, { tier: "Gold" })).recipients).toBe(1);
    expect((await previewAudience(s.ctx, { tier: "none" })).recipients).toBe(1);
    expect((await previewAudience(s.ctx, { tier: "Platinum" })).recipients).toBe(0); // no such level
    expect((await previewAudience(s.ctx, { locationIds: [branch.id] })).recipients).toBe(1); // earned at the branch
    expect((await previewAudience(s.ctx, { locationIds: [s.location.id] })).recipients).toBe(2);
    expect((await previewAudience(s.ctx, { minEarned: { points: 20, withinDays: 30 } })).recipients).toBe(2);
    expect((await previewAudience(s.ctx, { minEarned: { points: 20, withinDays: 30 }, tier: "Gold" })).recipients).toBe(1);

    // A shop with no levels has nobody "in" one
    await publishRuleVersion(s.ctx, base);
    expect((await previewAudience(s.ctx, { tier: "Silver" })).recipients).toBe(0);
  });
});

describe("Automatic 'we miss you' email (FR-092)", () => {
  it("emails only quiet customers who said yes, once per quiet spell, and not at all when the shop hasn't switched it on", async () => {
    const s = await shop();
    await publishRuleVersion(s.ctx, { ...base, journeys: { inactivityDays: 30 } });
    const yesQuiet = await joinProgramme({ tenantSlug: s.slug, email: `quiet-${s.tag}@rules.test`, marketingOptIn: true });
    const yesActive = await joinProgramme({ tenantSlug: s.slug, email: `active-${s.tag}@rules.test`, marketingOptIn: true });
    const noQuiet = await joinProgramme({ tenantSlug: s.slug, email: `nope-${s.tag}@rules.test`, marketingOptIn: false });
    const longAgo = new Date(Date.now() - 60 * 86400_000);
    for (const m of [yesQuiet, noQuiet]) await db.update(memberships).set({ joinedAt: longAgo }).where(eq(memberships.id, m.membership.id));
    expect(yesActive.membership.id).toBeDefined();

    const emails = async () => (await db.select().from(emailOutbox).where(eq(emailOutbox.tenantId, s.tenant.id))).filter((e) => (e.payload as { journey?: string }).journey);
    // (Other tests run the same daily job at the same time, so check the result rather than who ran it)
    await runDailyLoyaltyJobs();
    let sent = await emails();
    expect(sent.map((e) => e.toEmail)).toEqual([`quiet-${s.tag}@rules.test`]);
    expect(sent[0].kind).toBe("marketing");
    expect((sent[0].payload as { unsubscribeUrl?: string }).unsubscribeUrl).toContain("/unsubscribe");

    // Running again the same day sends nothing more
    await runDailyLoyaltyJobs();
    expect(await emails()).toHaveLength(1);

    // Off by default
    const quietShop = await shop();
    await publishRuleVersion(quietShop.ctx, base);
    const other = await joinProgramme({ tenantSlug: quietShop.slug, email: `off-${s.tag}@rules.test`, marketingOptIn: true });
    await db.update(memberships).set({ joinedAt: longAgo }).where(eq(memberships.id, other.membership.id));
    await runDailyLoyaltyJobs();
    expect((await db.select().from(emailOutbox).where(eq(emailOutbox.tenantId, quietShop.tenant.id))).filter((e) => (e.payload as { journey?: string }).journey)).toHaveLength(0);
    sent = await emails();
    expect(sent).toHaveLength(1);
  });
});
