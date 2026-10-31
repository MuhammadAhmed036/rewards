import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardApiRequest } from "@/server/auth/route-guard";
import { getSupportView } from "@/server/services/support-access";

export async function GET(request: NextRequest, props: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await props.params;
  const guard = await guardApiRequest(request, { allowedRoles: ["support_agent"] });
  if ("response" in guard) return guard.response;
  try {
    z.string().uuid().parse(tenantId);
    return NextResponse.json({ data: await getSupportView(guard.ctx, tenantId, request.nextUrl.searchParams.get("member") || undefined) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't load";
    return NextResponse.json({ error: { code: message.startsWith("FORBIDDEN") ? "FORBIDDEN" : "SUPPORT_FAILED", message: message.replace(/^FORBIDDEN:\s*/, "") } }, { status: message.startsWith("FORBIDDEN") ? 403 : 400 });
  }
}
