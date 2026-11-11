import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardApiRequest } from "@/server/auth/route-guard";
import { getBenchmarks, setBenchmarkParticipation } from "@/server/services/benchmarks";

/** Comparison with other shops that chose to take part (FR-105). Owners only. */
export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, { allowedRoles: ["owner"], requireTenant: true });
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await getBenchmarks(guard.ctx) });
  } catch (err) {
    return NextResponse.json(
      { error: { code: "BENCHMARKS_FAILED", message: err instanceof Error ? err.message : "Couldn't load the comparison" } },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, { allowedRoles: ["owner"], requireTenant: true });
  if ("response" in guard) return guard.response;
  try {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(await request.json().catch(() => ({})));
    return NextResponse.json({ data: await setBenchmarkParticipation(guard.ctx, enabled) });
  } catch (err) {
    return NextResponse.json(
      { error: { code: "BENCHMARKS_FAILED", message: err instanceof Error ? err.message : "Couldn't change that" } },
      { status: 400 }
    );
  }
}
