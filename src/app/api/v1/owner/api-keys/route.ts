import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardApiRequest } from "@/server/auth/route-guard";
import { requireRecentAuth } from "@/server/auth/reauth";
import { API_SCOPES, createApiKey, listApiKeys, revokeApiKey } from "@/server/services/api-keys";

const guardOptions = { allowedRoles: ["owner" as const], requireTenant: true };

function failure(code: string, err: unknown, fallback: string) {
  const message = err instanceof z.ZodError ? err.errors[0]?.message || fallback : err instanceof Error ? err.message : fallback;
  return NextResponse.json({ error: { code, message } }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, guardOptions);
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: { keys: await listApiKeys(guard.ctx), scopes: API_SCOPES } });
  } catch (err) {
    return failure("KEYS_LOAD_FAILED", err, "Couldn't load your keys");
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(80),
  scopes: z.array(z.string()).min(1, "Choose what this key may do."),
  expiresInDays: z.number().int().min(1).max(730).optional(),
});

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, guardOptions);
  if ("response" in guard) return guard.response;
  const denied = await requireRecentAuth(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ data: await createApiKey(guard.ctx, createSchema.parse(await request.json())) }, { status: 201 });
  } catch (err) {
    return failure("KEY_CREATE_FAILED", err, "Couldn't make that key");
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await guardApiRequest(request, guardOptions);
  if ("response" in guard) return guard.response;
  const denied = await requireRecentAuth(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ data: await revokeApiKey(guard.ctx, z.string().uuid().parse(request.nextUrl.searchParams.get("id"))) });
  } catch (err) {
    return failure("KEY_REVOKE_FAILED", err, "Couldn't revoke that key");
  }
}
