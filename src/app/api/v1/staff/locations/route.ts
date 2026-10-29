import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { db } from "@/server/db";
import { locations } from "@/server/db/schema";
import { and, eq, inArray } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager", "staff"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  const { ctx } = guard;

  let query = db
    .select()
    .from(locations)
    // Closed locations drop out of the staff location picker
    .where(and(eq(locations.tenantId, ctx.tenantId!), eq(locations.status, "active")));

  if (ctx.locationIds && ctx.locationIds.length > 0) {
    query = db
      .select()
      .from(locations)
      .where(and(inArray(locations.id, ctx.locationIds), eq(locations.status, "active")));
  }

  const list = await query;
  return NextResponse.json({ data: list });
}

