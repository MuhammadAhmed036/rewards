import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { domainEvents } from "../db/schema";
import { logger } from "@/lib/logger";

/** The event names from the spec's minimum vocabulary (Appendix B). */
export const EVENT_NAMES = [
  "membership.created",
  "membership.updated",
  "membership.suspended",
  "points.earned",
  "points.redeemed",
  "points.expired",
  "points.adjusted",
  "points.reversed",
  "reward.created",
  "reward.updated",
  "reward.redeemed",
  "reward.expired",
  "qr.issued",
  "qr.revoked",
  "qr.validation_failed",
  "consent.granted",
  "consent.withdrawn",
  "campaign.sent",
  "campaign.suppressed",
  "staff.invited",
  "staff.role_changed",
  "tenant.suspended",
  "data_export.created",
  "webhook.test",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/**
 * Records that something happened and queues it for every webhook the business set up. Never throws:
 * telling the outside world must not break the action that caused it.
 */
export async function emitEvent(tenantId: string | null | undefined, name: EventName, payload: Record<string, unknown> = {}) {
  if (!tenantId) return null;
  try {
    const [event] = await db.insert(domainEvents).values({ tenantId, name, payload }).returning();
    // Loaded on demand: the webhook code reads events too
    const { queueDeliveries } = await import("./webhooks");
    await queueDeliveries(event);
    return event;
  } catch (err) {
    logger.warn({ err, name }, "Could not record event");
    return null;
  }
}

/** Events after a given one, oldest first, for a business's systems to catch up on (FR-121 replay). */
export async function eventsAfter(tenantId: string, afterId: string | null, limit = 100) {
  // Compared inside the database: its times are finer than a JavaScript date, so the last event seen is never repeated
  const known = afterId
    ? (await db.select({ id: domainEvents.id }).from(domainEvents).where(and(eq(domainEvents.id, afterId), eq(domainEvents.tenantId, tenantId))).limit(1)).length > 0
    : false;
  return db
    .select()
    .from(domainEvents)
    .where(
      known
        ? and(eq(domainEvents.tenantId, tenantId), sql`${domainEvents.createdAt} > (select created_at from domain_events where id = ${afterId})`)
        : eq(domainEvents.tenantId, tenantId)
    )
    .orderBy(asc(domainEvents.createdAt), asc(domainEvents.id))
    .limit(Math.min(limit, 500));
}
