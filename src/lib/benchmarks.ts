/**
 * Benchmarks (FR-105): how a shop's figures compare with other shops that chose to take part. The comparison only
 * ever shows the spread of the other shops (the middle half and the typical shop), never a single shop's figure,
 * and only when enough other shops contribute for nobody to be picked out.
 */

/** Other shops needed before any comparison is shown. */
export const MIN_PEER_SHOPS = 8;
/** Customers who bought in the period before a shop's own figures count. */
export const MIN_BUYERS_PER_SHOP = 20;
export const BENCHMARK_WINDOW_DAYS = 90;

/** The value at a position (0 to 1) through the sorted list, in between neighbours when it falls between two. */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) throw new Error("No values");
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (pos - lower);
}

export type Standing = "top" | "above" | "below" | "bottom";

/** Where one shop's figure sits among the others: the top quarter, above or below the typical shop, or the lowest quarter. */
export function standing(value: number, p25: number, p50: number, p75: number): Standing {
  if (value >= p75) return "top";
  if (value >= p50) return "above";
  if (value >= p25) return "below";
  return "bottom";
}

export interface ShopFigures {
  buyers: number;
  repeaters: number;
  purchases: number;
  redeemers: number;
}

export const BENCHMARK_METRICS = ["repeatRate", "visitsPerCustomer", "redemptionRate"] as const;
export type BenchmarkMetric = (typeof BENCHMARK_METRICS)[number];

/** The three figures compared, worked out the same way for every shop. */
export function metricsFor(f: ShopFigures): Record<BenchmarkMetric, number> {
  const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;
  return {
    repeatRate: f.buyers ? round((f.repeaters / f.buyers) * 100, 1) : 0,
    visitsPerCustomer: f.buyers ? round(f.purchases / f.buyers, 1) : 0,
    redemptionRate: f.buyers ? round((f.redeemers / f.buyers) * 100, 1) : 0,
  };
}
