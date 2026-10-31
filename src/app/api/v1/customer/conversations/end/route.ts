import { NextRequest, NextResponse } from "next/server";
import { requireOwnMembership } from "@/server/auth/customer-membership";
import { endCustomerConversation, getCustomerConversations } from "@/server/services/conversations";
import { z } from "zod";

const endSchema = z.object({
  membershipId: z.string().uuid(),
  conversationId: z.string().uuid(),
});

/** Only the customer can end their chat; the business keeps a read-only copy. */
export async function POST(request: NextRequest) {
  try {
    const body = endSchema.parse(await request.json().catch(() => ({})));
    const owned = await requireOwnMembership(request, body.membershipId);
    if ("response" in owned) return owned.response;

    await endCustomerConversation(owned.membership.tenantId, body.membershipId, owned.membership.userId, body.conversationId);
    return NextResponse.json({ data: await getCustomerConversations(owned.membership.tenantId, body.membershipId) });
  } catch (err) {
    return NextResponse.json(
      { error: { code: "CHAT_END_FAILED", message: err instanceof Error ? err.message : "Couldn't end the chat" } },
      { status: 400 }
    );
  }
}
