import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { listBusinessConversations } from "@/server/services/conversations";

/** Customer chats for the signed-in owner, manager or staff member's shop. ?status=open|closed|all */
export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager", "staff"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  const raw = request.nextUrl.searchParams.get("status");
  const status = raw === "closed" || raw === "all" ? raw : "open";
  try {
    return NextResponse.json({ data: await listBusinessConversations(guard.ctx, status) });
  } catch (err) {
    return NextResponse.json(
      { error: { code: "CHAT_LIST_FAILED", message: err instanceof Error ? err.message : "Couldn't load messages" } },
      { status: 400 }
    );
  }
}
