import { describe, it, expect } from "vitest";
import { checkRequest, MAX_API_BODY_BYTES } from "./request-guard";

const base = { method: "POST", pathname: "/api/v1/owner/team", contentLength: "100", origin: null, secFetchSite: null, host: "shop.example.com", hasCookie: true, hasAuthorization: false };

describe("Request guard", () => {
  it("lets normal same-site requests through, and ignores pages and reads", () => {
    expect(checkRequest({ ...base, origin: "https://shop.example.com", secFetchSite: "same-origin" }).ok).toBe(true);
    expect(checkRequest({ ...base }).ok).toBe(true); // no Origin header: scripts and older clients
    expect(checkRequest({ ...base, method: "GET", origin: "https://evil.com" }).ok).toBe(true);
    expect(checkRequest({ ...base, pathname: "/dashboard", origin: "https://evil.com" }).ok).toBe(true);
  });

  it("blocks a request another website started while carrying the session cookie", () => {
    expect(checkRequest({ ...base, origin: "https://evil.com" })).toMatchObject({ ok: false, status: 403, code: "CROSS_SITE_BLOCKED" });
    expect(checkRequest({ ...base, secFetchSite: "cross-site" })).toMatchObject({ ok: false, status: 403 });
    expect(checkRequest({ ...base, origin: "not a url" })).toMatchObject({ ok: false, status: 403 });
    // A look-alike host is not the same host
    expect(checkRequest({ ...base, origin: "https://shop.example.com.evil.com" }).ok).toBe(false);
    for (const method of ["PUT", "PATCH", "DELETE"]) expect(checkRequest({ ...base, method, origin: "https://evil.com" }).ok).toBe(false);
  });

  it("does not stop requests that carry their own key, or have no cookie to abuse", () => {
    expect(checkRequest({ ...base, origin: "https://evil.com", hasAuthorization: true }).ok).toBe(true);
    expect(checkRequest({ ...base, origin: "https://evil.com", hasCookie: false }).ok).toBe(true);
    for (const pathname of ["/api/cron/send-outbox", "/api/v1/integrations/earn", "/api/v1/webhooks/email-bounce"]) {
      expect(checkRequest({ ...base, pathname, origin: "https://evil.com" }).ok).toBe(true);
    }
  });

  it("refuses an oversized body", () => {
    expect(checkRequest({ ...base, contentLength: String(MAX_API_BODY_BYTES) }).ok).toBe(true);
    expect(checkRequest({ ...base, contentLength: String(MAX_API_BODY_BYTES + 1) })).toMatchObject({ ok: false, status: 413, code: "PAYLOAD_TOO_LARGE" });
    expect(checkRequest({ ...base, contentLength: "99999999999", hasCookie: false }).ok).toBe(false); // size is checked even without a cookie
  });
});
