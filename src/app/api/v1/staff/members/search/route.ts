import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { db } from "@/server/db";
import { memberships, users, membershipBalances } from "@/server/db/schema";
import { eq, and, ilike, or } from "drizzle-orm";
import { getRewards } from "@/server/services/rewards";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager", "staff"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  const { ctx } = guard;
  const q = request.nextUrl.searchParams.get("q")?.trim() || "";

  if (!q) {
    return NextResponse.json({ data: [] });
  }

  // Exact member number search (allowed for all staff)
  const isManagerOrOwner = ctx.role === "owner" || ctx.role === "manager";

  let condition = and(
    eq(memberships.tenantId, ctx.tenantId!),
    eq(memberships.memberNumber, q.toUpperCase())
  );

  if (isManagerOrOwner) {
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
    .limit(10);

  const results = await Promise.all(
    rows.map(async (row) => {
      // First name + last initial for minimal identity exposure
      let displayName = "Member";
      if (row.name) {
        const parts = row.name.trim().split(" ");
        displayName = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
      }

      const availableRewards = await getRewards(ctx.tenantId!, {
        memberBalance: row.balance || 0,
      });

      return {
        membershipId: row.id,
        memberNumber: row.memberNumber,
        displayName,
        email: isManagerOrOwner ? row.email : undefined,
        balance: row.balance || 0,
        status: row.status,
        joinedAt: row.joinedAt,
        availableRewards,
      };
    })
  );

  return NextResponse.json({ data: results });
}

