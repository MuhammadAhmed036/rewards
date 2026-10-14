import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { db } from "@/server/db";
import { locations } from "@/server/db/schema";
import { eq, inArray } from "drizzle-orm";

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
    .where(eq(locations.tenantId, ctx.tenantId!));

  if (ctx.locationIds && ctx.locationIds.length > 0) {
    query = db
      .select()
      .from(locations)
      .where(inArray(locations.id, ctx.locationIds));
  }

  const list = await query;
  return NextResponse.json({ data: list });
}

