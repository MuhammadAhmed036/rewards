import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { updateMarketingConsent, updateCardEmails } from "@/server/services/privacy";
import { z } from "zod";

const consentSchema = z.object({
  membershipId: z.string().uuid(),
  granted: z.boolean(),
  source: z.string().optional(),
  // "marketing" = offers from the shop; "card" = service emails about this card (welcome, rewards, receipts)
  kind: z.enum(["marketing", "card"]).default("marketing"),
});

export async function PATCH(request: NextRequest) {
  const guard = await guardApiRequest(request);
  if ("response" in guard) return guard.response;

  try {
    const body = await request.json().catch(() => ({}));
    const validated = consentSchema.parse(body);

    const updated =
      validated.kind === "card"
        ? await updateCardEmails(guard.ctx.userId, validated.membershipId, validated.granted)
        : await updateMarketingConsent(guard.ctx.userId, validated);
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

