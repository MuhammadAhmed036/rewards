import { z } from "zod";

/** What a single location may change about earning; anything left out follows the programme-wide rule. */
export const locationOverrideSchema = z.object({
  earn: z
    .object({
      pointsPerUnit: z.number().int().min(0),
      unitMinor: z.number().int().min(1),
      minEligibleMinor: z.number().int().min(0),
      pointsPerVisit: z.number().int().min(1),
    })
    .partial()
    .default({}),
  caps: z.object({ maxPointsPerTransaction: z.number().int().min(1) }).partial().default({}),
});
export type LocationOverride = z.infer<typeof locationOverrideSchema>;

/** A limited-time boost, such as "double points on Fridays". 150 means 1.5x. */
export const multiplierSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().trim().min(1).max(60),
  percent: z.number().int().min(101).max(1000),
  startsAt: z.string(), // ISO date-time
  endsAt: z.string(),
});
export type Multiplier = z.infer<typeof multiplierSchema>;

/** A loyalty level earned by points collected over a rolling period (FR-026). */
export const tierLevelSchema = z.object({
  name: z.string().trim().min(1).max(30),
  minPoints: z.number().int().min(1),
  earnPercent: z.number().int().min(100).max(500).default(100), // 120 = earns 1.2x on every purchase
});
export type TierLevel = z.infer<typeof tierLevelSchema>;

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
  // Where points can be earned: every location, or only the listed ones (FR-022)
  locationEligibility: z.union([z.literal("all"), z.array(z.string())]).default("all"),
  // When points can be earned, in the business's own time zone, such as weekdays 9am to 5pm (FR-022)
  earningWindow: z
    .object({
      enabled: z.boolean().default(false),
      days: z.array(z.number().int().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]), // 0 = Sunday
      from: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("00:00"),
      to: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("23:59"),
    })
    .default({}),
  // Automatic emails sent on a schedule rather than by hand (FR-092)
  journeys: z
    .object({
      // Email a customer who has not been back for this many days (0 = off). Only customers who agreed to offers.
      inactivityDays: z.number().int().min(0).max(730).default(0),
    })
    .default({}),
  // FR-013: a location can earn at a different rate. Keyed by location id.
  locationOverrides: z.record(z.string(), locationOverrideSchema).default({}),
  // Limited-time boosts (FR-027)
  multipliers: z.array(multiplierSchema).max(20).default([]),
  // Levels based on points earned in a rolling window; falling below a level's points drops the member back down
  tiers: z
    .object({
      enabled: z.boolean().default(false),
      qualificationMonths: z.number().int().min(1).max(36).default(12),
      levels: z.array(tierLevelSchema).max(6).default([]),
    })
    .default({}),
  // Extra points outside purchases (FR-027); 0 means switched off
  bonuses: z
    .object({
      welcomePoints: z.number().int().min(0).max(100000).default(0),
      birthdayPoints: z.number().int().min(0).max(100000).default(0),
      // Given to both the customer and the friend who invited them, once the friend's first purchase is recorded
      referralPoints: z.number().int().min(0).max(100000).default(0),
      maxReferralsPerMember: z.number().int().min(1).max(1000).default(20),
    })
    .default({}),
});

export type RuleConfig = z.infer<typeof ruleConfigSchema>;

/** The rule as it applies at one location: the programme-wide rule with that location's changes laid over it. */
export function ruleForLocation(rule: RuleConfig, locationId?: string | null): RuleConfig {
  const override = locationId ? rule.locationOverrides?.[locationId] : undefined;
  if (!override) return rule;
  return {
    ...rule,
    earn: { ...rule.earn, ...override.earn },
    caps: { ...rule.caps, ...override.caps },
  };
}

/** The strongest boost running at `at`, as a percent (100 when none). */
export function activeMultiplier(rule: RuleConfig, at: Date = new Date()): { percent: number; label: string | null } {
  let best: { percent: number; label: string | null } = { percent: 100, label: null };
  for (const m of rule.multipliers ?? []) {
    const start = Date.parse(m.startsAt);
    const end = Date.parse(m.endsAt);
    if (Number.isFinite(start) && Number.isFinite(end) && at.getTime() >= start && at.getTime() <= end && m.percent > best.percent) {
      best = { percent: m.percent, label: m.label };
    }
  }
  return best;
}

