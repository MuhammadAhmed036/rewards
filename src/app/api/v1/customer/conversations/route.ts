import { NextRequest, NextResponse } from "next/server";
import { requireOwnMembership } from "@/server/auth/customer-membership";
import { getCustomerConversations, sendCustomerMessage } from "@/server/services/conversations";
import { z } from "zod";

function fail(err: unknown, fallback: string) {
  return NextResponse.json(
    { error: { code: "CHAT_FAILED", message: err instanceof Error ? err.message : fallback } },
    { status: 400 }
  );
}

/** The signed-in customer's chat with this shop. */
export async function GET(request: NextRequest) {
  const membershipId = request.nextUrl.searchParams.get("membershipId") || "";
  if (!z.string().uuid().safeParse(membershipId).success) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "membershipId is required" } }, { status: 400 });
  }
  const owned = await requireOwnMembership(request, membershipId);
  if ("response" in owned) return owned.response;

  try {
    return NextResponse.json({ data: await getCustomerConversations(owned.membership.tenantId, membershipId) });
  } catch (err) {
    return fail(err, "Couldn't load your messages");
  }
}

const sendSchema = z.object({
  membershipId: z.string().uuid(),
  body: z.string(),
});

/** Customer sends a message to the shop. */
export async function POST(request: NextRequest) {
  try {
    const body = sendSchema.parse(await request.json().catch(() => ({})));
    const owned = await requireOwnMembership(request, body.membershipId);
    if ("response" in owned) return owned.response;

    await sendCustomerMessage(owned.membership.tenantId, body.membershipId, owned.membership.userId, body.body);
    return NextResponse.json({ data: await getCustomerConversations(owned.membership.tenantId, body.membershipId) });
  } catch (err) {
    return fail(err, "Couldn't send your message");
  }
}
