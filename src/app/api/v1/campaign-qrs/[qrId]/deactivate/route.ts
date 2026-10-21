import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { deactivateCampaignQr } from "@/server/services/campaign-qr";

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ qrId: string }> }
) {
  const params = await props.params;
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager", "staff", "platform_admin"],
  });
  if ("response" in guard) return guard.response;

  try {
    const updated = await deactivateCampaignQr(guard.ctx, params.qrId);
    return NextResponse.json({ data: updated });
  } catch (err) {
    return NextResponse.json(
      { error: { message: err instanceof Error ? err.message : "Failed to deactivate QR code" } },
      { status: 400 }
    );
  }
}

