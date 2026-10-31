import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { getMemberStampCards, staffAddStamp } from "@/server/services/stamp-cards";
import { staffGiveStampReward } from "@/server/services/campaign-qr";
import { db } from "@/server/db";
import { memberships } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const stampSchema = z.object({
  membershipId: z.string().uuid(),
  offerId: z.string().uuid(),
  action: z.enum(["add", "give_reward"]),
});

/** Staff add a stamp for a qualifying purchase, or hand over a full card's reward. */
export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager", "staff"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  try {
    const body = stampSchema.parse(await request.json().catch(() => ({})));
    const tenantId = guard.ctx.tenantId!;

    const [member] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.id, body.membershipId), eq(memberships.tenantId, tenantId)))
      .limit(1);
    if (!member) throw new Error("Customer not found for this business");

    let message: string;
    if (body.action === "add") {
      const result = await staffAddStamp(guard.ctx, body);
      message = result.added
        ? result.card.state === "ready"
          ? "Stamp added. The card is full, so you can hand over the reward."
          : `Stamp added (${result.card.stamps} of ${result.card.requiredStamps}).`
        : result.reason === "pending"
        ? "This card's reward is already waiting to be handed over."
        : "This card is already full. Hand over the reward instead.";
    } else {
      await staffGiveStampReward(guard.ctx, body);
      message = "Reward handed over. A new card has started.";
    }

    const stampCards = await getMemberStampCards(tenantId, body.membershipId, { includeUnstarted: true });
    return NextResponse.json({ data: { message, stampCards } });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "STAMP_ACTION_FAILED",
          message: err instanceof Error ? err.message.replace(/^CARD_NOT_FULL: /, "") : "Stamp action failed",
        },
      },
      { status: 400 }
    );
  }
}