/** The level a member holds for the points they earned in the qualification window, and what is next. */
export function tierFor(rule: RuleConfig, earnedInWindow: number) {
  const levels = [...(rule.tiers?.levels ?? [])].sort((a, b) => a.minPoints - b.minPoints);
  if (!rule.tiers?.enabled || levels.length === 0) return { current: null as TierLevel | null, next: null as TierLevel | null, pointsToNext: 0 };
  const current = [...levels].reverse().find((l) => earnedInWindow >= l.minPoints) ?? null;
  const next = levels.find((l) => earnedInWindow < l.minPoints) ?? null;
  return { current, next, pointsToNext: next ? next.minPoints - earnedInWindow : 0 };
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Why points can't be earned right now at this location, or null when they can (FR-022). Checked on the
 * server for every earn, so the till can't skip it.
 */
export function earnBlockedReason(rule: RuleConfig, locationId: string, now: Date, timezone: string): string | null {
  if (Array.isArray(rule.locationEligibility) && rule.locationEligibility.length > 0 && !rule.locationEligibility.includes(locationId)) {
    return "Points can't be earned at this location.";
  }
  const w = rule.earningWindow;
  if (w?.enabled) {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const day = WEEKDAYS.indexOf(get("weekday"));
    const time = `${get("hour")}:${get("minute")}`;
    // A window that runs past midnight (22:00 to 02:00) is read as "after from, or before to"
    const inside = w.from <= w.to ? time >= w.from && time <= w.to : time >= w.from || time <= w.to;
    if (!w.days.includes(day) || !inside) {
      const names = [...w.days].sort().map((d) => WEEKDAYS[d].slice(0, 3)).join(", ");
      return `Points can only be earned ${w.days.length === 7 ? "every day" : `on ${names}`} between ${w.from} and ${w.to}.`;
    }
  }
  return null;
}

export interface CalculatePointsInput {
  amountMinor?: number; // Total amount in pence
  tipMinor?: number; // Tip in pence
  excludedMinor?: number; // Part of the bill that doesn't qualify: gift cards, discounted items, excluded products
  alreadyEarnedTodayInTenantTz?: number; // Points earned today by member
  rule: RuleConfig;
  at?: Date; // When the purchase happens, for limited-time boosts
  earnedInTierWindow?: number; // Points the member earned in the tier qualification window
}

export interface CalculatePointsResult {
  points: number;
  eligibleMinor: number;
  /** Total boost applied from a running offer and the member's level, as a percent (100 = none). */
  boostPercent?: number;
  boostLabel?: string | null;
  cappedByTransaction: boolean;
  cappedByDailyLimit: boolean;
}

/**
 * Pure points calculation per Section 8.2 of the specification.
 * Never uses floats for points or minor currency units.
 */
export function calculatePoints(input: CalculatePointsInput): CalculatePointsResult {
  const { amountMinor = 0, tipMinor = 0, excludedMinor = 0, alreadyEarnedTodayInTenantTz = 0, rule } = input;

  const tipToExclude = rule.exclusions.excludeTips ? tipMinor : 0;
  const eligibleMinor = Math.max(0, amountMinor - tipToExclude - excludedMinor);

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

  // Boosts: a running offer and the member's level multiply together, in whole numbers
  const promo = activeMultiplier(rule, input.at);
  const tier = tierFor(rule, input.earnedInTierWindow ?? 0).current;
  const boostPercent = Math.floor((promo.percent * (tier?.earnPercent ?? 100)) / 100);
  if (boostPercent > 100) {
    const boosted = (calculatedPoints * boostPercent) / 100;
    calculatedPoints = rule.earn.rounding === "nearest" ? Math.round(boosted) : Math.floor(boosted);
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
    boostPercent,
    boostLabel: promo.label ?? (tier && boostPercent > 100 ? `${tier.name} level` : null),
    eligibleMinor,
    cappedByTransaction,
    cappedByDailyLimit,
  };
}


/** One-line plain description of an earning rule, e.g. "1 point for every £1 spent". */
export function describeRule(rule: RuleConfig, unit: string, symbol = "£") {
  const money = (minor: number) => (minor % 100 === 0 ? `${symbol}${minor / 100}` : `${symbol}${(minor / 100).toFixed(2)}`);
  const word = (n: number) => (n === 1 ? unit.replace(/s$/, "") : unit);
  if (rule.earn.mode === "spend") {
    const min = rule.earn.minEligibleMinor > 0 ? `, on spends of ${money(rule.earn.minEligibleMinor)} or more` : "";
    return `${rule.earn.pointsPerUnit} ${word(rule.earn.pointsPerUnit)} for every ${money(rule.earn.unitMinor)} spent${min}`;
  }
  return `${rule.earn.pointsPerVisit} ${word(rule.earn.pointsPerVisit)} per visit`;
}
