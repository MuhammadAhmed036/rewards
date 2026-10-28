import "dotenv/config";
import { describe, it, expect } from "vitest";
import { db } from "../db";
import { sessions, users } from "../db/schema";
import { eq } from "drizzle-orm";
import {
  createSession,
  getSessionContext,
  sessionKindForUser,
  sessionLookupKey,
  purgeExpiredSessions,
} from "./index";
import {
  decryptSessionCookie,
  encryptSessionCookie,
  MAX_COOKIE_AGE_MS,
  SESSION_POLICY,
} from "@/lib/session-cookie";
import { registerOwnerAndTenant } from "../services/tenant";
import { joinProgramme } from "../services/member";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("Encrypted session cookies", () => {
  it("round-trips an encrypted payload and hides the token", async () => {
    const exp = Date.now() + HOUR;
    const cookie = await encryptSessionCookie({ t: "secret-token-value", k: "staff", iat: Date.now(), exp });
    expect(cookie.startsWith("v1.")).toBe(true);
    expect(cookie).not.toContain("secret-token-value");

    const payload = await decryptSessionCookie(cookie);
    expect(payload?.t).toBe("secret-token-value");
    expect(payload?.k).toBe("staff");
  });

  it("rejects tampered, legacy, foreign and expired cookies", async () => {
    const cookie = await encryptSessionCookie({ t: "abc", k: "customer", iat: Date.now(), exp: Date.now() + HOUR });
    const [v, iv, ct] = cookie.split(".");
    const flipped = ct.slice(0, -2) + (ct.endsWith("A") ? "BB" : "AA");

    expect(await decryptSessionCookie(`${v}.${iv}.${flipped}`)).toBeNull();
    expect(await decryptSessionCookie("a3f9c2".repeat(10))).toBeNull(); // old raw hex token
    expect(await decryptSessionCookie(`v2.${iv}.${ct}`)).toBeNull();
    expect(await decryptSessionCookie("")).toBeNull();

    const expired = await encryptSessionCookie({ t: "abc", k: "customer", iat: 0, exp: Date.now() - 1000 });
    expect(await decryptSessionCookie(expired)).toBeNull();
  });
});

describe("Session lifetimes by role", () => {
  async function setup() {
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const slug = `session-test-${stamp}`;
    const owner = await registerOwnerAndTenant({
      email: `owner-${stamp}@sessiontest.com`,
      password: "Password123!",
      name: "Session Owner",
      businessName: "Session Cafe",
      slug,
    });
    const customer = await joinProgramme({
      tenantSlug: slug,
      email: `customer-${stamp}@sessiontest.com`,
      name: "Session Customer",
      password: "Password123!",
    });
    return { owner, customer };
  }

  it("stores only a hash of the token in the database", async () => {
    const { customer } = await setup();
    const session = await createSession(customer.membership.userId, "customer");
    const payload = await decryptSessionCookie(session.token);

    const rows = await db.select().from(sessions).where(eq(sessions.userId, customer.membership.userId));
    expect(rows.some((r) => r.token === payload!.t)).toBe(false);
    expect(rows.some((r) => r.token === session.token)).toBe(false);
    const key = await sessionLookupKey(session.token);
    expect(rows.some((r) => r.token === key)).toBe(true);
  });

  it("picks the session kind from the user's role (fixes the inverted password-login rule)", async () => {
    const { owner, customer } = await setup();
    expect(await sessionKindForUser(owner.user.id)).toBe("staff");
    expect(await sessionKindForUser(customer.membership.userId)).toBe("customer");

    const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.isPlatformAdmin, true)).limit(1);
    if (admin) expect(await sessionKindForUser(admin.id)).toBe("admin");
  });

  it("gives customers a 400-day cookie and staff/admins short ones", async () => {
    const { owner, customer } = await setup();
    const now = Date.now();

    const c = await createSession(customer.membership.userId, "customer");
    expect(c.expiresAt.getTime() - now).toBeGreaterThan(MAX_COOKIE_AGE_MS - HOUR);

    const s = await createSession(owner.user.id, "staff");
    expect(Math.round((s.expiresAt.getTime() - now) / HOUR)).toBe(12);

    const a = await createSession(owner.user.id, "admin");
    expect(Math.round((a.expiresAt.getTime() - now) / HOUR)).toBe(8);
  });

  it("signs staff out after 4 idle hours", async () => {
    const { owner } = await setup();
    const session = await createSession(owner.user.id, "staff");
    expect(await getSessionContext(session.token)).not.toBeNull();

    const key = (await sessionLookupKey(session.token))!;
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.token, key));
    expect(await getSessionContext(session.token)).toBeNull();
  });

  it("ends staff sessions 12 hours after sign-in even if active, and removes them", async () => {
    const { owner } = await setup();
    const session = await createSession(owner.user.id, "staff");
    const key = (await sessionLookupKey(session.token))!;

    await db
      .update(sessions)
      .set({ createdAt: new Date(Date.now() - 12 * HOUR - 60_000), expiresAt: new Date(Date.now() + HOUR) })
      .where(eq(sessions.token, key));

    expect(await getSessionContext(session.token)).toBeNull();
    const rows = await db.select().from(sessions).where(eq(sessions.token, key));
    expect(rows).toHaveLength(0);
  });

  it("keeps an active customer signed in by sliding their session forward", async () => {
    const { customer } = await setup();
    const session = await createSession(customer.membership.userId, "customer");
    const key = (await sessionLookupKey(session.token))!;

    // Pretend the customer last used their card 30 days ago.
    const stale = new Date(Date.now() + MAX_COOKIE_AGE_MS - 30 * DAY);
    await db.update(sessions).set({ expiresAt: stale }).where(eq(sessions.token, key));

    expect(await getSessionContext(session.token)).not.toBeNull();
    const [row] = await db.select().from(sessions).where(eq(sessions.token, key));
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + MAX_COOKIE_AGE_MS - DAY);
  });

  it("shrinks a long customer session if that user becomes staff", async () => {
    const { owner } = await setup();
    const session = await createSession(owner.user.id, "customer");
    expect(await getSessionContext(session.token)).not.toBeNull();

    const key = (await sessionLookupKey(session.token))!;
    const [row] = await db.select().from(sessions).where(eq(sessions.token, key));
    expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(SESSION_POLICY.staff.idleMs + 1000);
  });

  it("purges expired sessions", async () => {
    const { customer } = await setup();
    const session = await createSession(customer.membership.userId, "customer");
    const key = (await sessionLookupKey(session.token))!;
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.token, key));

    expect(await purgeExpiredSessions()).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(sessions).where(eq(sessions.token, key))).toHaveLength(0);
  });
});
