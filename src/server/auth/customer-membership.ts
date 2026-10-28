import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import { memberships } from "../db/schema";
import { getSessionContext } from "./index";
import { readSessionCookie } from "./session-response";
import { and, eq } from "drizzle-orm";

/**
 * Confirms the signed-in user owns the membership they are acting on.
 * Customer endpoints take a membershipId from the client; without this check
 * anyone who learned an id could act on someone else's card.
 */
export async function requireOwnMembership(
  request: NextRequest,
  membershipId: string,
  tenantId?: string
): Promise<{ membership: { id: string; tenantId: string; userId: string } } | { response: NextResponse }> {
  const token = readSessionCookie(request);
  const ctx = await getSessionContext(token);
  if (!ctx) {
    return {
      response: NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Please sign in to your card first" } },
        { status: 401 }
      ),
    };
  }

  const [membership] = await db
    .select({ id: memberships.id, tenantId: memberships.tenantId, userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.id, membershipId),
        eq(memberships.userId, ctx.userId),
        ...(tenantId ? [eq(memberships.tenantId, tenantId)] : [])
      )
    )
    .limit(1);

  if (!membership) {
    return {
      response: NextResponse.json(
        { error: { code: "FORBIDDEN", message: "This card belongs to a different account" } },
        { status: 403 }
      ),
    };
  }
  return { membership };
}
