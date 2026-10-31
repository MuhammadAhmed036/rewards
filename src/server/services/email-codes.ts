import crypto from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../db";
import { verifications } from "../db/schema";
import { assertRateLimit } from "../security/rate-limit";
import { sendEmailNow } from "./email";

export type CodePurpose = "login" | "reauth" | "mfa_enable";

const CODE_TTL_MS = 10 * 60 * 1000;

export class CodeError extends Error {
  constructor(readonly code: "CODE_INVALID" | "CODE_EMAIL_FAILED", message: string) {
    super(message);
    this.name = "CodeError";
  }
}

const keyFor = (userId: string, purpose: CodePurpose, challengeId = "") => `code:${purpose}:${userId}:${challengeId}`;

// Only a salted hash is stored: a six-digit code is guessable, so the hash is tied to who and what it is for
const hashCode = (key: string, code: string) => crypto.createHash("sha256").update(`${key}|${code.trim()}`).digest("hex");

/** Emails a six-digit code that works once, for 10 minutes. Sending is limited to 5 per 10 minutes per person. */
export async function issueEmailCode(params: { userId: string; email: string; purpose: CodePurpose; challengeId?: string }) {
  await assertRateLimit(
    `code-send:${params.userId}`,
    5,
    600,
    "RATE_LIMITED: Too many codes requested. Wait 10 minutes and try again."
  );
  const key = keyFor(params.userId, params.purpose, params.challengeId);
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");

  await db.delete(verifications).where(eq(verifications.identifier, key));
  await db.insert(verifications).values({ identifier: key, value: hashCode(key, code), expiresAt: new Date(Date.now() + CODE_TTL_MS) });

  const { sent } = await sendEmailNow({
    toEmail: params.email,
    template: "security_code",
    payload: { code, purpose: params.purpose },
    kind: "transactional",
  });
  if (!sent) throw new CodeError("CODE_EMAIL_FAILED", "We couldn't send the code right now. Please try again in a minute.");
}

/** Checks a code and uses it up. Five wrong tries in 10 minutes locks that code out. */
export async function verifyEmailCode(params: { userId: string; purpose: CodePurpose; code: string; challengeId?: string }) {
  const key = keyFor(params.userId, params.purpose, params.challengeId);
  await assertRateLimit(`code-try:${key}`, 5, 600, "RATE_LIMITED: Too many wrong codes. Ask for a new code in 10 minutes.");

  const [row] = await db
    .select()
    .from(verifications)
    .where(and(eq(verifications.identifier, key), gt(verifications.expiresAt, new Date())))
    .limit(1);
  const given = Buffer.from(hashCode(key, params.code));
  const wanted = row ? Buffer.from(row.value) : null;
  if (!row || !wanted || given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) {
    throw new CodeError("CODE_INVALID", "That code isn't right, or it has expired.");
  }
  await db.delete(verifications).where(eq(verifications.id, row.id));
}
