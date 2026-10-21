import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { approvePromoClaim } from "@/server/services/campaign-qr";

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ scanId: string }> }
) {
  const params = await props.params;
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager", "staff", "platform_admin"],
  });
  if ("response" in guard) return guard.response;

  try {
    const result = await approvePromoClaim(guard.ctx, params.scanId);
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: { message: err instanceof Error ? err.message : "Failed to approve claim" } },
      { status: 400 }
    );
  }
}
