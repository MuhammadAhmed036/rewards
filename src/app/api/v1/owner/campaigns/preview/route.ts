import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { previewAudience } from "@/server/services/campaigns";

/** How many customers an offer would reach with these filters, before sending. */
export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, { allowedRoles: ["owner", "manager", "marketing"], requireTenant: true });
  if ("response" in guard) return guard.response;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({ data: await previewAudience(guard.ctx, body.audience) });
  } catch (err) {
    return NextResponse.json(
      { error: { code: "PREVIEW_FAILED", message: err instanceof Error ? err.message : "Couldn't count customers" } },
      { status: 400 }
    );
  }
}
