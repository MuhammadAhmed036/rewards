import { describe, it, expect } from "vitest";
import { OAUTH_NONCE_COOKIE, createOAuthState, readOAuthState, safeReturnTo } from "./oauth-state";

const BACKSLASH = String.fromCharCode(92);

describe("Where a sign-in may send you afterwards", () => {
  it("allows paths on this site and refuses anything that leaves it", () => {
    expect(safeReturnTo("/b/ahmed-coffee")).toBe("/b/ahmed-coffee");
    expect(safeReturnTo("/dashboard?tab=team")).toBe("/dashboard?tab=team");
    for (const bad of ["https://evil.example", "//evil.example", "/" + BACKSLASH + "evil.example", "javascript:alert(1)", "evil.example", "/ok\nSet-Cookie: x=1", "/a\b", "", null, undefined, "/" + "a".repeat(400)]) {
      expect(safeReturnTo(bad as string | null | undefined), String(bad)).toBe("/dashboard");
    }
    expect(safeReturnTo("//evil.example", "/me")).toBe("/me");
  });
});

describe("Google sign-in state", () => {
  it("is accepted once, in the browser that started it, and returns what was asked for", () => {
    const { state, nonce } = createOAuthState({ returnTo: "/b/shop", role: "customer" });
    expect(readOAuthState(state, nonce)).toMatchObject({ returnTo: "/b/shop", role: "customer" });
  });

  it("is refused if edited, forged, from another browser, expired, or missing", () => {
    const { state, nonce } = createOAuthState({ returnTo: "/b/shop", role: "customer" });
    const [body, sig] = state.split(".");
    const edited = Buffer.from(JSON.stringify({ r: "https://evil.example", role: "owner", n: nonce, t: Date.now() })).toString("base64url");
    expect(readOAuthState(`${edited}.${sig}`, nonce)).toBeNull(); // edited contents, old signature
    expect(readOAuthState(`${body}.${"A".repeat(sig.length)}`, nonce)).toBeNull(); // forged signature
    expect(readOAuthState(state, "someone-elses-nonce")).toBeNull(); // login started in a different browser
    expect(readOAuthState(state, undefined)).toBeNull(); // no cookie at all
    expect(readOAuthState(null, nonce)).toBeNull();
    expect(readOAuthState("nonsense", nonce)).toBeNull();
    expect(readOAuthState(state, nonce, Date.now() + 11 * 60 * 1000)).toBeNull(); // older than 10 minutes
    expect(OAUTH_NONCE_COOKIE).toBeTruthy();
  });

  it("never lets a hostile returnTo or role through, even if asked for at the start", () => {
    const { state, nonce } = createOAuthState({ returnTo: "//evil.example", role: "platform_admin" });
    expect(readOAuthState(state, nonce)).toMatchObject({ returnTo: "/dashboard", role: "owner" });
  });
});
