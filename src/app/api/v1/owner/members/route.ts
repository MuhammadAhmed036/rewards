import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { db } from "@/server/db";
import { memberships, users, membershipBalances } from "@/server/db/schema";
import { eq, and, ilike, or, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  const { ctx } = guard;
  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  const status = request.nextUrl.searchParams.get("status") || undefined;

  const conditions = [eq(memberships.tenantId, ctx.tenantId!)];

  if (status) {
    conditions.push(eq(memberships.status, status));
  }

  if (q) {
    conditions.push(
      or(
        eq(memberships.memberNumber, q.toUpperCase()),
        ilike(users.name, `%${q}%`),
        ilike(users.email, `%${q}%`)
      )!
    );
  }

  const rows = await db
    .select({
      id: memberships.id,
      memberNumber: memberships.memberNumber,
      status: memberships.status,
      joinedAt: memberships.joinedAt,
      marketingOptIn: memberships.marketingOptIn,
      balance: membershipBalances.balance,
      lifetimeEarned: membershipBalances.lifetimeEarned,
      lifetimeRedeemed: membershipBalances.lifetimeRedeemed,
      name: users.name,
      email: users.email,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .leftJoin(membershipBalances, eq(memberships.id, membershipBalances.membershipId))
    .where(and(...conditions))
    .orderBy(desc(memberships.joinedAt))
    .limit(50);

  return NextResponse.json({ data: rows });
}

