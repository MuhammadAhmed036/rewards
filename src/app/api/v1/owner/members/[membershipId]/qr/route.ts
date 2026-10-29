import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { revokeMemberQr } from "@/server/services/member";

/** Cancels a customer's current QR code (lost or shared phone); their card shows a new one (FR-038). */
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ membershipId: string }> }
) {
  const { membershipId } = await props.params;
  const guard = await guardApiRequest(request, { allowedRoles: ["owner", "manager"], requireTenant: true });
  if ("response" in guard) return guard.response;

  try {
    await revokeMemberQr(guard.ctx, membershipId);
    return NextResponse.json({ data: { revoked: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message.replace(/^FORBIDDEN: /, "") : "Couldn't cancel the QR code";
    return NextResponse.json({ error: { code: "QR_REVOKE_FAILED", message } }, { status: 400 });
  }
}
