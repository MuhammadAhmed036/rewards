import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { db } from "@/server/db";
import {
  memberships,
  membershipBalances,
  ledgerEntries,
  linkClickEvents,
  tenants,
} from "@/server/db/schema";
import { eq, and, sql, gte } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  const { ctx } = guard;
  const tenantId = ctx.tenantId!;

  // Date range in the business's own time zone: "today" means today where the shop is (FR-100, FR-101)
  const RANGES = { "7d": 7, "30d": 30, "90d": 90, "12m": 365, all: 0 } as const;
  const rangeParam = request.nextUrl.searchParams.get("range") as keyof typeof RANGES | null;
  const range = rangeParam && rangeParam in RANGES ? rangeParam : "30d";
  const [tenant] = await db.select({ timezone: tenants.timezone }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const timezone = tenant?.timezone || "Europe/London";
  const days = RANGES[range];
  const [{ start }] = await db.execute<{ start: Date | null }>(
    days === 0
      ? sql`select null::timestamptz as start`
      : sql`select ((date_trunc('day', now() at time zone ${timezone}) - make_interval(days => ${days - 1})) at time zone ${timezone}) as start`
  );
  const since = start ? new Date(start) : null;
  const inRange = (col: Parameters<typeof gte>[0]) => (since ? gte(col, since) : undefined);

  // Customers right now, and how many joined in the range
  const [totalMembersRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(memberships)
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.status, "active")));
  const [newMembersRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(memberships)
    .where(and(eq(memberships.tenantId, tenantId), inRange(memberships.joinedAt)));

  // Customers with any points activity in the range
  const [activeMembersRow] = await db
    .select({ count: sql<number>`count(distinct ${ledgerEntries.membershipId})::int` })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.tenantId, tenantId), inRange(ledgerEntries.occurredAt)));

  // Points held by customers right now (the business's liability)
  const [outstandingRow] = await db
    .select({ totalLiability: sql<number>`COALESCE(SUM(balance), 0)::int` })
    .from(membershipBalances)
    .where(eq(membershipBalances.tenantId, tenantId));

  const [earnsRow] = await db
    .select({
      count: sql<number>`count(*)::int`,
      pointsAwarded: sql<number>`COALESCE(SUM(points_delta), 0)::int`,
    })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.tenantId, tenantId), eq(ledgerEntries.type, "earn"), inRange(ledgerEntries.occurredAt)));

  // Points-menu rewards and items staff gave for points
  const [redemptionsRow] = await db
    .select({
      count: sql<number>`count(*)::int`,
      pointsRedeemed: sql<number>`COALESCE(-SUM(points_delta), 0)::int`,
    })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.tenantId, tenantId), eq(ledgerEntries.type, "redeem"), inRange(ledgerEntries.occurredAt)));

  const [clicksRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(linkClickEvents)
    .where(and(eq(linkClickEvents.tenantId, tenantId), inRange(linkClickEvents.clickedAt)));

  return NextResponse.json({
    data: {
      range,
      rangeStart: since,
      timezone,
      totalMembers: totalMembersRow.count,
      newMembers: newMembersRow.count,
      activeMembers30d: activeMembersRow.count,
      outstandingPoints: outstandingRow.totalLiability,
      earnsCount: earnsRow.count,
      pointsAwarded: earnsRow.pointsAwarded,
      redemptionsCount: redemptionsRow.count,
      pointsRedeemed: redemptionsRow.pointsRedeemed,
      linkClicksTotal: clicksRow.count,
    },
  });
}

