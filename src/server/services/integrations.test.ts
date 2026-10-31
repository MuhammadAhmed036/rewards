import "dotenv/config";
import crypto from "crypto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { domainEvents, ledgerEntries, memberNotes, webhookDeliveries } from "../db/schema";
import { registerOwnerAndTenant } from "./tenant";
import { joinProgramme } from "./member";
import { earn } from "./ledger";
import { publishRuleVersion } from "./programme";
import { eventsAfter } from "./events";
import { assertSafeWebhookUrl, createWebhook, deleteWebhook, deliverDueWebhooks, isPrivateAddress, listWebhooks, rotateWebhookSecret, signPayload } from "./webhooks";
import { createApiKey, listApiKeys, revokeApiKey } from "./api-keys";
import { addNote, deleteNote, listNotes } from "./member-notes";
import { exportUserDataJson, deleteAndAnonymiseAccount, runRetentionCleanup } from "./privacy";
import { POST as earnRoute } from "@/app/api/v1/integrations/earn/route";
import { GET as eventsRoute } from "@/app/api/v1/integrations/events/route";
import { RequestContext } from "../security/permissions";

async function shop() {
  const stamp = `int-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const s = await registerOwnerAndTenant({
    email: `owner-${stamp}@int.test`,
    password: "Password123!",
    name: "Int Owner",
    businessName: `Int ${stamp}`,
    slug: stamp,
    emailVerified: true,
  });
  const ctx: RequestContext = { userId: s.user.id, tenantId: s.tenant.id, role: "owner", requestId: "int" };
  return { ...s, ctx, slug: stamp };
}
const PUBLIC_URL = "https://93.184.216.34/hooks"; // a public address, so no DNS lookup is needed

/**
 * Sends this business's waiting deliveries. Other test files run the same global delivery job in their own
 * process (without this file's fake network), and may take a delivery first; if so, put it back and send it again.
 */
async function deliverFor(tenantId: string, sawCall: () => boolean) {
  for (let i = 0; i < 4 && !sawCall(); i++) {
    await db.update(webhookDeliveries).set({ status: "queued", nextAttemptAt: new Date(Date.now() - 1000), attempts: 0 }).where(eq(webhookDeliveries.tenantId, tenantId));
    await deliverDueWebhooks(200);
  }
}

afterEach(() => vi.restoreAllMocks());

describe("Webhooks (FR-121)", () => {
  it("only accepts https addresses that don't point inside a private network", async () => {
    await expect(assertSafeWebhookUrl("http://93.184.216.34/x")).rejects.toThrow(/https/);
    await expect(assertSafeWebhookUrl("https://10.0.0.5/x")).rejects.toThrow(/private network/);
    await expect(assertSafeWebhookUrl("https://192.168.1.10/x")).rejects.toThrow(/private network/);
    await expect(assertSafeWebhookUrl("https://169.254.169.254/latest")).rejects.toThrow(/private network/);
    await expect(assertSafeWebhookUrl("https://user:pw@93.184.216.34/x")).rejects.toThrow(/username/);
    await expect(assertSafeWebhookUrl("not a url")).rejects.toThrow(/full web address/);
    expect(isPrivateAddress("172.20.1.1")).toBe(true);
    expect(isPrivateAddress("172.32.1.1")).toBe(false);
    expect(isPrivateAddress("::1")).toBe(true);
    await expect(assertSafeWebhookUrl(PUBLIC_URL)).resolves.toBeDefined();
  });

  it("sends a signed event with an id the receiver can check and de-duplicate", async () => {
    const s = await shop();
    const hook = await createWebhook(s.ctx, { url: PUBLIC_URL, events: ["points.earned"] });
    expect(hook.secret).toMatch(/^whsec_/);

    const calls: Array<{ headers: Record<string, string>; body: string }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      calls.push({ headers: init!.headers as Record<string, string>, body: String(init!.body) });
      return new Response("ok", { status: 200 });
    });

    const member = await joinProgramme({ tenantSlug: s.slug, email: `hook-${Date.now()}@int.test` }); // not subscribed to this one
    await earn(s.ctx, { membershipId: member.membership.id, locationId: s.location.id, amountMinor: 1000, idempotencyKey: crypto.randomUUID() });
    await deliverFor(s.tenant.id, () => calls.some((c) => JSON.parse(c.body).tenantId === s.tenant.id));

    const mine = calls.filter((c) => JSON.parse(c.body).tenantId === s.tenant.id);
    expect(mine).toHaveLength(1);
    const call = mine[0];
    expect(call.headers["X-Loyalty-Event"]).toBe("points.earned");
    expect(JSON.parse(call.body).data.points).toBe(10);
    expect(JSON.parse(call.body).id).toBe(call.headers["X-Loyalty-Event-Id"]);

    // The receiver recomputes the signature from the shared secret
    const [, t, v1] = /t=(\d+),v1=([0-9a-f]+)/.exec(call.headers["X-Loyalty-Signature"])!;
    expect(v1).toBe(signPayload(hook.secret, Number(t), call.body));
    expect(Math.abs(Date.now() / 1000 - Number(t))).toBeLessThan(10);
    // ...and a body that was changed on the way does not match
    expect(signPayload(hook.secret, Number(t), call.body + " ")).not.toBe(v1);
  });

  it("retries a failing receiver with growing gaps, then reports it as failed", async () => {
    const s = await shop();
    await createWebhook(s.ctx, { url: PUBLIC_URL });
    let status = 500;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("no", { status }));

    const member = await joinProgramme({ tenantSlug: s.slug, email: `retry-${Date.now()}@int.test` });
    await earn(s.ctx, { membershipId: member.membership.id, locationId: s.location.id, amountMinor: 500, idempotencyKey: crypto.randomUUID() });
    await deliverDueWebhooks(100);

    const mineRows = async () => (await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.tenantId, s.tenant.id))).filter((d) => d.attempts > 0 || d.status !== "queued");
    let rows = await mineRows();
    expect(rows.every((r) => r.status === "failed" && r.attempts === 1)).toBe(true);
    expect(rows[0].nextAttemptAt.getTime()).toBeGreaterThan(Date.now()); // not retried straight away

    // Time passes and the receiver recovers
    status = 200;
    await db.update(webhookDeliveries).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(eq(webhookDeliveries.tenantId, s.tenant.id));
    await deliverDueWebhooks(100);
    rows = await mineRows();
    expect(rows.every((r) => r.status === "sent")).toBe(true);

    // A receiver that never recovers is given up on after the last retry
    const dead = await shop();
    await createWebhook(dead.ctx, { url: PUBLIC_URL });
    status = 500;
    const m2 = await joinProgramme({ tenantSlug: dead.slug, email: `dead-${Date.now()}@int.test` });
    await earn(dead.ctx, { membershipId: m2.membership.id, locationId: dead.location.id, amountMinor: 500, idempotencyKey: crypto.randomUUID() });
    for (let i = 0; i < 7; i++) {
      await db.update(webhookDeliveries).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(and(eq(webhookDeliveries.tenantId, dead.tenant.id), eq(webhookDeliveries.status, "failed")));
      await deliverDueWebhooks(100);
    }
    const finals = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.tenantId, dead.tenant.id));
    expect(finals.some((d) => d.status === "dead")).toBe(true);
  });

  it("keeps the secret hidden after creation, can replace it, and is limited to the business's own hooks", async () => {
    const a = await shop();
    const b = await shop();
    const hook = await createWebhook(a.ctx, { url: PUBLIC_URL });
    const listed = await listWebhooks(a.ctx);
    expect(JSON.stringify(listed)).not.toContain(hook.secret);
    expect((await rotateWebhookSecret(a.ctx, hook.id)).secret).not.toBe(hook.secret);
    await expect(deleteWebhook(b.ctx, hook.id)).rejects.toThrow(/doesn't exist/);
    await deleteWebhook(a.ctx, hook.id);
    expect((await listWebhooks(a.ctx)).endpoints).toHaveLength(0);
    for (let i = 0; i < 5; i++) await createWebhook(a.ctx, { url: PUBLIC_URL });
    await expect(createWebhook(a.ctx, { url: PUBLIC_URL })).rejects.toThrow(/up to 5/);
  });
});

describe("API keys and tills (FR-040, FR-124, UC-17)", () => {
  const request = (path: string, key: string | null, body?: unknown) =>
    new NextRequest(`http://localhost:3000${path}`, {
      method: body ? "POST" : "GET",
      headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });

  it("lets a till report a sale once, however often it retries, and credits by the shop's own rules", async () => {
    const s = await shop();
    // A second sale straight after the first is normal at a till
    await publishRuleVersion(s.ctx, { earn: { mode: "spend", pointsPerUnit: 1, unitMinor: 100 }, caps: { minMinutesBetweenEarns: 0 }, exclusions: {}, expiry: {} });
    const key = await createApiKey(s.ctx, { name: "Front till", scopes: ["earn:write"] });
    expect(key.key).toMatch(/^lk_live_/);
    expect(JSON.stringify(await listApiKeys(s.ctx))).not.toContain(key.key); // only the start of the key is ever listed

    const member = await joinProgramme({ tenantSlug: s.slug, email: `till-${Date.now()}@int.test` });
    const sale = { memberNumber: member.membership.memberNumber, locationId: s.location.id, amountMinor: 2500, externalRef: "RECEIPT-1001" };
    const first = await earnRoute(request("/api/v1/integrations/earn", key.key, sale));
    const again = await earnRoute(request("/api/v1/integrations/earn", key.key, sale));
    expect(first.status).toBe(200);
    expect((await first.json()).data).toMatchObject({ pointsAwarded: 25, duplicate: false });
    expect((await again.json()).data).toMatchObject({ pointsAwarded: 25, duplicate: true });

    const entries = await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.membershipId, member.membership.id), eq(ledgerEntries.type, "earn")));
    expect(entries.filter((e) => e.reasonCode !== "bonus")).toHaveLength(1);
    // A different sale number is a new sale
    const next = await earnRoute(request("/api/v1/integrations/earn", key.key, { ...sale, externalRef: "RECEIPT-1002" }));
    expect((await next.json()).data.duplicate).toBe(false);
  });

  it("refuses a missing, wrong-scope, revoked or expired key, and another business's customer", async () => {
    const s = await shop();
    const other = await shop();
    const stranger = await joinProgramme({ tenantSlug: other.slug, email: `other-${Date.now()}@int.test` });
    const readOnly = await createApiKey(s.ctx, { name: "Reporter", scopes: ["events:read"] });
    const writer = await createApiKey(s.ctx, { name: "Till", scopes: ["earn:write"] });
    const sale = { memberNumber: "ABCDEFGH", locationId: s.location.id, amountMinor: 100, externalRef: "X" };

    expect((await earnRoute(request("/api/v1/integrations/earn", null, sale))).status).toBe(401);
    expect((await earnRoute(request("/api/v1/integrations/earn", "lk_live_" + "0".repeat(48), sale))).status).toBe(401);
    expect((await earnRoute(request("/api/v1/integrations/earn", readOnly.key, sale))).status).toBe(403);
    // A customer who belongs to a different business can't be found through this key
    const wrongShop = await earnRoute(request("/api/v1/integrations/earn", writer.key, { ...sale, memberNumber: stranger.membership.memberNumber }));
    expect(wrongShop.status).toBe(404);

    await revokeApiKey(s.ctx, writer.id);
    expect((await earnRoute(request("/api/v1/integrations/earn", writer.key, sale))).status).toBe(401);
    await expect(createApiKey(s.ctx, { name: " ", scopes: ["earn:write"] })).rejects.toThrow(/name/);
  });

  it("lets a business catch up on what it missed, oldest first, from a point it remembers", async () => {
    const s = await shop();
    const key = await createApiKey(s.ctx, { name: "Reporter", scopes: ["events:read"] });
    const member = await joinProgramme({ tenantSlug: s.slug, email: `ev-${Date.now()}@int.test` });
    await earn(s.ctx, { membershipId: member.membership.id, locationId: s.location.id, amountMinor: 300, idempotencyKey: crypto.randomUUID() });

    const res = await eventsRoute(request("/api/v1/integrations/events", key.key));
    const body = await res.json();
    expect(body.data.map((e: { type: string }) => e.type)).toEqual(expect.arrayContaining(["membership.created", "points.earned"]));
    // Asking from the last one seen returns nothing new
    const later = await (await eventsRoute(request(`/api/v1/integrations/events?after=${body.next}`, key.key))).json();
    expect(later.data).toHaveLength(0);
    expect((await eventsAfter(s.tenant.id, null)).length).toBe(body.data.length);
    expect((await db.select().from(domainEvents).where(eq(domainEvents.tenantId, s.tenant.id))).every((e) => e.tenantId === s.tenant.id)).toBe(true);
  });
});

