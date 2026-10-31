import crypto from "crypto";
import dns from "dns/promises";
import net from "net";
import { after } from "next/server";
import { and, desc, eq, lte, or } from "drizzle-orm";
import { db } from "../db";
import { domainEvents, webhookDeliveries, webhookEndpoints } from "../db/schema";
import { RequestContext, assertCan } from "../security/permissions";
import { openSecret, sealSecret } from "@/lib/secret-box";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "./audit";
import { EVENT_NAMES, emitEvent } from "./events";

type EventRow = typeof domainEvents.$inferSelect;

const MAX_ENDPOINTS = 5;
const BACKOFF_MINUTES = [1, 5, 30, 120, 720]; // then it is dead and shown as failed
const TIMEOUT_MS = 8000;

/** True for addresses that point inside a network rather than at the public internet. */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v6 = ip.toLowerCase();
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || v6.startsWith("::ffff:127.") || v6.startsWith("::ffff:10.") || v6.startsWith("::ffff:192.168.");
}

/** Webhooks must be https and must not reach into private networks (so they can't be used to probe ours). */
export async function assertSafeWebhookUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Enter a full web address, like https://example.com/hooks.");
  }
  const local = process.env.NODE_ENV !== "production" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !local) throw new Error("The address must start with https://.");
  if (url.username || url.password) throw new Error("Leave the username and password out of the address.");
  if (local) return url;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) throw new Error("We couldn't find that address. Check the spelling.");
  if (addresses.some(isPrivateAddress)) throw new Error("That address points inside a private network, so it can't be used.");
  return url;
}

export function signPayload(secret: string, timestamp: number, body: string) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

const newSecret = () => `whsec_${crypto.randomBytes(24).toString("hex")}`;

export async function listWebhooks(ctx: RequestContext) {
  assertCan(ctx, "tenant.manage");
  const endpoints = await db
    .select({ id: webhookEndpoints.id, url: webhookEndpoints.url, events: webhookEndpoints.events, active: webhookEndpoints.active, createdAt: webhookEndpoints.createdAt })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.tenantId, ctx.tenantId!))
    .orderBy(desc(webhookEndpoints.createdAt));
  const recent = await db
    .select({
      id: webhookDeliveries.id,
      endpointId: webhookDeliveries.endpointId,
      status: webhookDeliveries.status,
      attempts: webhookDeliveries.attempts,
      lastStatusCode: webhookDeliveries.lastStatusCode,
      lastError: webhookDeliveries.lastError,
      createdAt: webhookDeliveries.createdAt,
      eventName: domainEvents.name,
    })
    .from(webhookDeliveries)
    .innerJoin(domainEvents, eq(domainEvents.id, webhookDeliveries.eventId))
    .where(eq(webhookDeliveries.tenantId, ctx.tenantId!))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(30);
  return { endpoints, recent, eventNames: EVENT_NAMES.filter((n) => n !== "webhook.test") };
}

/** Adds a webhook. The signing secret is shown once, here, and never again. */
export async function createWebhook(ctx: RequestContext, params: { url: string; events?: string[] }) {
  assertCan(ctx, "tenant.manage");
  const tenantId = ctx.tenantId!;
  const url = await assertSafeWebhookUrl(params.url);
  const events = (params.events ?? []).filter((e): e is (typeof EVENT_NAMES)[number] => (EVENT_NAMES as readonly string[]).includes(e));
  const existing = await db.select({ id: webhookEndpoints.id }).from(webhookEndpoints).where(eq(webhookEndpoints.tenantId, tenantId));
  if (existing.length >= MAX_ENDPOINTS) throw new Error(`You can have up to ${MAX_ENDPOINTS} webhooks. Remove one first.`);
  const secret = newSecret();
  const [row] = await db
    .insert(webhookEndpoints)
    .values({ tenantId, url: url.toString(), secretEncrypted: sealSecret(secret), events, createdBy: ctx.userId })
    .returning();
  await logAuditEvent(ctx, { action: "webhook.created", targetType: "webhook", targetId: row.id, metadata: { url: row.url } });
  return { id: row.id, url: row.url, events, secret };
}

export async function deleteWebhook(ctx: RequestContext, id: string) {
  assertCan(ctx, "tenant.manage");
  const [row] = await db.delete(webhookEndpoints).where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.tenantId, ctx.tenantId!))).returning();
  if (!row) throw new Error("That webhook doesn't exist.");
  await logAuditEvent(ctx, { action: "webhook.deleted", targetType: "webhook", targetId: id });
  return { deleted: true };
}

export async function setWebhookActive(ctx: RequestContext, id: string, active: boolean) {
  assertCan(ctx, "tenant.manage");
  const [row] = await db.update(webhookEndpoints).set({ active }).where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.tenantId, ctx.tenantId!))).returning();
  if (!row) throw new Error("That webhook doesn't exist.");
  return { active };
}

