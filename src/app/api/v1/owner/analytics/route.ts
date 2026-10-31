import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { ANALYTICS_RANGES, getAnalytics, type AnalyticsRange } from "@/server/services/analytics";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, { allowedRoles: ["owner", "manager"], requireTenant: true });
  if ("response" in guard) return guard.response;

  const requested = request.nextUrl.searchParams.get("range") ?? "30d";
  const range = (requested in ANALYTICS_RANGES ? requested : "30d") as AnalyticsRange;
  try {
    return NextResponse.json({ data: await getAnalytics(guard.ctx, range) });
  } catch (err) {
    return NextResponse.json(
      { error: { code: "ANALYTICS_FAILED", message: err instanceof Error ? err.message : "Couldn't load your insights" } },
      { status: 400 }
    );
  }
}
