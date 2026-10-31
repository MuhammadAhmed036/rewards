import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { listAccessibleTenants } from "@/server/services/support-access";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, { allowedRoles: ["support_agent"] });
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await listAccessibleTenants(guard.ctx) });
  } catch (err) {
    return NextResponse.json({ error: { code: "SUPPORT_FAILED", message: err instanceof Error ? err.message : "Couldn't load" } }, { status: 400 });
  }
}
