import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { listPlatformCustomers } from "@/server/services/admin";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["platform_admin"],
  });
  if ("response" in guard) return guard.response;

  const { ctx } = guard;
  const q = request.nextUrl.searchParams.get("q") || undefined;
  const tenantId = request.nextUrl.searchParams.get("tenantId") || undefined;

  try {
    const customers = await listPlatformCustomers(ctx, { q, tenantId });
    return NextResponse.json({ data: customers });
  } catch (err) {
    return NextResponse.json(
      { error: { message: err instanceof Error ? err.message : "Failed to load customers" } },
      { status: 500 }
    );
  }
}
