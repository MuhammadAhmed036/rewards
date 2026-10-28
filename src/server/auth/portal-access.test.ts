import "dotenv/config";
import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { POST as loginRoute } from "@/app/api/v1/auth/login/route";
import { POST as joinRoute } from "@/app/api/v1/customer/join/route";
import { GET as hubRoute } from "@/app/api/v1/customer/hub-data/route";
import { registerOwnerAndTenant } from "../services/tenant";
import { addStaffMember } from "../services/staff";
import { joinProgramme } from "../services/member";
import { RequestContext } from "../security/permissions";
import { db } from "../db";
import { memberships, users } from "../db/schema";
import { eq } from "drizzle-orm";

const PASSWORD = "Password123!";
const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const emails = {
  ownerA: `owner-a-${stamp}@portal.test`,
  ownerB: `owner-b-${stamp}@portal.test`,
  staffA: `staff-a-${stamp}@portal.test`,
  customer: `customer-${stamp}@portal.test`,
};
let slugA = "";
let slugB = "";

// Requests here come from one test process, so give each a unique IP to stay clear of rate limits.
let ip = 1;
function post(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.9.${Math.floor(ip / 250)}.${ip++ % 250}` },
    body: JSON.stringify(body),
  });
}
async function login(email: string, portal?: string, tenantSlug?: string) {
  const res = await loginRoute(post("http://localhost:3000/api/v1/auth/login", { email, password: PASSWORD, portal, tenantSlug }));
  return { status: res.status, json: await res.json(), cookie: res.headers.getSetCookie().find((c) => c.includes("loyalty_session=")) };
}
async function join(email: string, tenantSlug: string, password?: string) {
  const res = await joinRoute(post("http://localhost:3000/api/v1/customer/join", { email, password, tenantSlug, name: "Test" }));
  return { status: res.status, json: await res.json() };
}

beforeAll(async () => {
  slugA = `portal-a-${stamp}`;
  slugB = `portal-b-${stamp}`;
  const a = await registerOwnerAndTenant({ email: emails.ownerA, password: PASSWORD, name: "Owner A", businessName: "Portal A", slug: slugA });
  await registerOwnerAndTenant({ email: emails.ownerB, password: PASSWORD, name: "Owner B", businessName: "Portal B", slug: slugB });
  const ctx: RequestContext = { userId: a.user.id, tenantId: a.tenant.id, role: "owner", requestId: "portal-test" };
  await addStaffMember(ctx, { email: emails.staffA, name: "Staff A", role: "staff", temporaryPassword: PASSWORD });
  await joinProgramme({ tenantSlug: slugA, email: emails.customer, name: "Cust", password: PASSWORD });
});

describe("Each sign-in tab only lets in the matching account", () => {
  it("blocks an owner email on the customer tab, without creating a session", async () => {
    const r = await login(emails.ownerA, "customer", slugA);
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe("BUSINESS_ACCOUNT");
    expect(r.cookie).toBeUndefined();
  });

  it("lets the owner in on their own shop's owner tab only", async () => {
    expect((await login(emails.ownerA, "owner", slugA)).status).toBe(200);
    const other = await login(emails.ownerA, "owner", slugB);
    expect(other.status).toBe(403);
    expect(other.json.error.code).toBe("NOT_THIS_BUSINESS");
  });

  it("sends the owner to the owner tab if they use the staff tab", async () => {
    const r = await login(emails.ownerA, "staff", slugA);
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe("WRONG_PORTAL");
  });

  it("lets staff in on their shop's staff tab, and nowhere else", async () => {
    expect((await login(emails.staffA, "staff", slugA)).status).toBe(200);
    expect((await login(emails.staffA, "staff", slugB)).json.error.code).toBe("NOT_THIS_BUSINESS");
    expect((await login(emails.staffA, "owner", slugA)).json.error.code).toBe("WRONG_PORTAL");
    expect((await login(emails.staffA, "customer", slugA)).json.error.code).toBe("BUSINESS_ACCOUNT");
  });

  it("lets a customer sign in only at shops where they registered", async () => {
    expect((await login(emails.customer, "customer", slugA)).status).toBe(200);
    const notHere = await login(emails.customer, "customer", slugB);
    expect(notHere.status).toBe(403);
    expect(notHere.json.error.code).toBe("NOT_A_MEMBER");
    expect(notHere.cookie).toBeUndefined();
    expect((await login(emails.customer, "owner", slugA)).status).toBe(403);
  });

  it("keeps non-admins out of the platform admin form", async () => {
    const r = await login(emails.ownerA, "admin");
    expect(r.status).toBe(403);
    expect(r.cookie).toBeUndefined();
  });
});

describe("Registering a customer card", () => {
  it("refuses to turn an owner or staff email into a customer card", async () => {
    const owner = await join(emails.ownerA, slugB, PASSWORD);
    expect(owner.status).toBe(409);
    expect(owner.json.error.code).toBe("BUSINESS_ACCOUNT");
    expect((await join(emails.staffA, slugA, PASSWORD)).json.error.code).toBe("BUSINESS_ACCOUNT");
  });

  it("lets an existing customer add a new shop's card only with their password", async () => {
    const wrong = await join(emails.customer, slugB, "not-the-password");
    expect(wrong.status).toBe(409);
    const right = await join(emails.customer, slugB, PASSWORD);
    expect(right.status).toBe(200);
    expect((await login(emails.customer, "customer", slugB)).status).toBe(200);
  });

  it("tells a customer who already has a card here to sign in", async () => {
    const again = await join(emails.customer, slugA, PASSWORD);
    expect(again.status).toBe(409);
    expect(again.json.error.message).toMatch(/already have a card/i);
  });
});

describe("Shop page never creates cards by itself", () => {
  it("shows no card, and creates none, for a signed-in owner or an unregistered customer", async () => {
    const ownerSession = (await login(emails.ownerB, "owner", slugB)).cookie!.split(";")[0];
    const res = await hubRoute(
      new NextRequest(`http://localhost:3000/api/v1/customer/hub-data?slug=${slugA}`, { headers: { Cookie: ownerSession } })
    );
    expect((await res.json()).data.member).toBeNull();

    const [ownerB] = await db.select({ id: users.id }).from(users).where(eq(users.email, emails.ownerB)).limit(1);
    const cards = await db.select().from(memberships).where(eq(memberships.userId, ownerB.id));
    expect(cards).toHaveLength(0);
  });
});
