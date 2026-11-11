import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSession, sessionKindForUser } from "@/server/auth";
import { setSessionCookie } from "@/server/auth/session-response";
import { checkAuthIpRateLimit, RateLimitError, rateLimitResponse } from "@/server/security/rate-limit";
import { acceptHouseholdInvite, getInvite } from "@/server/services/household";

/** The link in the invitation email: show who invited you, then agree to share the card. */

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/, "This invitation link isn't valid.");

function failure(err: unknown, fallback: string) {
  if (err instanceof RateLimitError) return rateLimitResponse(err);
  const message = err instanceof z.ZodError ? err.errors[0]?.message || fallback : err instanceof Error ? err.message : fallback;
  return NextResponse.json({ error: { code: "HOUSEHOLD_INVITE_INVALID", message } }, { status: 400 });
}

export async function GET(request: NextRequest) {
  try {
    await checkAuthIpRateLimit(request, "reset");
    const token = tokenSchema.parse(request.nextUrl.searchParams.get("token") ?? "");
    return NextResponse.json({ data: await getInvite(token) });
  } catch (err) {
    return failure(err, "This invitation isn't valid.");
  }
}

export async function POST(request: NextRequest) {
  try {
    await checkAuthIpRateLimit(request, "reset");
    const { token } = z.object({ token: tokenSchema }).parse(await request.json().catch(() => ({})));
    const result = await acceptHouseholdInvite(token);
    // Opening the emailed link proves the mailbox is theirs, so they are signed in to the shared card
    const session = await createSession(result.userId, await sessionKindForUser(result.userId));
    const response = NextResponse.json({ data: { slug: result.slug } });
    setSessionCookie(response, session);
    return response;
  } catch (err) {
    return failure(err, "Couldn't accept the invitation.");
  }
}
