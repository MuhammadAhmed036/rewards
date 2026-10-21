import { db } from "../db";
import { users, verifications, emailOutbox } from "../db/schema";
import { eq, and, gt } from "drizzle-orm";
import { checkEmailOtpRateLimit } from "../security/rate-limit";
import crypto from "crypto";

export async function createEmailVerificationToken(
  userId: string,
  email: string,
  tenantId?: string
) {
  const normalizedEmail = email.toLowerCase().trim();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours TTL per FR-015

  // Delete any existing tokens for this identifier
  await db
    .delete(verifications)
    .where(eq(verifications.identifier, normalizedEmail));

  // Insert new single-use token
  await db.insert(verifications).values({
    identifier: normalizedEmail,
    value: token,
    expiresAt,
  });

  // Queue transactional verification email
  await db.insert(emailOutbox).values({
    tenantId: tenantId || null,
    toEmail: normalizedEmail,
    template: "email_verification",
    kind: "transactional",
    status: "queued",
    payload: {
      userId,
      token,
      expiresAt: expiresAt.toISOString(),
    },
  });

  return { token, expiresAt };
}

export async function verifyEmailToken(token: string) {
  const trimmedToken = token.trim();
  const now = new Date();

  // Find valid verification record
  const [record] = await db
    .select()
    .from(verifications)
    .where(and(eq(verifications.value, trimmedToken), gt(verifications.expiresAt, now)))
    .limit(1);

  if (!record) {
    throw new Error("Invalid or expired verification token");
  }

  // Update user
  const [user] = await db
    .update(users)
    .set({ emailVerifiedAt: now })
    .where(eq(users.email, record.identifier))
    .returning();

  if (!user) {
    throw new Error("User associated with verification token not found");
  }

  // Enforce single use: delete token
  await db.delete(verifications).where(eq(verifications.id, record.id));

  return {
    success: true,
    userId: user.id,
    email: user.email,
  };
}

export async function resendEmailVerification(userId: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new Error("User not found");
  }

  if (user.emailVerifiedAt) {
    return { alreadyVerified: true };
  }

  // Rate limit: 3 per 10 minutes per email
  await checkEmailOtpRateLimit(user.email);

  const result = await createEmailVerificationToken(user.id, user.email);
  return {
    success: true,
    ...result,
  };
}

