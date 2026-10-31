import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardApiRequest } from "@/server/auth/route-guard";
import { setLiveQr, tenantUsesLiveQr } from "@/server/services/member";

const guardOptions = { allowedRoles: ["owner" as const], requireTenant: true };

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, guardOptions);
  if ("response" in guard) return guard.response;
  return NextResponse.json({ data: { enabled: await tenantUsesLiveQr(guard.ctx.tenantId!) } });
}

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, guardOptions);
  if ("response" in guard) return guard.response;
  try {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(await request.json());
    return NextResponse.json({ data: await setLiveQr(guard.ctx, enabled) });
  } catch (err) {
    return NextResponse.json({ error: { code: "LIVE_QR_FAILED", message: err instanceof Error ? err.message : "Couldn't change that." } }, { status: 400 });
  }
}
