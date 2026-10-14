import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { updateMarketingConsent } from "@/server/services/privacy";
import { z } from "zod";

const consentSchema = z.object({
  membershipId: z.string().uuid(),
  granted: z.boolean(),
  source: z.string().optional(),
});

export async function PATCH(request: NextRequest) {
  const guard = await guardApiRequest(request);
  if ("response" in guard) return guard.response;

  try {
    const body = await request.json();
    const validated = consentSchema.parse(body);

    const updated = await updateMarketingConsent(guard.ctx.userId, validated);
    return NextResponse.json({ data: updated });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "UPDATE_FAILED",
          message: err instanceof Error ? err.message : "Failed to update marketing consent",
        },
      },
      { status: 400 }
    );
  }
}

