import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { guardApiRequest } from "@/server/auth/route-guard";
import { requireRecentAuth } from "@/server/auth/reauth";
import { issueEmailCode, verifyEmailCode, CodeError } from "@/server/services/email-codes";
import { logAuditEvent } from "@/server/services/audit";
import { RateLimitError, rateLimitResponse } from "@/server/security/rate-limit";
import type { UserRole } from "@/server/security/permissions";

// Anyone who works for a business, and platform admins; customers keep the simple sign-in
const ROLES: UserRole[] = ["owner", "manager", "staff", "marketing", "platform_admin"];

/** Whether this person's sign-in asks for an emailed code. */
export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, { allowedRoles: ROLES });
  if ("response" in guard) return guard.response;
  const [user] = await db.select({ on: users.mfaEmailEnabled, email: users.email }).from(users).where(eq(users.id, guard.ctx.userId)).limit(1);
  return NextResponse.json({ data: { enabled: Boolean(user?.on), email: user?.email } });
}

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send") }),
  z.object({ action: z.literal("enable"), code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your email.") }),
  z.object({ action: z.literal("disable") }),
]);

/**
 * Turning codes on needs a code sent to the inbox first, so nobody locks themselves out with an
 * address that does not work. Turning them off needs a recent password or code confirmation.
 */
export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, { allowedRoles: ROLES });
  if ("response" in guard) return guard.response;
  const { ctx } = guard;

  try {
    const body = bodySchema.parse(await request.json());
    const [user] = await db.select().from(users).where(eq(users.id, ctx.userId)).limit(1);
    if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in again." } }, { status: 401 });

    if (body.action === "send") {
      await issueEmailCode({ userId: user.id, email: user.email, purpose: "mfa_enable" });
      return NextResponse.json({ data: { sent: true } });
    }

    if (body.action === "enable") {
      await verifyEmailCode({ userId: user.id, purpose: "mfa_enable", code: body.code });
      await db.update(users).set({ mfaEmailEnabled: true }).where(eq(users.id, user.id));
      await logAuditEvent(ctx, { action: "auth.mfa_enabled", targetType: "user", targetId: user.id });
      return NextResponse.json({ data: { enabled: true } });
    }

    const denied = await requireRecentAuth(request);
    if (denied) return denied;
    await db.update(users).set({ mfaEmailEnabled: false }).where(eq(users.id, user.id));
    await logAuditEvent(ctx, { action: "auth.mfa_disabled", targetType: "user", targetId: user.id });
    return NextResponse.json({ data: { enabled: false } });
  } catch (err) {
    if (err instanceof RateLimitError) return rateLimitResponse(err);
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "BAD_REQUEST", message: err.errors[0]?.message || "Check what you entered." } }, { status: 400 });
    }
    if (err instanceof CodeError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.code === "CODE_INVALID" ? 401 : 502 });
    }
    console.error("Sign-in code setting failed:", err);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } }, { status: 500 });
  }
}
