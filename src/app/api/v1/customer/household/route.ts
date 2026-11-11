import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/server/auth";
import { isBusinessAccount } from "@/server/auth/portal-access";
import { readSessionCookie } from "@/server/auth/session-response";
import { assertRateLimit, RateLimitError, rateLimitResponse } from "@/server/security/rate-limit";
import { getHousehold, inviteToHousehold, removeFromHousehold } from "@/server/services/household";

/** Household cards (FR-029): who shares a card, invite someone, remove someone or leave. Customers only. */

async function customerId(request: NextRequest) {
  const ctx = await getSessionContext(readSessionCookie(request));
  if (!ctx || (await isBusinessAccount(ctx.userId))) return null;
  return ctx.userId;
}

const unauthorised = () =>
  NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Please sign in to your card first" } }, { status: 401 });

function failure(code: string, err: unknown, fallback: string) {
  if (err instanceof RateLimitError) return rateLimitResponse(err);
  const message = err instanceof z.ZodError ? err.errors[0]?.message || fallback : err instanceof Error ? err.message : fallback;
  return NextResponse.json({ error: { code, message } }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const userId = await customerId(request);
  if (!userId) return unauthorised();
  try {
    const membershipId = z.string().uuid().parse(request.nextUrl.searchParams.get("membershipId"));
    return NextResponse.json({ data: await getHousehold(userId, membershipId) });
  } catch (err) {
    return failure("HOUSEHOLD_LOAD_FAILED", err, "Couldn't load who shares this card");
  }
}

const inviteSchema = z.object({
  membershipId: z.string().uuid(),
  email: z.string().email("Enter a valid email address"),
  name: z.string().max(120).optional(),
});

export async function POST(request: NextRequest) {
  const userId = await customerId(request);
  if (!userId) return unauthorised();
  try {
    // Every invitation sends an email to a stranger, so keep it to a few an hour
    await assertRateLimit(`household-invite:${userId}`, 6, 3600, "RATE_LIMITED: Too many invitations. Try again in a while.");
    const body = inviteSchema.parse(await request.json().catch(() => ({})));
    const invite = await inviteToHousehold(userId, body.membershipId, body.email, body.name);
    return NextResponse.json({ data: { email: invite.email, expiresAt: invite.expiresAt } }, { status: 201 });
  } catch (err) {
    return failure("HOUSEHOLD_INVITE_FAILED", err, "Couldn't send the invitation");
  }
}

export async function DELETE(request: NextRequest) {
  const userId = await customerId(request);
  if (!userId) return unauthorised();
  try {
    const id = z.string().uuid().parse(request.nextUrl.searchParams.get("id"));
    return NextResponse.json({ data: await removeFromHousehold(userId, id) });
  } catch (err) {
    return failure("HOUSEHOLD_REMOVE_FAILED", err, "Couldn't make that change");
  }
}
