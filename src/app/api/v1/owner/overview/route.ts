import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { db } from "@/server/db";
import {
  memberships,
  membershipBalances,
  ledgerEntries,
  redemptions,
  linkClickEvents,
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

  // 1. Total Members
  const [totalMembersRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(memberships)
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.status, "active")));

  // 2. Active Members in last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [activeMembersRow] = await db
    .select({
      count: sql<number>`count(distinct ${ledgerEntries.membershipId})::int`,
    })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.tenantId, tenantId),
        gte(ledgerEntries.occurredAt, thirtyDaysAgo)
      )
    );

  // 3. Outstanding Points Liability
  const [outstandingRow] = await db
    .select({
      totalLiability: sql<number>`COALESCE(SUM(balance), 0)::int`,
    })
    .from(membershipBalances)
    .where(eq(membershipBalances.tenantId, tenantId));

  // 4. Earns Count & Points
  const [earnsRow] = await db
    .select({
      count: sql<number>`count(*)::int`,
      pointsAwarded: sql<number>`COALESCE(SUM(points_delta), 0)::int`,
    })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.tenantId, tenantId), eq(ledgerEntries.type, "earn")));

  // 5. Redemptions Count & Points
  const [redemptionsRow] = await db
    .select({
      count: sql<number>`count(*)::int`,
      pointsRedeemed: sql<number>`COALESCE(SUM(cost_points), 0)::int`,
    })
    .from(redemptions)
    .where(and(eq(redemptions.tenantId, tenantId), eq(redemptions.status, "confirmed")));

  // 6. Link Clicks Total
  const [clicksRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(linkClickEvents)
    .where(eq(linkClickEvents.tenantId, tenantId));

  return NextResponse.json({
    data: {
      totalMembers: totalMembersRow.count,
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

