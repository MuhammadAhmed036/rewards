import { describe, it, expect } from "vitest";
import { calculatePoints, RuleConfig } from "./points";

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
