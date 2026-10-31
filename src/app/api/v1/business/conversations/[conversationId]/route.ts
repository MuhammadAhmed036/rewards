import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { getBusinessConversation, replyAsBusiness } from "@/server/services/conversations";
import { z } from "zod";

type Params = { params: Promise<{ conversationId: string }> };

function fail(err: unknown, fallback: string) {
  return NextResponse.json(
    { error: { code: "CHAT_FAILED", message: err instanceof Error ? err.message : fallback } },
    { status: 400 }
  );
}

/** One chat with all its messages; opening it marks it read for the shop. */
export async function GET(request: NextRequest, { params }: Params) {
  const guard = await guardApiRequest(request, { allowedRoles: ["owner", "manager", "staff"], requireTenant: true });
  if ("response" in guard) return guard.response;
  const { conversationId } = await params;
  if (!z.string().uuid().safeParse(conversationId).success) return fail(new Error("Conversation not found"), "");

  try {
    return NextResponse.json({ data: await getBusinessConversation(guard.ctx, conversationId) });
  } catch (err) {
    return fail(err, "Couldn't load this chat");
  }
}

const replySchema = z.object({ body: z.string() });

/** Staff, manager or owner replies to the customer. */
export async function POST(request: NextRequest, { params }: Params) {
  const guard = await guardApiRequest(request, { allowedRoles: ["owner", "manager", "staff"], requireTenant: true });
  if ("response" in guard) return guard.response;
  const { conversationId } = await params;
  if (!z.string().uuid().safeParse(conversationId).success) return fail(new Error("Conversation not found"), "");

  try {
    const { body } = replySchema.parse(await request.json().catch(() => ({})));
    await replyAsBusiness(guard.ctx, conversationId, body);
    return NextResponse.json({ data: await getBusinessConversation(guard.ctx, conversationId) });
  } catch (err) {
    return fail(err, "Couldn't send your reply");
  }
}
