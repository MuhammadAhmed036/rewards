import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { previewEarn } from "@/server/services/ledger";
import { z } from "zod";

const previewSchema = z.object({
  membershipId: z.string().uuid(),
  locationId: z.string().uuid(),
  amountMinor: z.number().int().min(0).optional(),
  tipMinor: z.number().int().min(0).optional(),
  excludedMinor: z.number().int().min(0).optional(),
});

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager", "staff"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  try {
    const body = await request.json().catch(() => ({}));
    const validated = previewSchema.parse(body);

    const result = await previewEarn(guard.ctx, validated);
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "PREVIEW_FAILED",
          message: err instanceof Error ? err.message : "Failed to calculate preview",
        },
      },
      { status: 400 }
    );
  }
}

