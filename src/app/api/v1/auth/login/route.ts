import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { verifyPassword } from "@/server/auth";
import { completeSignIn } from "@/server/auth/sign-in";
import { issueEmailCode, CodeError } from "@/server/services/email-codes";
import crypto from "crypto";
import { checkPortalAccess } from "@/server/auth/portal-access";
import { checkAuthIpRateLimit, checkLoginRateLimit, RateLimitError, rateLimitResponse } from "@/server/security/rate-limit";
import { eq } from "drizzle-orm";
import { z } from "zod";

/** "j***@gmail.com": enough to recognise the inbox without handing it to a stranger. */
function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 1)}***@${domain}`;
}

// A valid-looking password hash that matches nothing, used only to keep sign-in timing the same for unknown emails
const DUMMY_HASH = `${"0".repeat(32)}:${"0".repeat(128)}`;

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required").max(256, "Password is too long"),
  // Which sign-in form was used; each one only lets in the matching kind of account
  portal: z.enum(["customer", "staff", "owner", "admin"]).optional(),
  tenantSlug: z.string().min(1).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const validated = loginSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: validated.error.errors[0]?.message || "Invalid input" } },
        { status: 400 }
      );
    }

    const email = validated.data.email.toLowerCase().trim();
    await checkAuthIpRateLimit(request, "login");
    await checkLoginRateLimit(email);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || !user.passwordHash) {
      // Do the same amount of work as for a real account, so the time taken doesn't reveal which emails exist
      await verifyPassword(validated.data.password, DUMMY_HASH).catch(() => false);
      return NextResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(validated.data.password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } },
        { status: 401 }
      );
    }

    if (validated.data.portal) {
      const access = await checkPortalAccess(user.id, validated.data.portal, validated.data.tenantSlug);
      if (!access.ok) {
        // Correct password, wrong door: no session is created.
        return NextResponse.json({ error: { code: access.code, message: access.message } }, { status: 403 });
      }
    }

    // Some people ask for an emailed code after the password; the sign-in finishes on /login/verify
    if (user.mfaEmailEnabled) {
      const challengeId = crypto.randomUUID();
      try {
        await issueEmailCode({ userId: user.id, email: user.email, purpose: "login", challengeId });
      } catch (err) {
        if (err instanceof CodeError) {
          return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 502 });
        }
        throw err;
      }
      return NextResponse.json({
        success: true,
        data: { mfaRequired: true, challenge: `${user.id}.${challengeId}`, emailHint: maskEmail(user.email) },
      });
    }

    return await completeSignIn(request, user);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return rateLimitResponse(error);
    }
    console.error("Login error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Authentication failed. Please try again." } },
      { status: 500 }
    );
  }
}

