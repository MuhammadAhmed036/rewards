import { db } from "../db";
import { users, verifications, memberships, staffMembers } from "../db/schema";
import { and, eq, gt, inArray } from "drizzle-orm";
import crypto from "crypto";
import { env } from "@/lib/env";
import { getBaseUrl } from "@/lib/url";
import { hashPassword, invalidateUserSessions } from "../auth";
import { checkEmailOtpRateLimit } from "../security/rate-limit";
import { sendEmailNow } from "./email";
import { hashLinkToken } from "./verification";
import { logger } from "@/lib/logger";

const RESET_TTL_MS = 30 * 60 * 1000;
const resetKey = (email: string) => `reset:${email.toLowerCase().trim()}`;

export const MIN_PASSWORD_LENGTH = 8;

/** Thrown so the forgot-password form can tell the person exactly what to do next. */
export class PasswordResetError extends Error {
  constructor(readonly code: "NO_ACCOUNT" | "STAFF_ACCOUNT" | "EMAIL_FAILED", message: string) {
    super(message);
    this.name = "PasswordResetError";
  }
}

/**
 * Emails a 30-minute, single-use reset link to a registered customer.
 * - No account for the email -> asks them to register first.
 * - Staff-only account (works for a business, no loyalty card) -> not reset here.
 * - The email is sent straight away; if it can't be sent the person is told, not left waiting.
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
    logger.warn({ email: normalizedEmail }, "Password reset requested for an unregistered email");
    throw new PasswordResetError(
      "NO_ACCOUNT",
      "No account found with this email. Please register first."
    );
  }

  const [card] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, user.id), eq(memberships.status, "active")))
    .limit(1);
  if (!card) {
    const [staff] = await db
      .select({ id: staffMembers.id })
      .from(staffMembers)
      .where(and(eq(staffMembers.userId, user.id), inArray(staffMembers.status, ["active", "invited"])))
      .limit(1);
    if (staff) {
      logger.warn({ email: normalizedEmail }, "Password reset requested for a staff account");
      throw new PasswordResetError(
        "STAFF_ACCOUNT",
        "This email belongs to a staff account, not a customer. Ask your business owner to help with your password."
      );
    }
  }

  const token = crypto.randomBytes(32).toString("hex");
  await db.delete(verifications).where(eq(verifications.identifier, resetKey(normalizedEmail)));
  await db.insert(verifications).values({
    identifier: resetKey(normalizedEmail),
    value: hashLinkToken(token),
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });

  const baseUrl = getBaseUrl();
  const { sent } = await sendEmailNow({
    toEmail: normalizedEmail,
    template: "password_reset",
    payload: { url: `${baseUrl}/reset-password?token=${token}` },
    kind: "transactional",
  });
  if (!sent) {
    throw new PasswordResetError("EMAIL_FAILED", "We couldn't send the email right now. Please try again in a minute.");
  }
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
