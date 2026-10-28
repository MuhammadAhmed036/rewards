import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { countUnreadBusinessConversations } from "@/server/services/conversations";

/** Number of open chats with an unanswered customer message (for the Messages badge). */
export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager", "staff"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  try {
    return NextResponse.json({ data: { unread: await countUnreadBusinessConversations(guard.ctx) } });
  } catch {
    return NextResponse.json({ data: { unread: 0 } });
  }
}
