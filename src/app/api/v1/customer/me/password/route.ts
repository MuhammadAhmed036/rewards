import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { guardApiRequest } from "@/server/auth/route-guard";
import { hashPassword, verifyPassword } from "@/server/auth";
import { logAuditEvent } from "@/server/services/audit";

const bodySchema = z.object({
  password: z.string().min(8, "Use at least 8 characters").max(256, "That password is too long"),
  // Needed only when the account already has a password
  currentPassword: z.string().max(256).optional(),
});

/** A customer who joined with Google (no password yet) can set one, so they can also sign in with their email. */
export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request);
  if ("response" in guard) return guard.response;

  try {
    const input = bodySchema.parse(await request.json().catch(() => ({})));
    const [user] = await db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, guard.ctx.userId))
      .limit(1);
    if (!user) throw new Error("Account not found");

    if (user.passwordHash) {
      const ok = input.currentPassword ? await verifyPassword(input.currentPassword, user.passwordHash) : false;
      if (!ok) {
        return NextResponse.json(
          { error: { code: "WRONG_PASSWORD", message: "Your current password isn't right." } },
          { status: 400 }
        );
      }
    }

    await db.update(users).set({ passwordHash: await hashPassword(input.password) }).where(eq(users.id, user.id));
    await logAuditEvent(guard.ctx, {
      action: user.passwordHash ? "customer.password_changed" : "customer.password_set",
      targetType: "user",
      targetId: user.id,
    });
    return NextResponse.json({ data: { saved: true } });
  } catch (err) {
    const message = err instanceof z.ZodError ? err.errors[0]?.message || "Check your password" : "Couldn't save your password";
    return NextResponse.json({ error: { code: "PASSWORD_FAILED", message } }, { status: 400 });
  }
}
