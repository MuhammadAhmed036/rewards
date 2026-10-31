import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { db } from "@/server/db";
import { auditEvents, users } from "@/server/db/schema";
import { eq, desc, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  const { ctx } = guard;

  const rows = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      targetType: auditEvents.targetType,
      targetId: auditEvents.targetId,
      reason: auditEvents.reason,
      metadata: auditEvents.metadata,
      createdAt: auditEvents.createdAt,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(auditEvents)
    .leftJoin(users, eq(auditEvents.actorUserId, users.id))
    .where(
      and(
        eq(auditEvents.tenantId, ctx.tenantId!),
        // ?flagged=1 shows only activity the system marked as unusual
        request.nextUrl.searchParams.get("flagged") === "1" ? eq(auditEvents.action, "ledger.flagged") : undefined
      )
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(100);

  return NextResponse.json({ data: rows });
}

