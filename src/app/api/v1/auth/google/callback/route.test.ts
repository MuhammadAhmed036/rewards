import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { users, memberships } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { createOAuthState, OAUTH_NONCE_COOKIE } from "@/server/auth/oauth-state";
import { registerOwnerAndTenant } from "@/server/services/tenant";
import { GET } from "./route";

function googleAs(email: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).includes("oauth2.googleapis.com")
        ? new Response(JSON.stringify({ access_token: "t" }), { status: 200 })
        : new Response(JSON.stringify({ email, verified_email: true, name: "Gina Google" }), { status: 200 })
    )
  );
}

async function callback(returnTo: string, intent: "signin" | "signup") {
  const { state, nonce } = createOAuthState({ returnTo, role: "customer", intent });
  const req = new NextRequest(`http://localhost:3000/api/v1/auth/google/callback?code=abc&state=${encodeURIComponent(state)}`, {
    headers: { cookie: `${OAUTH_NONCE_COOKIE}=${nonce}` },
  });
  return GET(req);
}

describe("Google sign-in for customers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("a new Google user lands on their own dashboard with a card, and signing in without a card is refused", async () => {
    const tag = Date.now();
    const { tenant } = await registerOwnerAndTenant({
      email: `owner-${tag}@example.com`,
      password: "Password123!",
      name: "Owner",
      businessName: `Gshop ${tag}`,
      slug: `gshop-${tag}`,
      programmeType: "points",
    });
    const email = `gina-${tag}@example.com`;
    googleAs(email);

    // Signing in with no card here: nothing is created, they are told to sign up first
    const refused = await callback(`/b/${tenant.slug}`, "signin");
    expect(refused.headers.get("location")).toContain(`/b/${tenant.slug}?auth=signup_first`);
    expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(0);

    // Signing up: account and card are made, and they land on /me
    const res = await callback(`/b/${tenant.slug}`, "signup");
    expect(res.headers.get("location")).toContain(`/me?joined=${tenant.slug}`);
    expect(res.headers.get("set-cookie")).toBeTruthy();
    const [u] = await db.select().from(users).where(eq(users.email, email));
    expect(u).toBeTruthy();
    expect(await db.select().from(memberships).where(eq(memberships.userId, u.id))).toHaveLength(1);

    // The shop owner's own Google account can't become a customer card
    googleAs(`owner-${tag}@example.com`);
    const biz = await callback(`/b/${tenant.slug}`, "signup");
    expect(biz.headers.get("location")).toContain("auth=business_account");
    expect(biz.headers.get("set-cookie") || "").not.toContain("loyalty_session=ey");
    googleAs(email);

    // Later, signing in works because the card exists
    const again = await callback(`/b/${tenant.slug}`, "signin");
    expect(again.headers.get("location")).toContain("/me");
  });
});
