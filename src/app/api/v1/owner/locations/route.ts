import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardApiRequest } from "@/server/auth/route-guard";
import { createLocation, getLocations, updateLocation } from "@/server/services/tenant";
import { db } from "@/server/db";
import { staffLocationScopes, staffMembers } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";

function failure(code: string, err: unknown, fallback: string) {
  const message = err instanceof z.ZodError ? err.errors[0]?.message || fallback : err instanceof Error ? err.message : fallback;
  return NextResponse.json({ error: { code, message } }, { status: 400 });
}

/** The business's locations, with how many staff are tied to each. */
export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, { allowedRoles: ["owner", "manager"], requireTenant: true });
  if ("response" in guard) return guard.response;
  try {
    const list = await getLocations(guard.ctx);
    const scopes = await db
      .select({ locationId: staffLocationScopes.locationId })
      .from(staffLocationScopes)
      .innerJoin(staffMembers, eq(staffMembers.id, staffLocationScopes.staffMemberId))
      .where(and(eq(staffMembers.tenantId, guard.ctx.tenantId!), eq(staffMembers.status, "active")));
    return NextResponse.json({
      data: list.map((l) => ({ ...l, staffCount: scopes.filter((s) => s.locationId === l.id).length })),
    });
  } catch (err) {
    return failure("LOCATIONS_LOAD_FAILED", err, "Couldn't load locations");
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Give the location a name").max(120),
  addressLine: z.string().trim().max(300).optional(),
});

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, { allowedRoles: ["owner", "manager"], requireTenant: true });
  if ("response" in guard) return guard.response;
  try {
    const { name, addressLine } = createSchema.parse(await request.json());
    const location = await createLocation(guard.ctx, { name, address: addressLine ? { line: addressLine } : {} });
    return NextResponse.json({ data: location }, { status: 201 });
  } catch (err) {
    return failure("LOCATION_CREATE_FAILED", err, "Couldn't add the location");
  }
}

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  addressLine: z.string().trim().max(300).optional(),
  timezone: z.string().max(64).optional(),
  status: z.enum(["active", "closed"]).optional(),
});

export async function PATCH(request: NextRequest) {
  const guard = await guardApiRequest(request, { allowedRoles: ["owner", "manager"], requireTenant: true });
  if ("response" in guard) return guard.response;
  try {
    const { id, ...changes } = updateSchema.parse(await request.json());
    return NextResponse.json({ data: await updateLocation(guard.ctx, id, changes) });
  } catch (err) {
    return failure("LOCATION_UPDATE_FAILED", err, "Couldn't update the location");
  }
}
