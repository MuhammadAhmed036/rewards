import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardApiRequest } from "@/server/auth/route-guard";
import { requireRecentAuth } from "@/server/auth/reauth";
import { getDomainSettings, removeCustomDomain, setCustomDomain, verifyCustomDomain } from "@/server/services/custom-domain";

const guardOptions = { allowedRoles: ["owner" as const], requireTenant: true };

function failure(code: string, err: unknown, fallback: string) {
  const message = err instanceof z.ZodError ? err.errors[0]?.message || fallback : err instanceof Error ? err.message : fallback;
  return NextResponse.json({ error: { code, message } }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, guardOptions);
  if ("response" in guard) return guard.response;
  return NextResponse.json({ data: await getDomainSettings(guard.ctx) });
}

const bodySchema = z.discriminatedUnion("action", [z.object({ action: z.literal("set"), domain: z.string().min(1) }), z.object({ action: z.literal("verify") })]);

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, guardOptions);
  if ("response" in guard) return guard.response;
  try {
    const body = bodySchema.parse(await request.json());
    if (body.action === "set") {
      // Pointing the shop's public address somewhere is a sensitive change
      const denied = await requireRecentAuth(request);
      if (denied) return denied;
      return NextResponse.json({ data: await setCustomDomain(guard.ctx, body.domain) });
    }
    return NextResponse.json({ data: await verifyCustomDomain(guard.ctx) });
  } catch (err) {
    return failure("DOMAIN_FAILED", err, "Couldn't change your address");
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await guardApiRequest(request, guardOptions);
  if ("response" in guard) return guard.response;
  const denied = await requireRecentAuth(request);
  if (denied) return denied;
  return NextResponse.json({ data: await removeCustomDomain(guard.ctx) });
}
