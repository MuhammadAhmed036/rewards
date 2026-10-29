import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardApiRequest } from "@/server/auth/route-guard";
import { listCampaigns, sendCampaign } from "@/server/services/campaigns";

const ROLES = ["owner", "manager", "marketing"] as const;

function failure(code: string, err: unknown, fallback: string) {
  const message = err instanceof z.ZodError ? err.errors[0]?.message || fallback : err instanceof Error ? err.message : fallback;
  return NextResponse.json({ error: { code, message } }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, { allowedRoles: [...ROLES], requireTenant: true });
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await listCampaigns(guard.ctx) });
  } catch (err) {
    return failure("CAMPAIGNS_LOAD_FAILED", err, "Couldn't load your offers");
  }
}

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, { allowedRoles: [...ROLES], requireTenant: true });
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await sendCampaign(guard.ctx, await request.json()) }, { status: 201 });
  } catch (err) {
    return failure("CAMPAIGN_SEND_FAILED", err, "Couldn't send the offer");
  }
}
