/**
 * Encrypted session cookie, shared by the Node server and the Edge middleware
 * (Web Crypto only — no Node-specific APIs).
 *
 * The cookie carries an AES-256-GCM encrypted, authenticated payload:
 *   { t: random session token, k: session kind, iat: issued at, exp: cookie expiry }
 * The database stores only SHA-256(t), so a leaked sessions table can't be replayed,
 * and a tampered or forged cookie fails decryption.
 */

export type SessionKind = "customer" | "staff" | "admin";

export interface SessionPayload {
  t: string;
  k: SessionKind;
  iat: number;
  exp: number;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Browsers cap cookie lifetime at 400 days, so that is the longest "stay signed in". */
export const MAX_COOKIE_AGE_MS = 400 * DAY;

/**
 * How long each kind of session lasts.
 * idleMs     — signed out after this long without activity (refreshed while in use)
 * absoluteMs — signed out this long after signing in, however active (null = never)
 * refreshMs  — how often activity is written back, to avoid a DB write on every request
 */
export const SESSION_POLICY: Record<SessionKind, { idleMs: number; absoluteMs: number | null; refreshMs: number }> = {
  // Customers stay signed in for good while they keep using their card.
  customer: { idleMs: MAX_COOKIE_AGE_MS, absoluteMs: null, refreshMs: DAY },
  // Staff, managers and owners: one shift, and signed out after 4 quiet hours.
  staff: { idleMs: 4 * HOUR, absoluteMs: 12 * HOUR, refreshMs: 5 * 60 * 1000 },
  // Platform admins hold the most power, so they get the shortest session.
  admin: { idleMs: 30 * 60 * 1000, absoluteMs: 8 * HOUR, refreshMs: 2 * 60 * 1000 },
};

const isProduction = process.env.NODE_ENV === "production";

/**
 * `__Host-` cookies must be Secure, host-only and path=/ — browsers refuse them otherwise,
 * which blocks subdomain and path-scoped cookie injection. Local http dev can't use Secure
 * cookies on LAN addresses, so it keeps the plain name.
 */
export const SESSION_COOKIE_NAME = isProduction ? "__Host-loyalty_session" : "loyalty_session";
export const LEGACY_SESSION_COOKIE_NAMES = ["loyalty_session"].filter((n) => n !== SESSION_COOKIE_NAME);

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true, // never readable from page JavaScript
    secure: isProduction, // https only in production
    sameSite: "lax" as const, // sent on normal links (QR scans) but not cross-site form posts
    path: "/",
    expires,
    priority: "high" as const,
  };
}

// ---------- encoding helpers ----------

const enc = new TextEncoder();
const dec = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- key ----------

const COOKIE_VERSION = "v1";
const AAD = enc.encode(`loyalty-session:${COOKIE_VERSION}`);
let keyPromise: Promise<CryptoKey> | null = null;

function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    const secret = process.env.AUTH_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error("AUTH_SECRET must be set (32+ characters) to encrypt session cookies");
    }
    keyPromise = (async () => {
      const base = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, ["deriveKey"]);
      // A dedicated key derived from AUTH_SECRET, so cookie encryption never reuses the raw secret.
      return crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: enc.encode("loyalty-session-cookie"), info: enc.encode(COOKIE_VERSION) },
        base,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
    })();
  }
  return keyPromise;
}

// ---------- public API ----------

export function generateSessionToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** The value stored in sessions.token: SHA-256 of the raw token, never the token itself. */
export async function hashSessionToken(token: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(token)));
}

export async function encryptSessionCookie(payload: SessionPayload): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: AAD },
    await getKey(),
    enc.encode(JSON.stringify(payload))
  );
  return `${COOKIE_VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

/** Returns the payload, or null for a missing, tampered, foreign, legacy or expired cookie. */
export async function decryptSessionCookie(value: string | null | undefined): Promise<SessionPayload | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== COOKIE_VERSION) return null;
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(parts[1]), additionalData: AAD },
      await getKey(),
      fromBase64Url(parts[2])
    );
    const payload = JSON.parse(dec.decode(plaintext)) as SessionPayload;
    if (
      typeof payload.t !== "string" ||
      !(payload.k in SESSION_POLICY) ||
      typeof payload.exp !== "number" ||
      payload.exp <= Date.now()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/** Cookie expiry for a new session: customers get the browser maximum, others their absolute limit. */
export function initialCookieExpiry(kind: SessionKind, now = Date.now()): number {
  const policy = SESSION_POLICY[kind];
  return now + (policy.absoluteMs ?? MAX_COOKIE_AGE_MS);
}
