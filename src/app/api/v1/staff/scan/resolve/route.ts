import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { resolveMemberQrForStaff } from "@/server/services/member";
import { z } from "zod";

const resolveSchema = z.object({
  token: z.string().min(1, "QR token is required"),
  locationId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager", "staff"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  try {
    const body = await request.json();
    const validated = resolveSchema.parse(body);

    const summary = await resolveMemberQrForStaff(
      guard.ctx,
      validated.token,
      validated.locationId
    );

    return NextResponse.json({ data: summary });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "SCAN_RESOLVE_FAILED",
          message: err instanceof Error ? err.message : "Failed to resolve QR",
        },
      },
      { status: 400 }
    );
  }
}
