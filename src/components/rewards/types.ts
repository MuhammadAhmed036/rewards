export interface PointsReward {
  id: string;
  title: string;
  description?: string | null;
  costPoints: number;
  status: "active" | "paused" | "archived" | string;
  productId?: string | null;
  productName?: string | null;
  quantityTotal?: number | null;
  quantityRedeemed?: number;
  perMemberLimit?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
}

export interface MenuProduct {
  id: string;
  name: string;
  category: string;
  priceMinor: number;
  isActive: boolean;
}

export type PointsUnit = "points" | "stamps";

export async function loadMenuProducts(): Promise<MenuProduct[]> {
  const res = await fetch("/api/v1/products?activeOnly=true", { cache: "no-store" });
  if (!res.ok) return [];
  return (await res.json()).data ?? [];
}

export async function loadPointsRewards(): Promise<PointsReward[]> {
  const res = await fetch("/api/v1/business/rewards", { cache: "no-store" });
  if (!res.ok) return [];
  return (await res.json()).data ?? [];
}

export function formatPrice(minor: number, symbol = "£") {
  return `${symbol}${(minor / 100).toFixed(2)}`;
}

/** "1 stamp", "6 stamps", "1 point", "100 points" */
export function countLabel(n: number, unit: PointsUnit) {
  return `${n} ${n === 1 ? unit.slice(0, -1) : unit}`;
}
