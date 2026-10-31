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
  constructor(readonly code: "NO_ACCOUNT" | "WRONG_ACCOUNT_TYPE" | "EMAIL_FAILED", message: string) {
    super(message);
    this.name = "PasswordResetError";
  }
}

export type ResetRole = "customer" | "staff" | "owner";

async function hasStaffRole(userId: string, owner: boolean) {
  const [row] = await db
    .select({ id: staffMembers.id })
    .from(staffMembers)
    .where(
      and(
        eq(staffMembers.userId, userId),
        owner
          ? and(eq(staffMembers.role, "owner"), eq(staffMembers.status, "active"))
          : inArray(staffMembers.status, ["active", "invited"])
      )
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Emails a 30-minute, single-use reset link, but only when the email belongs to the kind of
 * account the person is signing in to:
 * - owner: must own a business, otherwise "no shop owner has registered with this email"
 * - customer: must have a loyalty card (a shop-team login isn't reset from the customer form)
 * - staff: never emailed; their shop owner sets a new password from the Staff tab
 * An unregistered email is told so. If the email can't be sent the person is told, not left waiting.
 */
export async function requestPasswordReset(email: string, role: ResetRole = "customer") {
  const normalizedEmail = email.toLowerCase().trim();
  await checkEmailOtpRateLimit(normalizedEmail);

  const [found] = await db
    .select({ id: users.id, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);
  const user = found && !found.deletedAt ? found : null;

  if (role === "owner") {
    if (!user || !(await hasStaffRole(user.id, true))) {
      logger.warn({ email: normalizedEmail }, "Owner password reset requested for an email with no shop");
      throw new PasswordResetError("NO_ACCOUNT", "No shop owner has registered with this email yet.");
    }
  } else {
    if (!user) {
      logger.warn({ email: normalizedEmail }, "Password reset requested for an unregistered email");
      throw new PasswordResetError("NO_ACCOUNT", "No account found with this email. Please register first.");
    }
    if (role === "staff") {
      if (!(await hasStaffRole(user.id, false))) {
        throw new PasswordResetError("NO_ACCOUNT", "No staff account found with this email. Ask your shop owner to add you.");
      }
      throw new PasswordResetError(
        "WRONG_ACCOUNT_TYPE",
        "Staff passwords are reset by your shop owner. Ask them to set a new password for you from the Staff tab."
      );
    }
    const [card] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.status, "active")))
      .limit(1);
    if (!card && (await hasStaffRole(user.id, false))) {
      throw new PasswordResetError(
        "WRONG_ACCOUNT_TYPE",
        "This email belongs to a shop team account, not a customer. Use the staff or shop owner sign-in instead."
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