describe("Customer notes (FR-086)", () => {
  it("are for owners and managers only, stay within the business, and are logged without their text", async () => {
    const a = await shop();
    const b = await shop();
    const m = await joinProgramme({ tenantSlug: a.slug, email: `note-${Date.now()}@int.test` });

    const note = await addNote(a.ctx, m.membership.id, "Prefers oat milk");
    expect((await listNotes(a.ctx, m.membership.id)).map((n) => n.body)).toEqual(["Prefers oat milk"]);
    await expect(addNote({ ...a.ctx, role: "staff" }, m.membership.id, "x")).rejects.toThrow(/FORBIDDEN/);
    await expect(listNotes({ ...a.ctx, role: "staff" }, m.membership.id)).rejects.toThrow(/FORBIDDEN/);
    await expect(listNotes(b.ctx, m.membership.id)).rejects.toThrow(/not found/i);
    await expect(addNote(a.ctx, m.membership.id, "   ")).rejects.toThrow(/Write something/);
    await expect(addNote(a.ctx, m.membership.id, "x".repeat(1001))).rejects.toThrow(/under 1000/);
    await expect(deleteNote(b.ctx, note.id)).rejects.toThrow(/doesn't exist/);

    const { auditEvents } = await import("../db/schema");
    const audits = await db.select().from(auditEvents).where(eq(auditEvents.tenantId, a.tenant.id));
    expect(audits.some((e) => e.action === "member.note_added")).toBe(true);
    expect(JSON.stringify(audits)).not.toContain("oat milk");

    await deleteNote(a.ctx, note.id);
    expect(await listNotes(a.ctx, m.membership.id)).toHaveLength(0);
  });

  it("go into the customer's data export, expire after two years, and are erased with the account", async () => {
    const s = await shop();
    const m = await joinProgramme({ tenantSlug: s.slug, email: `erase-${Date.now()}@int.test` });
    await addNote(s.ctx, m.membership.id, "Allergic to nuts");
    const old = await addNote(s.ctx, m.membership.id, "Old remark");
    await db.update(memberNotes).set({ createdAt: new Date(Date.now() - 800 * 86400_000) }).where(eq(memberNotes.id, old.id));

    const exported = (await exportUserDataJson(m.membership.userId)) as { memberships: Array<{ notesKeptByShop: Array<{ body: string }> }> };
    expect(exported.memberships[0].notesKeptByShop.map((n) => n.body)).toContain("Allergic to nuts");

    await runRetentionCleanup();
    const remaining = await listNotes(s.ctx, m.membership.id);
    expect(remaining.map((n) => n.body)).toEqual(["Allergic to nuts"]); // the old one aged out

    await deleteAndAnonymiseAccount(m.membership.userId);
    expect(await db.select().from(memberNotes).where(eq(memberNotes.membershipId, m.membership.id))).toHaveLength(0);
  });
});
