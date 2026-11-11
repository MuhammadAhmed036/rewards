import crypto from "crypto";

/**
 * A/B test helpers for offers (FR-096). Customers are split between two wordings by a fixed shuffle of their
 * ids, so the same offer always splits the same way, the split is as close to the chosen share as whole people
 * allow, and the shop can't favour a version by choosing who gets which.
 */
export function splitForTest<T extends { membershipId: string }>(rows: T[], campaignId: string, percentB: number) {
  const ranked = [...rows]
    .map((r) => ({ r, key: crypto.createHash("sha256").update(`${campaignId}:${r.membershipId}`).digest("hex") }))
    .sort((a, b) => (a.key < b.key ? -1 : 1))
    .map((x) => x.r);
  const sizeB = Math.min(rows.length - 1, Math.max(1, Math.round((rows.length * percentB) / 100)));
  return { b: ranked.slice(0, sizeB), a: ranked.slice(sizeB) };
}

export interface VariantCount {
  reached: number;
  converted: number;
}

/** Fewer people than this in either version and a difference could easily be chance. */
export const MIN_PER_VERSION = 30;

export type AbVerdict = { winner: "A" | "B" | null; reason: string };

/**
 * Which version bought more, and whether the gap is big enough to trust. A two-sided test of two proportions at
 * 95%: below that, or with few people, the honest answer is "no clear winner yet".
 */
export function compareVariants(a: VariantCount, b: VariantCount): AbVerdict {
  if (a.reached < MIN_PER_VERSION || b.reached < MIN_PER_VERSION) {
    return { winner: null, reason: `Too early to call. Each version needs at least ${MIN_PER_VERSION} people.` };
  }
  const pa = a.converted / a.reached;
  const pb = b.converted / b.reached;
  const pooled = (a.converted + b.converted) / (a.reached + b.reached);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.reached + 1 / b.reached));
  if (se === 0) return { winner: null, reason: "No clear winner: both versions did the same." };
  const z = (pb - pa) / se;
  if (Math.abs(z) < 1.96) return { winner: null, reason: "No clear winner yet: the difference could be down to chance." };
  return { winner: z > 0 ? "B" : "A", reason: `Version ${z > 0 ? "B" : "A"} brought more customers back, and the gap is big enough to trust.` };
}
