import { z } from "zod";

export const ruleConfigSchema = z.object({
  earn: z.object({
    mode: z.enum(["spend", "visit", "fixed"]).default("spend"),
    pointsPerUnit: z.number().int().min(0).default(1),
    unitMinor: z.number().int().min(1).default(100), // e.g. 100p = £1
    rounding: z.enum(["down", "nearest"]).default("down"),
    minEligibleMinor: z.number().int().min(0).default(0),
    pointsPerVisit: z.number().int().min(1).default(1),
  }),
  caps: z.object({
    maxPointsPerTransaction: z.number().int().min(1).default(500),
    maxPointsPerMemberPerDay: z.number().int().min(1).default(1000),
    minMinutesBetweenEarns: z.number().int().min(0).default(30),
  }),
  exclusions: z.object({
    excludeTips: z.boolean().default(true),
  }),
  expiry: z.object({
    enabled: z.boolean().default(false),
    months: z.number().int().min(1).default(12),
    warnDays: z.number().int().min(1).default(30),
  }),
  locationEligibility: z.union([z.literal("all"), z.array(z.string())]).default("all"),
});

export type RuleConfig = z.infer<typeof ruleConfigSchema>;

export interface CalculatePointsInput {
  amountMinor?: number; // Total amount in pence
  tipMinor?: number; // Tip in pence
  alreadyEarnedTodayInTenantTz?: number; // Points earned today by member
  rule: RuleConfig;
}

export interface CalculatePointsResult {
  points: number;
  eligibleMinor: number;
  cappedByTransaction: boolean;
  cappedByDailyLimit: boolean;
}

/**
 * Pure points calculation per Section 8.2 of the specification.
 * Never uses floats for points or minor currency units.
 */
export function calculatePoints(input: CalculatePointsInput): CalculatePointsResult {
  const { amountMinor = 0, tipMinor = 0, alreadyEarnedTodayInTenantTz = 0, rule } = input;

  const tipToExclude = rule.exclusions.excludeTips ? tipMinor : 0;
  const eligibleMinor = Math.max(0, amountMinor - tipToExclude);

  if (eligibleMinor < rule.earn.minEligibleMinor && rule.earn.mode === "spend") {
    return {
      points: 0,
      eligibleMinor,
      cappedByTransaction: false,
      cappedByDailyLimit: false,
    };
  }

  let calculatedPoints = 0;

  if (rule.earn.mode === "spend") {
    if (rule.earn.rounding === "nearest") {
      const units = Math.round(eligibleMinor / rule.earn.unitMinor);
      calculatedPoints = units * rule.earn.pointsPerUnit;
    } else {
      // Default: "down"
      const units = Math.floor(eligibleMinor / rule.earn.unitMinor);
      calculatedPoints = units * rule.earn.pointsPerUnit;
    }
  } else if (rule.earn.mode === "visit" || rule.earn.mode === "fixed") {
    calculatedPoints = rule.earn.pointsPerVisit;
  }

  // Apply transaction cap
  let cappedByTransaction = false;
  if (calculatedPoints > rule.caps.maxPointsPerTransaction) {
    calculatedPoints = rule.caps.maxPointsPerTransaction;
    cappedByTransaction = true;
  }

  // Apply daily cap
  let cappedByDailyLimit = false;
  const remainingDailyCapacity = Math.max(
    0,
    rule.caps.maxPointsPerMemberPerDay - alreadyEarnedTodayInTenantTz
  );

  if (calculatedPoints > remainingDailyCapacity) {
    calculatedPoints = remainingDailyCapacity;
    cappedByDailyLimit = true;
  }

  return {
    points: calculatedPoints,
    eligibleMinor,
    cappedByTransaction,
    cappedByDailyLimit,
  };
}

