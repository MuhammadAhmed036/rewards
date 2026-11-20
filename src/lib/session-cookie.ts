/**
 * The session cookie is a real, standards-compliant JWT — specifically an encrypted one (JWE,
 * RFC 7516), not just a signed one: nobody who intercepts it can read its contents, only verify
 * and decrypt it with the server's key. Shared by the Node server and the Edge middleware, so it
 * only uses Web Crypto (via `jose`, which runs on both) — no Node-specific APIs.
 *
 * Claims: { t: random session token, k: session kind, iat, exp } encrypted with AES-256-GCM
 * using a key derived from AUTH_SECRET (HKDF, so cookie encryption never reuses the raw secret).
 *
 * The database stores only SHA-256(t), never the token itself, so a leaked sessions table can't
 * be replayed. More importantly for logout: the JWT's own `exp` is a ceiling, not the real
 * authority — every request also looks up the session row by its hash (see `getSessionContext`
 * in `server/auth/index.ts`). Signing out deletes that row, so the token stops working
 * immediately, for every role (customer, staff, owner, platform admin), even though the JWT
 * itself would otherwise still look "valid" until its `exp`. A plain stateless JWT can't do that
 * on its own — this is why the token is tied to a server-side session, not trusted by itself.
 */

import { EncryptJWT, jwtDecrypt } from "jose";

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

const textEncoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- key ----------

// A private header claim that must match on decrypt, the JWE equivalent of the AAD this used
// before `jose` — it's part of the protected header, which JWE always authenticates, so a token
// encrypted for something else (or with a future, incompatible claim layout) is rejected outright.
const COOKIE_VERSION = "v1";
const JWE_ALG = "dir"; // direct encryption: the derived key below *is* the content-encryption key
const JWE_ENC = "A256GCM";

let keyPromise: Promise<CryptoKey> | null = null;

function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    const secret = process.env.AUTH_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error("AUTH_SECRET must be set (32+ characters) to encrypt session cookies");
    }
    keyPromise = (async () => {
      const base = await crypto.subtle.importKey("raw", textEncoder.encode(secret), "HKDF", false, ["deriveKey"]);
      // A dedicated key derived from AUTH_SECRET, so cookie encryption never reuses the raw secret.
      return crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: textEncoder.encode("loyalty-session-cookie"), info: textEncoder.encode(COOKIE_VERSION) },
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
  return toHex(await crypto.subtle.digest("SHA-256", textEncoder.encode(token)));
}

/** Issues the encrypted JWT handed to the browser as the session cookie (or returned as a Bearer
 * token for API clients — see `guardApiRequest`). Same shape and same guarantees for every role. */
export async function encryptSessionCookie(payload: SessionPayload): Promise<string> {
  return await new EncryptJWT({ t: payload.t, k: payload.k })
    .setProtectedHeader({ alg: JWE_ALG, enc: JWE_ENC, loy: COOKIE_VERSION })
    .setIssuedAt(Math.floor(payload.iat / 1000))
    .setExpirationTime(Math.floor(payload.exp / 1000))
    .encrypt(await getKey());
}

/** Returns the payload, or null for a missing, tampered, foreign, legacy or expired token. */
export async function decryptSessionCookie(value: string | null | undefined): Promise<SessionPayload | null> {
  if (!value) return null;
  try {
    const { payload, protectedHeader } = await jwtDecrypt(value, await getKey(), {
      keyManagementAlgorithms: [JWE_ALG],
      contentEncryptionAlgorithms: [JWE_ENC],
    });
    if (protectedHeader.loy !== COOKIE_VERSION) return null;
    if (
      typeof payload.t !== "string" ||
      typeof payload.k !== "string" ||
      !(payload.k in SESSION_POLICY) ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    // jose already rejects an expired token before returning (JWTExpired), this is defence in depth
    if (payload.exp * 1000 <= Date.now()) return null;
    return { t: payload.t, k: payload.k as SessionKind, iat: payload.iat * 1000, exp: payload.exp * 1000 };
  } catch {
    // JWTExpired, JWEDecryptionFailed (tampered/foreign/wrong-key), JWEInvalid (malformed) all land here
    return null;
  }
}

/** Cookie expiry for a new session: customers get the browser maximum, others their absolute limit. */
export function initialCookieExpiry(kind: SessionKind, now = Date.now()): number {
  const policy = SESSION_POLICY[kind];
  return now + (policy.absoluteMs ?? MAX_COOKIE_AGE_MS);
}
