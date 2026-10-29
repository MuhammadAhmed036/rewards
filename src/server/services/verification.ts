import { db } from "../db";
import { users, verifications } from "../db/schema";
import { eq, and, gt } from "drizzle-orm";
import { checkEmailOtpRateLimit } from "../security/rate-limit";
import { env } from "@/lib/env";
import { sendEmailNow } from "./email";
import crypto from "crypto";

// Only a hash of each link token is stored, so a database leak can't be used to verify or reset accounts.
export function hashLinkToken(token: string) {
  return crypto.createHash("sha256").update(token.trim()).digest("hex");
}

const verifyKey = (email: string) => `verify:${email.toLowerCase().trim()}`;

/** Emails a single-use, 24-hour link that confirms the address belongs to the account holder. */
export async function createEmailVerificationToken(userId: string, email: string, tenantId?: string) {
  const normalizedEmail = email.toLowerCase().trim();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.delete(verifications).where(eq(verifications.identifier, verifyKey(normalizedEmail)));
  await db.insert(verifications).values({
    identifier: verifyKey(normalizedEmail),
    value: hashLinkToken(token),
    expiresAt,
  });

  await sendEmailNow({
    toEmail: normalizedEmail,
    template: "email_verification",
    payload: { userId, url: `${env.APP_URL}/verify-email?token=${token}` },
    kind: "transactional",
    tenantId,
  });

  return { token, expiresAt };
}

export async function verifyEmailToken(token: string) {
  const [record] = await db
    .select()
    .from(verifications)
    .where(and(eq(verifications.value, hashLinkToken(token)), gt(verifications.expiresAt, new Date())))
    .limit(1);

  if (!record || !record.identifier.startsWith("verify:")) {
    throw new Error("This link has expired or was already used. Sign in and ask for a new one.");
  }

  const email = record.identifier.slice("verify:".length);
  const [user] = await db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(users.email, email))
    .returning({ id: users.id, email: users.email });

  await db.delete(verifications).where(eq(verifications.id, record.id));
  if (!user) throw new Error("This link has expired or was already used. Sign in and ask for a new one.");

  return { success: true, userId: user.id, email: user.email };
}

export async function resendEmailVerification(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("User not found");
  if (user.emailVerifiedAt) return { alreadyVerified: true };

  await checkEmailOtpRateLimit(user.email);
  const result = await createEmailVerificationToken(user.id, user.email);
  return { success: true, expiresAt: result.expiresAt };
}
