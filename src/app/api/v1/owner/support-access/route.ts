import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardApiRequest } from "@/server/auth/route-guard";
import { grantSupportAccess, listSupportGrants, revokeSupportAccess } from "@/server/services/support-access";

const guardOptions = { allowedRoles: ["owner" as const], requireTenant: true };

function failure(code: string, err: unknown, fallback: string) {
  const message = err instanceof z.ZodError ? err.errors[0]?.message || fallback : err instanceof Error ? err.message : fallback;
  return NextResponse.json({ error: { code, message } }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, guardOptions);
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await listSupportGrants(guard.ctx) });
  } catch (err) {
    return failure("SUPPORT_LOAD_FAILED", err, "Couldn't load support access");
  }
}

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, guardOptions);
  if ("response" in guard) return guard.response;
  try {
    const body = z.object({ hours: z.number().int(), reason: z.string() }).parse(await request.json().catch(() => ({})));
    return NextResponse.json({ data: await grantSupportAccess(guard.ctx, body) }, { status: 201 });
  } catch (err) {
    return failure("SUPPORT_GRANT_FAILED", err, "Couldn't allow support access");
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await guardApiRequest(request, guardOptions);
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await revokeSupportAccess(guard.ctx, z.string().uuid().parse(request.nextUrl.searchParams.get("id"))) });
  } catch (err) {
    return failure("SUPPORT_REVOKE_FAILED", err, "Couldn't end support access");
  }
}
