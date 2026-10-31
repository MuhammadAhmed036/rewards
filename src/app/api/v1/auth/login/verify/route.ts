import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { completeSignIn } from "@/server/auth/sign-in";
import { verifyEmailCode, CodeError } from "@/server/services/email-codes";
import { checkAuthIpRateLimit, RateLimitError, rateLimitResponse } from "@/server/security/rate-limit";

const bodySchema = z.object({
  challenge: z.string().regex(/^[0-9a-f-]{36}\.[0-9a-f-]{36}$/i, "Start the sign-in again."),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your email."),
});

/** Second step of a sign-in that uses an emailed code. */
export async function POST(request: NextRequest) {
  try {
    await checkAuthIpRateLimit(request, "login-code");
    const { challenge, code } = bodySchema.parse(await request.json().catch(() => ({})));
    const [userId, challengeId] = challenge.split(".");
    await verifyEmailCode({ userId, purpose: "login", code, challengeId });

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.deletedAt) {
      return NextResponse.json({ error: { code: "INVALID_CREDENTIALS", message: "Start the sign-in again." } }, { status: 401 });
    }
    return await completeSignIn(request, user);
  } catch (err) {
    if (err instanceof RateLimitError) return rateLimitResponse(err);
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "BAD_REQUEST", message: err.errors[0]?.message } }, { status: 400 });
    }
    if (err instanceof CodeError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 401 });
    }
    console.error("Sign-in code check failed:", err);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } }, { status: 500 });
  }
}
