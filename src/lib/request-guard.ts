/**
 * Cheap checks every API request passes before any route code runs. Pure functions, so the middleware and the
 * tests use the same rules.
 */

/** Largest request body any API accepts. The biggest legitimate one is a 1 MB customer CSV inside JSON. */
export const MAX_API_BODY_BYTES = 1_600_000;

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Routes that authenticate with their own secret or key (never a browser cookie), so cross-site checks don't apply. */
const KEY_AUTHENTICATED = [/^\/api\/cron\//, /^\/api\/v1\/integrations\//, /^\/api\/v1\/webhooks\//];

export type GuardDecision = { ok: true } | { ok: false; status: number; code: string; message: string };

interface Input {
  method: string;
  pathname: string;
  contentLength: string | null;
  origin: string | null;
  secFetchSite: string | null;
  host: string;
  hasCookie: boolean;
  hasAuthorization: boolean;
}

/**
 * 1. Refuses an oversized body outright (a cheap defence against memory-exhaustion requests).
 * 2. Refuses a browser request that carries our session cookie but was started by another website
 *    (cross-site request forgery). Requests with their own Authorization header or key are not affected,
 *    since a malicious page can't add those.
 */
export function checkRequest(i: Input): GuardDecision {
  if (!i.pathname.startsWith("/api/") || !WRITE_METHODS.has(i.method)) return { ok: true };

  const length = i.contentLength ? Number(i.contentLength) : 0;
  if (Number.isFinite(length) && length > MAX_API_BODY_BYTES) {
    return { ok: false, status: 413, code: "PAYLOAD_TOO_LARGE", message: "That request is too large." };
  }

  if (KEY_AUTHENTICATED.some((re) => re.test(i.pathname)) || i.hasAuthorization || !i.hasCookie) return { ok: true };

  // Modern browsers say where a request came from; "cross-site" is never something our own pages do
  if (i.secFetchSite === "cross-site") {
    return { ok: false, status: 403, code: "CROSS_SITE_BLOCKED", message: "This request was blocked for your security." };
  }
  if (i.origin) {
    let originHost = "";
    try {
      originHost = new URL(i.origin).host.toLowerCase();
    } catch {
      originHost = "";
    }
    if (originHost !== i.host.toLowerCase()) {
      return { ok: false, status: 403, code: "CROSS_SITE_BLOCKED", message: "This request was blocked for your security." };
    }
  }
  return { ok: true };
}
