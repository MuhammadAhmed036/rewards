import { sql } from "drizzle-orm";
import { db } from "../db";
import { RequestContext, assertCan } from "../security/permissions";

export const ANALYTICS_RANGES = { "7d": 7, "30d": 30, "90d": 90, "12m": 365, all: 0 } as const;
export type AnalyticsRange = keyof typeof ANALYTICS_RANGES;

/** A campaign counts as having worked if the person bought something within this many days of it going out. */
export const CAMPAIGN_ATTRIBUTION_DAYS = 7;

// A purchase is a normal earn; welcome, birthday and referral bonuses are not visits
const PURCHASE = sql`le.type = 'earn' and le.reason_code is distinct from 'bonus'`;

type Window = { from: Date | null; to: Date };

// The database driver can't guess the type of a bare date in raw SQL, so send it as text and cast
const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

async function periodTotals(tenantId: string, w: Window) {
  const lower = w.from ? sql`and le.occurred_at >= ${ts(w.from)}` : sql``;
  const joined = w.from ? sql`and m.joined_at >= ${ts(w.from)}` : sql``;
  const upTo = ts(w.to);
  const [row] = await db.execute<{
    new_members: number;
    active_members: number;
    purchases: number;
    points_awarded: number;
    redemptions: number;
  }>(sql`
    select
      (select count(*)::int from memberships m where m.tenant_id = ${tenantId} ${joined} and m.joined_at < ${upTo}) as new_members,
      (select count(distinct le.membership_id)::int from ledger_entries le where le.tenant_id = ${tenantId} ${lower} and le.occurred_at < ${upTo}) as active_members,
      (select count(*)::int from ledger_entries le where le.tenant_id = ${tenantId} and ${PURCHASE} ${lower} and le.occurred_at < ${upTo}) as purchases,
      (select coalesce(sum(le.points_delta), 0)::int from ledger_entries le where le.tenant_id = ${tenantId} and le.type = 'earn' ${lower} and le.occurred_at < ${upTo}) as points_awarded,
      (select count(*)::int from ledger_entries le where le.tenant_id = ${tenantId} and le.type = 'redeem' ${lower} and le.occurred_at < ${upTo}) as redemptions
  `);
  return {
    newMembers: row.new_members,
    activeMembers: row.active_members,
    purchases: row.purchases,
    pointsAwarded: row.points_awarded,
    redemptions: row.redemptions,
  };
}

/**
 * Repeat visits, cohort retention, reward breakage, campaign conversion, location and period comparison
 * (FR-102, FR-103). Every number is worked out in the business's own time zone, and the meaning of each
 * is returned with it so the screen can show it (FR-101).
 */
