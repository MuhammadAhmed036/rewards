import { db } from "../db";
import { users, verifications, memberships, staffMembers } from "../db/schema";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import crypto from "crypto";
import { env } from "@/lib/env";
import { getBaseUrl } from "@/lib/url";
import { hashPassword, invalidateUserSessions } from "../auth";
import { sendEmailNow } from "./email";
import { hashLinkToken } from "./verification";
import { logger } from "@/lib/logger";

export const RESET_TTL_MINUTES = 10;
const RESET_TTL_MS = RESET_TTL_MINUTES * 60 * 1000;
const resetKey = (email: string) => `reset:${email.toLowerCase().trim()}`;
const waitKey = (email: string) => `resetwait:${email.toLowerCase().trim()}`;

/**
 * Wait before the same address can be sent another link: 10 min after the 1st, 30 after the 2nd, 60 after
 * the 3rd, 90 after the 4th and every one after that. The count is forgotten after a day without requests.
 * This protects the shared mailbox's hourly sending limit from someone pressing the button repeatedly.
 */
export const RESET_COOLDOWN_MINUTES = [10, 30, 60, 90];
const RESET_STREAK_MEMORY_MS = 24 * 60 * 60 * 1000;

export const MIN_PASSWORD_LENGTH = 8;

/** "10 minutes", "1 hour", "1 hour 30 minutes" */
export function describeWait(ms: number) {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const parts = [];
  if (h) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  if (m) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  return parts.join(" ");
}

/**
 * Takes the next send slot for this address, or says how long to wait. Returns a function that gives the slot
 * back if the email then fails to send, so a mail-server hiccup doesn't cost the person a wait.
 */
async function reserveResetSlot(email: string): Promise<() => Promise<void>> {
  const key = waitKey(email);
  return db.transaction(async (tx) => {
    // One request at a time per address, so two quick clicks can't both get through
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
    const [row] = await tx
      .select()
      .from(verifications)
      .where(and(eq(verifications.identifier, key), gt(verifications.expiresAt, new Date())))
      .limit(1);
    const count = row ? Number(row.value) || 0 : 0;
    if (row) {
      const waitMs = RESET_COOLDOWN_MINUTES[Math.min(count, RESET_COOLDOWN_MINUTES.length) - 1] * 60 * 1000;
      const remaining = row.createdAt.getTime() + waitMs - Date.now();
      if (remaining > 0) {
        throw new PasswordResetError(
          "TOO_SOON",
          `A reset link was already sent to this email. Check your inbox and spam folder, or ask for another in ${describeWait(remaining)}.`,
          Math.ceil(remaining / 1000)
        );
      }
    }
    await tx.delete(verifications).where(eq(verifications.identifier, key));
    await tx.insert(verifications).values({
      identifier: key,
      value: String(count + 1),
      expiresAt: new Date(Date.now() + RESET_STREAK_MEMORY_MS),
    });
    return async () => {
      await db.transaction(async (undo) => {
        await undo.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
        await undo.delete(verifications).where(eq(verifications.identifier, key));
        if (row) {
          await undo
            .insert(verifications)
            .values({ identifier: key, value: row.value, expiresAt: row.expiresAt, createdAt: row.createdAt });
        }
      });
    };
  });
}

/** Thrown so the forgot-password form can tell the person exactly what to do next. */
export class PasswordResetError extends Error {
  constructor(
    readonly code: "NO_ACCOUNT" | "WRONG_ACCOUNT_TYPE" | "EMAIL_FAILED" | "TOO_SOON",
    message: string,
    readonly retryAfterSeconds?: number
  ) {
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
 * Emails a 10-minute, single-use reset link (asking again is spaced out: see RESET_COOLDOWN_MINUTES), but only when the email belongs to the kind of
 * account the person is signing in to:
 * - owner: must own a business, otherwise "no shop owner has registered with this email"
 * - customer: must have a loyalty card (a shop-team login isn't reset from the customer form)
 * - staff: never emailed; their shop owner sets a new password from the Staff tab
 * An unregistered email is told so. If the email can't be sent the person is told, not left waiting.
 */
export async function requestPasswordReset(email: string, role: ResetRole = "customer") {
  const normalizedEmail = email.toLowerCase().trim();

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

  // Refuses here (before anything is replaced) when this address asked too recently, so the earlier link keeps working
  const giveBackSlot = await reserveResetSlot(normalizedEmail);

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
    await giveBackSlot();
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
  // They proved they own the mailbox, so the "wait before asking again" count starts over
  await db.delete(verifications).where(eq(verifications.identifier, waitKey(email)));
  if (!user) throw new Error("This reset link has expired or was already used. Ask for a new one.");

  await invalidateUserSessions(user.id);
  return { userId: user.id };
}
