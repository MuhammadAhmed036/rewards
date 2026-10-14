import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { getSystemHealth } from "@/server/services/admin";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["platform_admin"],
  });
  if ("response" in guard) return guard.response;

  const health = await getSystemHealth(guard.ctx);
  return NextResponse.json({ data: health });
}