export async function getAnalytics(ctx: RequestContext, range: AnalyticsRange = "30d") {
  assertCan(ctx, "analytics.view");
  if (!ctx.tenantId) throw new Error("tenantId required");
  const tenantId = ctx.tenantId;
  // A manager tied to some locations sees only those in the location table
  const scoped = ctx.locationIds && ctx.locationIds.length > 0 ? ctx.locationIds : null;

  const [tz] = await db.execute<{ timezone: string }>(sql`select coalesce(timezone, 'Europe/London') as timezone from tenants where id = ${tenantId}`);
  const timezone = tz?.timezone ?? "Europe/London";
  const days = ANALYTICS_RANGES[range];

  const [bounds] = await db.execute<{ start: Date | null; prev_start: Date | null }>(
    days === 0
      ? sql`select null::timestamptz as start, null::timestamptz as prev_start`
      : sql`select
          ((date_trunc('day', now() at time zone ${timezone}) - make_interval(days => ${days - 1})) at time zone ${timezone}) as start,
          ((date_trunc('day', now() at time zone ${timezone}) - make_interval(days => ${2 * days - 1})) at time zone ${timezone}) as prev_start`
  );
  const start = bounds.start ? new Date(bounds.start) : null;
  const prevStart = bounds.prev_start ? new Date(bounds.prev_start) : null;
  const now = new Date();
  const inRange = start ? sql`and le.occurred_at >= ${ts(start)}` : sql``;

  // Compare with the period just before (not meaningful for "all time")
  const current = await periodTotals(tenantId, { from: start, to: now });
  const previous = start && prevStart ? await periodTotals(tenantId, { from: prevStart, to: start }) : null;

  // Repeat rate: of customers who bought in the range, how many bought at least twice
  const [repeat] = await db.execute<{ buyers: number; repeaters: number }>(sql`
    select count(*)::int as buyers, count(*) filter (where n >= 2)::int as repeaters from (
      select le.membership_id, count(*) as n from ledger_entries le
      where le.tenant_id = ${tenantId} and ${PURCHASE} ${inRange}
      group by le.membership_id
    ) t
  `);

  // Earn-to-redeem: of customers who ever bought, how many ever used a reward (all time)
  const [e2r] = await db.execute<{ earners: number; redeemers: number }>(sql`
    select
      count(distinct le.membership_id) filter (where ${PURCHASE})::int as earners,
      count(distinct le.membership_id) filter (where le.type = 'redeem')::int as redeemers
    from ledger_entries le where le.tenant_id = ${tenantId}
  `);

  // Breakage: points handed out in the range that expired unused
  const [points] = await db.execute<{ awarded: number; expired: number; redeemed: number }>(sql`
    select
      coalesce(sum(le.points_delta) filter (where le.type = 'earn'), 0)::int as awarded,
      coalesce(-sum(le.points_delta) filter (where le.type = 'expire'), 0)::int as expired,
      coalesce(-sum(le.points_delta) filter (where le.type = 'redeem'), 0)::int as redeemed
    from ledger_entries le where le.tenant_id = ${tenantId} ${inRange}
  `);

  // Cohorts: customers by the month they joined, and how many came back to buy in the months after
  const cohortRows = await db.execute<{ cohort: Date; size: number; m1: number; m2: number; m3: number }>(sql`
    with c as (
      select m.id, date_trunc('month', m.joined_at at time zone ${timezone}) as cohort
      from memberships m
      where m.tenant_id = ${tenantId}
        and m.joined_at >= (date_trunc('month', now() at time zone ${timezone}) - interval '5 months') at time zone ${timezone}
    ),
    a as (
      select c.id,
        (extract(year from date_trunc('month', le.occurred_at at time zone ${timezone})) * 12 + extract(month from date_trunc('month', le.occurred_at at time zone ${timezone})))
        - (extract(year from c.cohort) * 12 + extract(month from c.cohort)) as d
      from c join ledger_entries le on le.membership_id = c.id and ${PURCHASE}
    )
    select c.cohort, count(distinct c.id)::int as size,
      count(distinct a.id) filter (where a.d = 1)::int as m1,
      count(distinct a.id) filter (where a.d = 2)::int as m2,
      count(distinct a.id) filter (where a.d = 3)::int as m3
    from c left join a on a.id = c.id
    group by c.cohort order by c.cohort
  `);
  const nowMonth = new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
  const cohorts = cohortRows.map((r) => {
    const d = new Date(r.cohort);
    const elapsed = (nowMonth.getFullYear() - d.getFullYear()) * 12 + (nowMonth.getMonth() - d.getMonth());
    return {
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      size: r.size,
      // A month that has not finished yet has no result, rather than a misleading 0%
      month1: elapsed >= 1 ? pct(r.m1, r.size) : null,
      month2: elapsed >= 2 ? pct(r.m2, r.size) : null,
      month3: elapsed >= 3 ? pct(r.m3, r.size) : null,
    };
  });

  // Campaign conversion: of the people an offer reached, how many bought within the attribution window
  const campaignRows = await db.execute<{ id: string; subject: string; sent_at: Date; reached: number; converted: number }>(sql`
    select c.id, c.subject, c.sent_at,
      count(distinct o.id)::int as reached,
      count(distinct o.id) filter (where exists (
        select 1 from users u
        join memberships m on m.user_id = u.id and m.tenant_id = c.tenant_id
        join ledger_entries le on le.membership_id = m.id
        where u.email = o.to_email and ${PURCHASE}
          and le.occurred_at >= c.sent_at and le.occurred_at < c.sent_at + make_interval(days => ${CAMPAIGN_ATTRIBUTION_DAYS})
      ))::int as converted
    from campaigns c
    join email_outbox o on o.template = 'campaign' and o.payload->>'campaignId' = c.id::text and o.status = 'sent'
    where c.tenant_id = ${tenantId} and c.status = 'sent' ${start ? sql`and c.sent_at >= ${ts(start)}` : sql``}
    group by c.id order by c.sent_at desc limit 10
  `);

  // Locations side by side
  const locationRows = await db.execute<{ id: string; name: string; purchases: number; points: number; customers: number; redemptions: number }>(sql`
    select l.id, l.name,
      count(*) filter (where ${PURCHASE})::int as purchases,
      coalesce(sum(le.points_delta) filter (where le.type = 'earn'), 0)::int as points,
      count(distinct le.membership_id)::int as customers,
      count(*) filter (where le.type = 'redeem')::int as redemptions
    from locations l
    left join ledger_entries le on le.location_id = l.id and le.tenant_id = l.tenant_id ${inRange}
    where l.tenant_id = ${tenantId} ${scoped ? sql`and l.id in (${sql.join(scoped.map((id) => sql`${id}`), sql`, `)})` : sql``}
    group by l.id, l.name order by purchases desc, l.name
  `);

  return {
    range,
    timezone,
    rangeStart: start,
    attributionDays: CAMPAIGN_ATTRIBUTION_DAYS,
    comparison: { current, previous },
    repeat: { buyers: repeat.buyers, repeaters: repeat.repeaters, ratePercent: pct(repeat.repeaters, repeat.buyers) },
    earnToRedeem: { earners: e2r.earners, redeemers: e2r.redeemers, ratePercent: pct(e2r.redeemers, e2r.earners) },
    breakage: { awarded: points.awarded, expired: points.expired, redeemed: points.redeemed, ratePercent: pct(points.expired, points.awarded) },
    cohorts,
    campaigns: campaignRows.map((c) => ({
      id: c.id,
      subject: c.subject,
      sentAt: c.sent_at,
      reached: c.reached,
      converted: c.converted,
      ratePercent: pct(c.converted, c.reached),
    })),
    locations: locationRows.map((l) => ({ id: l.id, name: l.name, purchases: l.purchases, points: l.points, customers: l.customers, redemptions: l.redemptions })),
    // What each figure means, shown next to it (FR-101)
    definitions: {
      repeatRate: "Of customers who bought in this period, the share who bought two or more times.",
      earnToRedeem: "Of customers who have ever bought, the share who have ever used a reward.",
      breakage: "Points given out in this period that later expired unused, as a share of points given out.",
      cohort: `Customers grouped by the month they joined, and the share who bought again in each of the next three months.`,
      campaign: `Of the people an offer was emailed to, the share who bought within ${CAMPAIGN_ATTRIBUTION_DAYS} days of it going out.`,
      purchase: "A purchase is a visit where points were earned; welcome, birthday and referral bonuses are not counted.",
    },
  };
}
