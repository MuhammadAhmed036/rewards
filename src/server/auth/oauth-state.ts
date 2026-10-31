import crypto from "crypto";
import { env } from "@/lib/env";

/** Where a sign-in may send the person afterwards: a path on this site, never another website. */
export function safeReturnTo(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw || typeof raw !== "string" || raw.length > 300) return fallback;
  // "//evil.com", "/\evil.com" and "https://evil.com" all leave the site; so do control characters
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || /[\u0000-\u001f\\]/.test(raw)) return fallback;
  return raw;
}

export const OAUTH_NONCE_COOKIE = "lp_oauth_nonce";
const MAX_AGE_MS = 10 * 60 * 1000;

const sign = (payload: string) => crypto.createHmac("sha256", env.AUTH_SECRET).update(`oauth-state:${payload}`).digest("base64url");

export interface OAuthState {
  returnTo: string;
  role: "owner" | "customer" | "staff";
  nonce: string;
}

/**
 * The `state` sent to Google is signed, and tied to a cookie set in the same browser, so a sign-in can't be
 * started by one person and finished in another person's browser (login forgery), and its contents can't be edited.
 */
export function createOAuthState(input: { returnTo: string; role: string }): { state: string; nonce: string } {
  const nonce = crypto.randomBytes(16).toString("hex");
  const role = input.role === "customer" || input.role === "staff" ? input.role : "owner";
  const body = Buffer.from(JSON.stringify({ r: safeReturnTo(input.returnTo), role, n: nonce, t: Date.now() })).toString("base64url");
  return { state: `${body}.${sign(body)}`, nonce };
}

export function readOAuthState(state: string | null, cookieNonce: string | null | undefined, now = Date.now()): OAuthState | null {
  if (!state || !cookieNonce) return null;
  const [body, signature] = state.split(".");
  if (!body || !signature) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { r: string; role: string; n: string; t: number };
    if (typeof parsed.t !== "number" || now - parsed.t > MAX_AGE_MS || parsed.t > now + 60_000) return null;
    const a = Buffer.from(parsed.n || "");
    const b = Buffer.from(cookieNonce);
    if (a.length === 0 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const role = parsed.role === "customer" || parsed.role === "staff" ? parsed.role : "owner";
    return { returnTo: safeReturnTo(parsed.r), role, nonce: parsed.n };
  } catch {
    return null;
  }
}