/** Replaces the signing secret (for example if it leaked). The new one is shown once. */
export async function rotateWebhookSecret(ctx: RequestContext, id: string) {
  assertCan(ctx, "tenant.manage");
  const secret = newSecret();
  const [row] = await db
    .update(webhookEndpoints)
    .set({ secretEncrypted: sealSecret(secret) })
    .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.tenantId, ctx.tenantId!)))
    .returning();
  if (!row) throw new Error("That webhook doesn't exist.");
  await logAuditEvent(ctx, { action: "webhook.secret_rotated", targetType: "webhook", targetId: id });
  return { secret };
}

/** Sends a harmless test event to every active webhook so the owner can check theirs works. */
export async function sendTestEvent(ctx: RequestContext) {
  assertCan(ctx, "tenant.manage");
  const event = await emitEvent(ctx.tenantId, "webhook.test", { message: "This is a test from your loyalty programme." });
  if (event) await deliverDueWebhooks();
  return { sent: Boolean(event) };
}

/** Called when an event is recorded: queue a delivery for each active webhook that wants it. */
export async function queueDeliveries(event: EventRow) {
  const endpoints = await db
    .select()
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.tenantId, event.tenantId), eq(webhookEndpoints.active, true)));
  const wanted = endpoints.filter((e) => {
    const list = e.events as string[];
    return list.length === 0 || list.includes(event.name);
  });
  if (wanted.length === 0) return;
  await db.insert(webhookDeliveries).values(wanted.map((e) => ({ tenantId: event.tenantId, endpointId: e.id, eventId: event.id })));
  // Send after the response, so a slow receiver never slows the till
  try {
    after(() => deliverDueWebhooks().then(() => undefined));
  } catch {
    // Outside a request (tests, jobs): the next run delivers them
  }
}

async function deliverOne(delivery: typeof webhookDeliveries.$inferSelect) {
  const [endpoint] = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, delivery.endpointId)).limit(1);
  const [event] = await db.select().from(domainEvents).where(eq(domainEvents.id, delivery.eventId)).limit(1);
  if (!endpoint || !event) return;

  const body = JSON.stringify({ id: event.id, type: event.name, created: event.createdAt.toISOString(), tenantId: event.tenantId, data: event.payload });
  const timestamp = Math.floor(Date.now() / 1000);
  const attempts = delivery.attempts + 1;
  let statusCode: number | null = null;
  let error: string | null = null;
  try {
    // Checked again at send time, in case the address now points somewhere private
    await assertSafeWebhookUrl(endpoint.url);
    const res = await fetch(endpoint.url, {
      method: "POST",
      redirect: "manual", // a redirect could lead somewhere private
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "LoyaltyPlatform-Webhooks/1",
        "X-Loyalty-Event": event.name,
        "X-Loyalty-Event-Id": event.id,
        "X-Loyalty-Signature": `t=${timestamp},v1=${signPayload(openSecret(endpoint.secretEncrypted), timestamp, body)}`,
      },
      body,
    });
    statusCode = res.status;
    if (res.status < 200 || res.status >= 300) error = `The receiver answered ${res.status}`;
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not reach the receiver";
  }

  if (!error) {
    await db.update(webhookDeliveries).set({ status: "sent", attempts, lastStatusCode: statusCode, lastError: null, deliveredAt: new Date() }).where(eq(webhookDeliveries.id, delivery.id));
    return;
  }
  const dead = attempts > BACKOFF_MINUTES.length;
  await db
    .update(webhookDeliveries)
    .set({
      status: dead ? "dead" : "failed",
      attempts,
      lastStatusCode: statusCode,
      lastError: error.slice(0, 300),
      nextAttemptAt: new Date(Date.now() + (BACKOFF_MINUTES[attempts - 1] ?? 720) * 60_000),
    })
    .where(eq(webhookDeliveries.id, delivery.id));
}

/** Sends everything that is due, oldest first, with retries (1 min, 5 min, 30 min, 2 h, 12 h) before giving up. */
export async function deliverDueWebhooks(limit = 25) {
  const due = await db
    .select()
    .from(webhookDeliveries)
    .where(and(or(eq(webhookDeliveries.status, "queued"), eq(webhookDeliveries.status, "failed")), lte(webhookDeliveries.nextAttemptAt, new Date())))
    .orderBy(webhookDeliveries.createdAt)
    .limit(limit);
  for (const d of due) {
    try {
      // Claim it with one atomic update, so a second run can't send the same delivery at the same time:
      // whoever changes the due time first wins, and the other sees it is no longer due
      const [claimed] = await db
        .update(webhookDeliveries)
        .set({ nextAttemptAt: new Date(Date.now() + 60_000) })
        .where(and(eq(webhookDeliveries.id, d.id), or(eq(webhookDeliveries.status, "queued"), eq(webhookDeliveries.status, "failed")), lte(webhookDeliveries.nextAttemptAt, new Date())))
        .returning();
      if (claimed) await deliverOne(claimed);
    } catch (err) {
      logger.warn({ err, deliveryId: d.id }, "Webhook delivery crashed");
    }
  }
  return { attempted: due.length };
}
