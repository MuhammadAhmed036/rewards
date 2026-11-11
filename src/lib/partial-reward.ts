/**
 * Partial use of a reward (FR-066): a customer who can't, or doesn't want to, spend the full price in points
 * puts some points towards it and gets a proportional part of its value, e.g. 250 of 500 points on a £5 voucher
 * is £2.50 off. Money stays in whole pence/cents and is always rounded down, so the shop never gives more than
 * the points paid for.
 */
export function partialValueMinor(valueMinor: number, costPoints: number, points: number) {
  return Math.floor((valueMinor * points) / costPoints);
}

/** The reasons a partial amount isn't allowed, or null when it is fine. */
export function partialPointsProblem(
  reward: { costPoints: number; minPartialPoints: number | null },
  points: number
): string | null {
  if (!Number.isInteger(points)) return "Enter a whole number of points.";
  const min = reward.minPartialPoints ?? 1;
  if (points < min) return `Use at least ${min} points.`;
  if (points > reward.costPoints) return `That's more than the ${reward.costPoints} points this reward costs.`;
  return null;
}
