import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { getSupportReports, resolveSupportReport } from "@/server/services/support";
import { z } from "zod";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  const status = request.nextUrl.searchParams.get("status") as "open" | "resolved" | undefined;

  try {
    const reports = await getSupportReports(guard.ctx, { status });
    return NextResponse.json({ success: true, data: reports });
  } catch (err) {
    return NextResponse.json(
      { error: { message: err instanceof Error ? err.message : "Failed to load support reports" } },
      { status: 500 }
    );
  }
}

const resolveSchema = z.object({
  reportId: z.string().uuid("Invalid report ID"),
  issueManualPoints: z.number().int().min(0).optional(),
  reasonCode: z.enum(["goodwill", "correction", "fraud_removal", "other"]).optional(),
  note: z.string().max(500).optional(),
});

export async function PATCH(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  try {
    const body = await request.json().catch(() => ({}));
    const validated = resolveSchema.parse(body);

    const result = await resolveSupportReport(guard.ctx, validated.reportId, {
      issueManualPoints: validated.issueManualPoints,
      reasonCode: validated.reasonCode,
      note: validated.note,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    return NextResponse.json(
      { error: { message: err instanceof Error ? err.message : "Failed to resolve support report" } },
      { status: 400 }
    );
  }
}

