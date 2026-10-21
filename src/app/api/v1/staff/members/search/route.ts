import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { db } from "@/server/db";
import { memberships, users, membershipBalances } from "@/server/db/schema";
import { eq, and, ilike, or, desc } from "drizzle-orm";
import { getRewards } from "@/server/services/rewards";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager", "staff"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  const { ctx } = guard;
  const q = request.nextUrl.searchParams.get("q")?.trim() || "";

  // If query is provided, search by member number, name, or email.
  // If query is empty, return latest registered customers for this store.
  let condition;
  if (!q) {
    condition = eq(memberships.tenantId, ctx.tenantId!);
  } else {
    condition = and(
      eq(memberships.tenantId, ctx.tenantId!),
      or(
        eq(memberships.memberNumber, q.toUpperCase()),
        ilike(users.name, `%${q}%`),
        ilike(users.email, `%${q}%`)
      )
    );
  }

  const rows = await db
    .select({
      id: memberships.id,
      memberNumber: memberships.memberNumber,
      status: memberships.status,
      joinedAt: memberships.joinedAt,
      balance: membershipBalances.balance,
      name: users.name,
      email: users.email,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .leftJoin(membershipBalances, eq(memberships.id, membershipBalances.membershipId))
    .where(condition)
    .orderBy(desc(memberships.joinedAt))
    .limit(50);

  const results = await Promise.all(
    rows.map(async (row) => {
      const availableRewards = await getRewards(ctx.tenantId!, {
        memberBalance: row.balance || 0,
      });

      return {
        membershipId: row.id,
        memberNumber: row.memberNumber,
        displayName: row.name || row.email || "Valued Customer",
        name: row.name,
        email: row.email,
        balance: row.balance || 0,
        status: row.status,
        joinedAt: row.joinedAt,
        availableRewards,
      };
    })
  );

  return NextResponse.json({ data: results });
}

