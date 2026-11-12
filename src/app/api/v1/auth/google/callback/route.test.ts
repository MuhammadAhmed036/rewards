import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { users, memberships, householdMembers } from "@/server/db/schema";
import { joinProgramme } from "@/server/services/member";
import { getCustomerPrivacyData } from "@/server/services/privacy";
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

  it("takes someone who shares a friend's card to that shop, and lists the shared card on their own page", async () => {
    const tag = `${Date.now()}-hh`;
    const mk = async (n: string) =>
      (await registerOwnerAndTenant({ email: `o-${n}-${tag}@example.com`, password: "Password123!", name: "Owner", businessName: `S ${n} ${tag}`, slug: `s-${n}-${tag}`, programmeType: "points" })).tenant;
    const shopA = await mk("a");
    const shopB = await mk("b");

    // The friend has a card at shop B; the guest already has their own card at shop A
    const friend = await joinProgramme({ tenantSlug: shopB.slug, email: `friend-${tag}@example.com`, name: "Fiona Friend" });
    const guestEmail = `guest-${tag}@example.com`;
    const guest = await joinProgramme({ tenantSlug: shopA.slug, email: guestEmail, name: "Gus Guest" });
    await db.insert(householdMembers).values({
      tenantId: shopB.id,
      membershipId: friend.membership.id,
      email: guestEmail,
      userId: guest.membership.userId,
      status: "active",
      acceptedAt: new Date(),
    });

    // Signing in with Google at shop B works (they share a card there) and lands on that shop, not on shop A
    googleAs(guestEmail);
    const res = await callback(`/b/${shopB.slug}`, "signin");
    expect(res.headers.get("location")).toContain(`/b/${shopB.slug}`);
    expect(res.headers.get("location")).not.toContain("signup_first");
    // No second card was made for them at shop B
    expect(await db.select().from(memberships).where(eq(memberships.userId, guest.membership.userId))).toHaveLength(1);

    // Their own page lists their shop A card and the shared shop B card
    const data = await getCustomerPrivacyData(guest.membership.userId);
    expect(data.memberships.map((m) => m.tenantSlug)).toEqual([shopA.slug]);
    expect(data.sharedCards).toHaveLength(1);
    expect(data.sharedCards[0]).toMatchObject({ tenantSlug: shopB.slug, sharedBy: "Fiona Friend" });
  });

  it("signs in someone who has an account at another shop but no card here, and offers to add this shop", async () => {
    const tag = `${Date.now()}-add`;
    const mk = async (n: string) =>
      (await registerOwnerAndTenant({ email: `o-${n}-${tag}@example.com`, password: "Password123!", name: "Owner", businessName: `S ${n} ${tag}`, slug: `s-${n}-${tag}`, programmeType: "points" })).tenant;
    const shopA = await mk("a");
    const shopB = await mk("b");
    const email = `invitee-${tag}@example.com`;
    const card = await joinProgramme({ tenantSlug: shopA.slug, email, name: "Ivy Invitee" });

    googleAs(email);
    const res = await callback(`/b/${shopB.slug}`, "signin");
    expect(res.headers.get("location")).toContain(`/b/${shopB.slug}`);
    expect(res.headers.get("location")).not.toContain("signup_first");
    expect(res.headers.get("set-cookie")).toBeTruthy();
    // Nothing was added without their say-so: the shop page asks first
    expect(await db.select().from(memberships).where(eq(memberships.userId, card.membership.userId))).toHaveLength(1);
  });
});
