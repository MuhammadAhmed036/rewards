import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardApiRequest } from "@/server/auth/route-guard";
import { listSupportAgents, setSupportAgent } from "@/server/services/support-access";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, { allowedRoles: ["platform_admin"] });
  if ("response" in guard) return guard.response;
  return NextResponse.json({ data: await listSupportAgents(guard.ctx) });
}

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, { allowedRoles: ["platform_admin"] });
  if ("response" in guard) return guard.response;
  try {
    const { email, enabled } = z.object({ email: z.string().email(), enabled: z.boolean() }).parse(await request.json());
    return NextResponse.json({ data: await setSupportAgent(guard.ctx, email, enabled) });
  } catch (err) {
    const message = err instanceof z.ZodError ? err.errors[0]?.message ?? "Check the email." : err instanceof Error ? err.message : "Couldn't change that.";
    return NextResponse.json({ error: { code: "SUPPORT_AGENT_FAILED", message } }, { status: 400 });
  }
}
