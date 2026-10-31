import { describe, it, expect } from "vitest";
import { calculatePoints, activeMultiplier, tierFor, ruleConfigSchema, RuleConfig } from "./points";

describe("Points Calculation Pure Function (M2)", () => {
  const defaultSpendRule: RuleConfig = {
    earn: {
      mode: "spend",
      pointsPerUnit: 1,
      unitMinor: 100, // 1 point per £1 (100 pence)
      rounding: "down",
      minEligibleMinor: 0,
      pointsPerVisit: 1,
    },
    caps: {
      maxPointsPerTransaction: 500,
      maxPointsPerMemberPerDay: 1000,
      minMinutesBetweenEarns: 30,
    },
    exclusions: {
      excludeTips: true,
    },
    expiry: {
      enabled: false,
      months: 12,
      warnDays: 30,
    },
    locationEligibility: "all",
    locationOverrides: {},
    earningWindow: { enabled: false, days: [0, 1, 2, 3, 4, 5, 6], from: "00:00", to: "23:59" },
    journeys: { inactivityDays: 0 },
    multipliers: [],
    tiers: { enabled: false, qualificationMonths: 12, levels: [] },
    bonuses: { welcomePoints: 0, birthdayPoints: 0, referralPoints: 0, maxReferralsPerMember: 20 },
  };

  it("calculates points for £18.70 (1870p) with rounding down -> 18 points per spec", () => {
    const result = calculatePoints({
      amountMinor: 1870,
      rule: defaultSpendRule,
    });

    expect(result.points).toBe(18);
    expect(result.eligibleMinor).toBe(1870);
    expect(result.cappedByTransaction).toBe(false);
  });

  it("supports rounding nearest", () => {
    const ruleNearest: RuleConfig = {
      ...defaultSpendRule,
      earn: { ...defaultSpendRule.earn, rounding: "nearest" },
    };

    // £18.70 rounds up to 19 units
    const res1 = calculatePoints({ amountMinor: 1870, rule: ruleNearest });
    expect(res1.points).toBe(19);

    // £18.20 rounds down to 18 units
    const res2 = calculatePoints({ amountMinor: 1820, rule: ruleNearest });
    expect(res2.points).toBe(18);
  });

  it("excludes tips when excludeTips is true", () => {
    const result = calculatePoints({
      amountMinor: 2500, // £25.00 total
      tipMinor: 500, // £5.00 tip
      rule: defaultSpendRule,
    });

    expect(result.eligibleMinor).toBe(2000); // £20.00 eligible
    expect(result.points).toBe(20);
  });

  it("returns 0 points if eligible spend is below minEligibleMinor", () => {
    const ruleWithMin: RuleConfig = {
      ...defaultSpendRule,
      earn: { ...defaultSpendRule.earn, minEligibleMinor: 1000 }, // £10 min spend
    };

    const result = calculatePoints({
      amountMinor: 850, // £8.50
      rule: ruleWithMin,
    });

    expect(result.points).toBe(0);
  });

  it("applies per-transaction cap", () => {
    const ruleCap: RuleConfig = {
      ...defaultSpendRule,
      caps: { ...defaultSpendRule.caps, maxPointsPerTransaction: 100 },
    };

    const result = calculatePoints({
      amountMinor: 15000, // £150 -> 150 points uncapped
      rule: ruleCap,
    });

    expect(result.points).toBe(100);
    expect(result.cappedByTransaction).toBe(true);
  });

  it("applies daily member points cap", () => {
    const result = calculatePoints({
      amountMinor: 20000, // £200 -> 200 points
      alreadyEarnedTodayInTenantTz: 950, // daily cap is 1000, only 50 capacity left
      rule: defaultSpendRule,
    });

    expect(result.points).toBe(50);
    expect(result.cappedByDailyLimit).toBe(true);
  });

  it("supports visit mode (stamps)", () => {
    const visitRule: RuleConfig = {
      ...defaultSpendRule,
      earn: {
        ...defaultSpendRule.earn,
        mode: "visit",
        pointsPerVisit: 1,
      },
    };

    const result = calculatePoints({
      amountMinor: 450, // £4.50 coffee
      rule: visitRule,
    });

    expect(result.points).toBe(1);
  });
});

describe("Boosts and levels (FR-026, FR-027)", () => {
  const base = ruleConfigSchema.parse({ earn: { pointsPerUnit: 1, unitMinor: 100 }, caps: {}, exclusions: {}, expiry: {} });
  const friday = new Date("2026-11-06T12:00:00Z");
  const withBoost = ruleConfigSchema.parse({
    ...base,
    multipliers: [
      { id: "a", label: "Double Fridays", percent: 200, startsAt: "2026-11-06T00:00:00Z", endsAt: "2026-11-06T23:59:59Z" },
      { id: "b", label: "Small boost", percent: 120, startsAt: "2026-11-01T00:00:00Z", endsAt: "2026-11-30T23:59:59Z" },
    ],
  });

  it("applies the strongest running boost, and none outside its dates", () => {
    expect(activeMultiplier(withBoost, friday)).toEqual({ percent: 200, label: "Double Fridays" });
    expect(activeMultiplier(withBoost, new Date("2026-11-07T12:00:00Z")).percent).toBe(120);
    expect(activeMultiplier(withBoost, new Date("2027-01-01T00:00:00Z")).percent).toBe(100);
    expect(calculatePoints({ amountMinor: 1870, rule: withBoost, at: friday }).points).toBe(36); // 18 x 2
    expect(calculatePoints({ amountMinor: 1870, rule: withBoost, at: new Date("2027-01-01T00:00:00Z") }).points).toBe(18);
  });

  const tiered = ruleConfigSchema.parse({
    ...base,
    tiers: {
      enabled: true,
      qualificationMonths: 12,
      levels: [
        { name: "Bronze", minPoints: 50, earnPercent: 100 },
        { name: "Silver", minPoints: 200, earnPercent: 150 },
        { name: "Gold", minPoints: 500, earnPercent: 200 },
      ],
    },
  });

  it("finds the level for the points earned in the window, and how far the next one is", () => {
    expect(tierFor(tiered, 10)).toMatchObject({ current: null, next: { name: "Bronze" }, pointsToNext: 40 });
    expect(tierFor(tiered, 200)).toMatchObject({ current: { name: "Silver" }, next: { name: "Gold" }, pointsToNext: 300 });
    expect(tierFor(tiered, 9000)).toMatchObject({ current: { name: "Gold" }, next: null, pointsToNext: 0 });
    expect(tierFor(base, 9000).current).toBeNull();
  });

  it("gives a level's earn bonus, stacks it with a running boost, and still respects the purchase cap", () => {
    expect(calculatePoints({ amountMinor: 1000, rule: tiered, earnedInTierWindow: 250 }).points).toBe(15); // 10 x 1.5
    expect(calculatePoints({ amountMinor: 1000, rule: tiered, earnedInTierWindow: 10 }).points).toBe(10);
    const both = ruleConfigSchema.parse({ ...tiered, multipliers: withBoost.multipliers });
    expect(calculatePoints({ amountMinor: 1000, rule: both, at: friday, earnedInTierWindow: 250 }).points).toBe(30); // 10 x 2 x 1.5
    const capped = ruleConfigSchema.parse({ ...both, caps: { maxPointsPerTransaction: 25 } });
    const r = calculatePoints({ amountMinor: 1000, rule: capped, at: friday, earnedInTierWindow: 250 });
    expect(r.points).toBe(25);
    expect(r.cappedByTransaction).toBe(true);
  });
});
