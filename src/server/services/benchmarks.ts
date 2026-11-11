import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { tenants } from "../db/schema";
import { RequestContext, assertCan } from "../security/permissions";
import { logAuditEvent } from "./audit";
import {
  BENCHMARK_METRICS,
  BENCHMARK_WINDOW_DAYS,
  MIN_BUYERS_PER_SHOP,
  MIN_PEER_SHOPS,
  metricsFor,
  quantile,
  standing,
  type BenchmarkMetric,
  type ShopFigures,
  type Standing,
} from "@/lib/benchmarks";

/**
 * Benchmarks (FR-105). A shop takes part by switching it on: its own figures are then counted, without its name,
 * in the comparison the other shops see, and it sees the comparison too. Shops that haven't switched it on are
 * never counted. The methodology below is shown to the owner next to the numbers.
 */

export const METHODOLOGY = [
  `Only shops that switched this on are counted, and none is named. You see the middle half of the other shops and the typical one, never a single shop's figure.`,
  `Each shop's figures cover the last ${BENCHMARK_WINDOW_DAYS} days. A shop is counted once it has at least ${MIN_BUYERS_PER_SHOP} customers who bought in that time.`,
  `Nothing is shown until at least ${MIN_PEER_SHOPS} other shops are counted.`,
  `"Come back" is the share of those customers who bought at least twice. "Visits" is purchases per customer. "Used a reward" is the share who redeemed one.`,
  `Shops differ a lot (a coffee shop and a car wash don't have the same rhythm), so treat this as a guide, not a target.`,
];

export const METRIC_LABELS: Record<BenchmarkMetric, { label: string; unit: string; help: string }> = {
  repeatRate: { label: "Customers who came back", unit: "%", help: "Bought at least twice in the last 90 days." },
  visitsPerCustomer: { label: "Visits per customer", unit: "", help: "Purchases divided by customers who bought." },
  redemptionRate: { label: "Customers who used a reward", unit: "%", help: "Of those who bought, the share who redeemed a reward." },
};

type TenantFigures = ShopFigures & { tenantId: string };

/** Figures for every shop that takes part, in one query. */
export async function participatingFigures(): Promise<TenantFigures[]> {
  const rows = await db.execute<{ tenant_id: string; buyers: number; repeaters: number; purchases: number; redeemers: number }>(sql`
    with since as (select now() - make_interval(days => ${BENCHMARK_WINDOW_DAYS}) as at),
    purchases as (
      select le.tenant_id, le.membership_id, count(*)::int as n
      from ledger_entries le
      join tenants t on t.id = le.tenant_id and t.status = 'active' and t.features->>'benchmarks' = 'true'
      where le.type = 'earn' and le.reason_code is distinct from 'bonus' and le.occurred_at >= (select at from since)
      group by le.tenant_id, le.membership_id
    ),
    redeemers as (
      select le.tenant_id, count(distinct le.membership_id)::int as n
      from ledger_entries le
      where le.type = 'redeem' and le.occurred_at >= (select at from since)
        and exists (select 1 from purchases p where p.tenant_id = le.tenant_id and p.membership_id = le.membership_id)
      group by le.tenant_id
    )
    select p.tenant_id,
      count(*)::int as buyers,
      count(*) filter (where p.n >= 2)::int as repeaters,
      sum(p.n)::int as purchases,
      coalesce(max(r.n), 0)::int as redeemers
    from purchases p
    left join redeemers r on r.tenant_id = p.tenant_id
    group by p.tenant_id
  `);
  return rows.map((r) => ({ tenantId: r.tenant_id, buyers: r.buyers, repeaters: r.repeaters, purchases: r.purchases, redeemers: r.redeemers }));
}

export interface BenchmarkResult {
  participating: boolean;
  windowDays: number;
  methodology: string[];
  /** Why there is no comparison yet, in plain words */
  note: string | null;
  peers: number;
  minPeers: number;
  metrics: Array<{
    key: BenchmarkMetric;
    label: string;
    unit: string;
    help: string;
    you: number | null;
    typical: number;
    middleHalf: [number, number];
    standing: Standing | null;
  }>;
}

export async function getBenchmarks(
  ctx: RequestContext,
  // Only tests change these; what shops see always uses the published limits
  limits: { minPeers: number; minBuyers: number } = { minPeers: MIN_PEER_SHOPS, minBuyers: MIN_BUYERS_PER_SHOP }
): Promise<BenchmarkResult> {
  assertCan(ctx, "analytics.view");
  if (!ctx.tenantId) throw new Error("tenantId required");
  const [t] = await db.select({ features: tenants.features }).from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
  const participating = Boolean((t?.features as { benchmarks?: boolean } | null)?.benchmarks);
  const base = { participating, windowDays: BENCHMARK_WINDOW_DAYS, methodology: METHODOLOGY, minPeers: limits.minPeers };
  if (!participating) {
    return { ...base, note: "Switch this on to compare your shop with others. Your own figures are then counted, anonymously, in what other shops see.", peers: 0, metrics: [] };
  }

  const all = (await participatingFigures()).filter((f) => f.buyers >= limits.minBuyers);
  const others = all.filter((f) => f.tenantId !== ctx.tenantId);
  const mine = all.find((f) => f.tenantId === ctx.tenantId);
  if (others.length < limits.minPeers) {
    return {
      ...base,
      note: `Not enough shops to compare yet. A comparison appears once ${limits.minPeers} other shops with at least ${limits.minBuyers} customers each have switched this on.`,
      peers: others.length,
      metrics: [],
    };
  }

  const peerMetrics = others.map(metricsFor);
  const own = mine ? metricsFor(mine) : null;
  return {
    ...base,
    note: own ? null : `Your shop isn't counted yet: it needs at least ${limits.minBuyers} customers who bought in the last ${BENCHMARK_WINDOW_DAYS} days. Here is how the other shops are doing.`,
    peers: others.length,
    metrics: BENCHMARK_METRICS.map((key) => {
      const values = peerMetrics.map((m) => m[key]);
      const [p25, p50, p75] = [quantile(values, 0.25), quantile(values, 0.5), quantile(values, 0.75)];
      const round = (n: number) => Math.round(n * 10) / 10;
      return {
        key,
        ...METRIC_LABELS[key],
        you: own ? own[key] : null,
        typical: round(p50),
        middleHalf: [round(p25), round(p75)] as [number, number],
        standing: own ? standing(own[key], p25, p50, p75) : null,
      };
    }),
  };
}

export async function setBenchmarkParticipation(ctx: RequestContext, enabled: boolean) {
  assertCan(ctx, "tenant.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");
  const [t] = await db.select({ features: tenants.features }).from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
  await db
    .update(tenants)
    .set({ features: { ...((t?.features as Record<string, unknown>) ?? {}), benchmarks: enabled } })
    .where(eq(tenants.id, ctx.tenantId));
  await logAuditEvent(ctx, { action: enabled ? "benchmarks.joined" : "benchmarks.left", targetType: "tenant", targetId: ctx.tenantId });
  return { participating: enabled };
}
