import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { db } from "@/server/db";
import { memberships, users, membershipBalances } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { getRewards } from "@/server/services/rewards";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ membershipId: string }> }
) {
  const params = await props.params;
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager", "staff"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  const { ctx } = guard;

  const [row] = await db
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
    .where(
      and(
        eq(memberships.id, params.membershipId),
        eq(memberships.tenantId, ctx.tenantId!)
      )
    )
    .limit(1);

  if (!row) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Member not found" } },
      { status: 404 }
    );
  }

  let displayName = "Member";
  if (row.name) {
    const parts = row.name.trim().split(" ");
    displayName = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
  }

  const availableRewards = await getRewards(ctx.tenantId!, {
    memberBalance: row.balance || 0,
  });

  return NextResponse.json({
    data: {
      membershipId: row.id,
      memberNumber: row.memberNumber,
      displayName,
      balance: row.balance || 0,
      status: row.status,
      joinedAt: row.joinedAt,
      availableRewards,
    },
  });
}
