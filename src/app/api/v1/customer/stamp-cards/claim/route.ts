import { NextRequest, NextResponse } from "next/server";
import { requireOwnMembership } from "@/server/auth/customer-membership";
import { claimStampCard } from "@/server/services/stamp-cards";
import { z } from "zod";

const claimSchema = z.object({
  membershipId: z.string().uuid(),
  offerId: z.string().uuid(),
});

/** Customer claims a full stamp card; staff then hand the reward over at the till. */
export async function POST(request: NextRequest) {
  try {
    const body = claimSchema.parse(await request.json());

    const owned = await requireOwnMembership(request, body.membershipId);
    if ("response" in owned) return owned.response;

    const card = await claimStampCard({
      tenantId: owned.membership.tenantId,
      membershipId: body.membershipId,
      offerId: body.offerId,
    });

    return NextResponse.json({ data: card });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "STAMP_CLAIM_FAILED",
          message: err instanceof Error ? err.message.replace(/^CARD_NOT_FULL: /, "") : "Failed to claim reward",
        },
      },
      { status: 400 }
    );
  }
}
