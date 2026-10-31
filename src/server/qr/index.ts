import crypto from "crypto";
import QRCode from "qrcode";
import { env } from "@/lib/env";

const CROCKFORD_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Generates an 8-character Crockford Base32 string (excluding 0, 1, I, L, O)
 */
export function generateCrockfordCode(length: number = 8): string {
  const bytes = crypto.randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CROCKFORD_ALPHABET[bytes[i] % CROCKFORD_ALPHABET.length];
  }
  return code;
}

/**
 * Member QR Token format: LP1.{membershipPublicId}.{qrVersion}.{hmac}
 * HMAC-SHA256(QR_SIGNING_SECRET, "${membershipPublicId}.${qrVersion}")
 */
export function generateMemberQrToken(
  membershipPublicId: string,
  qrVersion: number,
  secret: string = env.QR_SIGNING_SECRET
): string {
  const payload = `${membershipPublicId}.${qrVersion}`;
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url")
    .slice(0, 24); // Truncated to 24 chars for compact scanning

  return `LP1.${membershipPublicId}.${qrVersion}.${hmac}`;
}

/** A live QR code is only good for this long, so a photo of it is useless a moment later (FR-039). */
export const LIVE_QR_WINDOW_SECONDS = 30;
// One window either side is accepted, so a slow scan or a slightly wrong phone clock still works
const LIVE_QR_GRACE_WINDOWS = 1;

const liveSlot = (nowMs: number) => Math.floor(nowMs / 1000 / LIVE_QR_WINDOW_SECONDS);

function liveSignature(publicId: string, qrVersion: number, slot: number, secret: string) {
  return crypto.createHmac("sha256", secret).update(`LP2.${publicId}.${qrVersion}.${slot}`).digest("base64url").slice(0, 24);
}

/** Member QR that changes every 30 seconds: LP2.{membershipPublicId}.{qrVersion}.{slot}.{hmac} */
export function generateLiveQrToken(membershipPublicId: string, qrVersion: number, nowMs: number = Date.now(), secret: string = env.QR_SIGNING_SECRET): string {
  const slot = liveSlot(nowMs);
  return `LP2.${membershipPublicId}.${qrVersion}.${slot}.${liveSignature(membershipPublicId, qrVersion, slot, secret)}`;
}

export interface VerifyAnyQrResult extends VerifyMemberQrResult {
  live?: boolean;
  slot?: number;
}

/** Checks either kind of member QR: the printed one (LP1) or the live one (LP2, which also has to be recent). */
export function verifyAnyMemberQrToken(token: string, nowMs: number = Date.now(), secret: string = env.QR_SIGNING_SECRET): VerifyAnyQrResult {
  if (typeof token === "string" && token.startsWith("LP2.")) {
    const parts = token.split(".");
    if (parts.length !== 5) return { valid: false, error: "Unsupported QR protocol or malformed token" };
    const [, publicId, versionStr, slotStr, signature] = parts;
    const qrVersion = parseInt(versionStr, 10);
    const slot = parseInt(slotStr, 10);
    if (isNaN(qrVersion) || qrVersion < 1 || isNaN(slot)) return { valid: false, error: "Invalid QR code" };
    const expected = Buffer.from(liveSignature(publicId, qrVersion, slot, secret));
    const given = Buffer.from(signature);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return { valid: false, error: "Invalid or tampered QR signature" };
    if (Math.abs(liveSlot(nowMs) - slot) > LIVE_QR_GRACE_WINDOWS) {
      return { valid: false, error: "This QR code has expired. Ask the customer to hold up their card again so it refreshes." };
    }
    return { valid: true, membershipPublicId: publicId, qrVersion, live: true, slot };
  }
  return { ...verifyMemberQrToken(token, secret), live: false };
}

export interface VerifyMemberQrResult {
  valid: boolean;
  membershipPublicId?: string;
  qrVersion?: number;
  error?: string;
}

export function verifyMemberQrToken(
  token: string,
  secret: string = env.QR_SIGNING_SECRET
): VerifyMemberQrResult {
  if (!token || typeof token !== "string") {
    return { valid: false, error: "Invalid token format" };
  }

  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "LP1") {
    return { valid: false, error: "Unsupported QR protocol or malformed token" };
  }

  const [, publicId, versionStr, signature] = parts;
  const qrVersion = parseInt(versionStr, 10);
  if (isNaN(qrVersion) || qrVersion < 1) {
    return { valid: false, error: "Invalid QR version" };
  }

  const expectedPayload = `${publicId}.${qrVersion}`;
  const expectedHmac = crypto
    .createHmac("sha256", secret)
    .update(expectedPayload)
    .digest("base64url")
    .slice(0, 24);

  // Timing-safe comparison to prevent timing attacks
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedHmac);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return { valid: false, error: "Invalid or tampered QR signature" };
  }

  return {
    valid: true,
    membershipPublicId: publicId,
    qrVersion,
  };
}

/**
 * Redemption Code: 8-char random string (Crockford base32)
 * Hash stored in database is SHA-256
 */
export function generateRedemptionCode(): {
  code: string;
  codeHash: string;
  codeLast4: string;
} {
  const code = generateCrockfordCode(8);
  const codeHash = hashRedemptionCode(code);
  const codeLast4 = code.slice(-4);
  return { code, codeHash, codeLast4 };
}

export function hashRedemptionCode(code: string): string {
  const normalized = code.toUpperCase().trim();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Generates Join QR Data URL (PNG or SVG)
 */
export async function generateQrDataUrl(
  content: string,
  type: "png" | "svg" = "png"
): Promise<string> {
  if (type === "svg") {
    return await QRCode.toString(content, {
      type: "svg",
      margin: 2,
      errorCorrectionLevel: "M",
    });
  }
  return await QRCode.toDataURL(content, {
    margin: 2,
    errorCorrectionLevel: "M",
    width: 320,
  });
}

