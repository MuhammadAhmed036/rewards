import { db } from "../db";
import { users, verifications } from "../db/schema";
import { and, eq, gt } from "drizzle-orm";
import crypto from "crypto";
import { env } from "@/lib/env";
import { hashPassword, invalidateUserSessions } from "../auth";
import { checkEmailOtpRateLimit } from "../security/rate-limit";
import { sendEmailNow } from "./email";
import { hashLinkToken } from "./verification";
import { logger } from "@/lib/logger";

const RESET_TTL_MS = 30 * 60 * 1000;
const resetKey = (email: string) => `reset:${email.toLowerCase().trim()}`;

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Emails a 30-minute, single-use reset link. The caller always gets the same answer whether or
 * not the email has an account, so the form can't be used to find out who is registered.
 */
export async function requestPasswordReset(email: string) {
  const normalizedEmail = email.toLowerCase().trim();
  await checkEmailOtpRateLimit(normalizedEmail);

  const [user] = await db
    .select({ id: users.id, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);
  if (!user || user.deletedAt) {
    logger.info({ email: normalizedEmail }, "Password reset asked for an unknown email");
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  await db.delete(verifications).where(eq(verifications.identifier, resetKey(normalizedEmail)));
  await db.insert(verifications).values({
    identifier: resetKey(normalizedEmail),
    value: hashLinkToken(token),
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });

  await sendEmailNow({
    toEmail: normalizedEmail,
    template: "password_reset",
    payload: { url: `${env.APP_URL}/reset-password?token=${token}` },
    kind: "transactional",
  });
}

/** Sets the new password, uses up the link, and signs the account out everywhere. */
export async function resetPassword(token: string, newPassword: string) {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters for your new password.`);
  }

  const [record] = await db
    .select()
    .from(verifications)
    .where(and(eq(verifications.value, hashLinkToken(token)), gt(verifications.expiresAt, new Date())))
    .limit(1);
  if (!record || !record.identifier.startsWith("reset:")) {
    throw new Error("This reset link has expired or was already used. Ask for a new one.");
  }

  const email = record.identifier.slice("reset:".length);
  const passwordHash = await hashPassword(newPassword);
  const [user] = await db
    .update(users)
    // Opening the emailed link also proves they own the address
    .set({ passwordHash, emailVerifiedAt: new Date() })
    .where(eq(users.email, email))
    .returning({ id: users.id });

  await db.delete(verifications).where(eq(verifications.id, record.id));
  if (!user) throw new Error("This reset link has expired or was already used. Ask for a new one.");

  await invalidateUserSessions(user.id);
  return { userId: user.id };
}
