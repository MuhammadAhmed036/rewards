import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { getPlatformAuditLogs } from "@/server/services/admin";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["platform_admin"],
  });
  if ("response" in guard) return guard.response;

  const searchParams = request.nextUrl.searchParams;
  const tenantId = searchParams.get("tenantId") || undefined;
  const action = searchParams.get("action") || undefined;
  const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : undefined;

  const logs = await getPlatformAuditLogs(guard.ctx, { tenantId, action, limit });
  return NextResponse.json({ data: logs });
}
