import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { guardApiRequest } from "@/server/auth/route-guard";
import { verifyPassword } from "@/server/auth";
import { hasRecentAuth, markReauthed } from "@/server/auth/reauth";
import { issueEmailCode, verifyEmailCode, CodeError } from "@/server/services/email-codes";
import { assertRateLimit, RateLimitError, rateLimitResponse } from "@/server/security/rate-limit";

/** Has this session confirmed itself recently, and how can it do so? */
export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request);
  if ("response" in guard) return guard.response;
  const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, guard.ctx.userId)).limit(1);
  return NextResponse.json({ data: { recent: await hasRecentAuth(request), hasPassword: Boolean(user?.passwordHash) } });
}

const bodySchema = z.union([
  z.object({ password: z.string().min(1) }),
  z.object({ sendCode: z.literal(true) }),
  z.object({ code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your email.") }),
]);

/** Confirm with the password, or with a code emailed to the account's address. */
export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request);
  if ("response" in guard) return guard.response;
  const userId = guard.ctx.userId;

  try {
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in again." } }, { status: 401 });

    if ("sendCode" in body) {
      await issueEmailCode({ userId, email: user.email, purpose: "reauth" });
      return NextResponse.json({ data: { sent: true } });
    }

    if ("password" in body) {
      await assertRateLimit(`reauth:${userId}`, 5, 600, "RATE_LIMITED: Too many wrong passwords. Try again in 10 minutes.");
      if (!user.passwordHash || !(await verifyPassword(body.password, user.passwordHash))) {
        return NextResponse.json({ error: { code: "INVALID_CREDENTIALS", message: "That password is not right." } }, { status: 401 });
      }
    } else {
      await verifyEmailCode({ userId, purpose: "reauth", code: body.code });
    }

    await markReauthed(request);
    return NextResponse.json({ data: { recent: true } });
  } catch (err) {
    if (err instanceof RateLimitError) return rateLimitResponse(err);
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "BAD_REQUEST", message: err.errors[0]?.message || "Check what you entered." } }, { status: 400 });
    }
    if (err instanceof CodeError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.code === "CODE_INVALID" ? 401 : 502 });
    }
    console.error("Re-authentication failed:", err);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } }, { status: 500 });
  }
}
