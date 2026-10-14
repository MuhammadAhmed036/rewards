import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { db } from "@/server/db";
import { ledgerEntries, memberships, users } from "@/server/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager", "staff"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  const { ctx } = guard;

  const rows = await db
    .select({
      id: ledgerEntries.id,
      type: ledgerEntries.type,
      pointsDelta: ledgerEntries.pointsDelta,
      basisAmountMinor: ledgerEntries.basisAmountMinor,
      occurredAt: ledgerEntries.occurredAt,
      memberNumber: memberships.memberNumber,
      memberName: users.name,
    })
    .from(ledgerEntries)
    .innerJoin(memberships, eq(ledgerEntries.membershipId, memberships.id))
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(
      and(
        eq(ledgerEntries.tenantId, ctx.tenantId!),
        eq(ledgerEntries.actorUserId, ctx.userId)
      )
    )
    .orderBy(desc(ledgerEntries.occurredAt))
    .limit(20);

  const formatted = rows.map((r) => {
    let displayName = "Member";
    if (r.memberName) {
      const parts = r.memberName.trim().split(" ");
      displayName = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
    }

    return {
      id: r.id,
      type: r.type,
      pointsDelta: r.pointsDelta,
      basisAmountMinor: r.basisAmountMinor,
      occurredAt: r.occurredAt,
      memberNumber: r.memberNumber,
      displayName,
    };
  });

  return NextResponse.json({ data: formatted });
}

