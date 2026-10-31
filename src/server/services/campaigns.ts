import crypto from "crypto";
import { assertGrowthAllowed } from "./billing";
import { after } from "next/server";
import { z } from "zod";
import { and, count, desc, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { campaigns, consentRecords, emailOutbox, emailSuppressions, membershipBalances, memberships, programmes, ruleVersions, tenants, users } from "../db/schema";
import { ruleConfigSchema } from "@/lib/points";
import { RequestContext, assertCan } from "../security/permissions";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "./audit";
import { processOutbox, queueEmail } from "./email";
import { campaignEventCounts, recordEmailEvent } from "./email-events";
import { emitEvent } from "./events";

/**
 * Email offers to a chosen group of customers (FR-090 to FR-094). Only customers who said yes to
 * offers from this shop are ever included, and every email has a one-click opt-out (FR-093).
 */

export const audienceSchema = z.object({
  lastVisit: z
    .object({
      olderThanDays: z.number().int().min(1).max(3650).optional(),
      withinDays: z.number().int().min(1).max(3650).optional(),
    })
    .optional(),
  minBalance: z.number().int().min(0).optional(),
  // Customers who joined at, or have earned at, any of these locations
  locationIds: z.array(z.string().uuid()).max(50).optional(),
  // A loyalty level by name, or "none" for customers who haven't reached the first one yet
  tier: z.string().trim().min(1).max(30).optional(),
  // Customers who earned at least this many points in the last N days
  minEarned: z.object({ points: z.number().int().min(1), withinDays: z.number().int().min(1).max(3650) }).optional(),
});
export type Audience = z.infer<typeof audienceSchema>;

export const campaignSchema = z.object({
  subject: z.string().trim().min(3, "Write a subject line").max(150),
  body: z.string().trim().min(10, "Write a short message (at least 10 characters)").max(3000),
  audience: audienceSchema.default({}),
  // Leave out to send now; otherwise a future time (up to 60 days ahead)
  sendAt: z.string().datetime({ offset: true }).optional(),
  // Reach at most this many people
  maxRecipients: z.number().int().min(1).max(100000).optional(),
});

const MAX_CAMPAIGNS_PER_DAY = 3;

export function marketingOptOutToken(membershipId: string) {
  return crypto.createHmac("sha256", env.AUTH_SECRET).update(`mkt:${membershipId}`).digest("hex").slice(0, 32);
}
export function marketingOptOutUrl(membershipId: string, campaignId?: string) {
  return `${env.APP_URL}/unsubscribe?kind=offers&m=${membershipId}&t=${marketingOptOutToken(membershipId)}${campaignId ? `&c=${campaignId}` : ""}`;
}

/** Customers of this shop who agreed to offers and match the chosen filters (FR-091). */
async function audienceRows(tenantId: string, audience: Audience) {
  const lastVisit = sql<Date | null>`(select max(le.occurred_at) from ledger_entries le where le.membership_id = ${memberships.id})`;
  const now = Date.now();
  const conditions = [
    eq(memberships.tenantId, tenantId),
    eq(memberships.status, "active"),
    eq(memberships.marketingOptIn, true),
    isNull(users.deletedAt),
    // Addresses that bounced or complained are never emailed again
    sql`not exists (select 1 from ${emailSuppressions} where ${emailSuppressions.email} = ${users.email})`,
  ];
  if (audience.lastVisit?.olderThanDays) {
    const cutoff = new Date(now - audience.lastVisit.olderThanDays * 86400000);
    conditions.push(sql`coalesce(${lastVisit}, ${memberships.joinedAt}) < ${cutoff}`);
  }
  if (audience.lastVisit?.withinDays) {
    const cutoff = new Date(now - audience.lastVisit.withinDays * 86400000);
    conditions.push(sql`${lastVisit} >= ${cutoff}`);
  }
  if (audience.minBalance !== undefined && audience.minBalance > 0) {
    conditions.push(gte(membershipBalances.balance, audience.minBalance));
  }

  // Location: where they joined, or anywhere they have earned (only this business's own locations count)
  if (audience.locationIds && audience.locationIds.length > 0) {
    const ids = sql.join(audience.locationIds.map((id) => sql`${id}::uuid`), sql`, `);
    conditions.push(
      sql`(${memberships.joinedLocationId} in (${ids}) or exists (select 1 from ledger_entries le where le.membership_id = ${memberships.id} and le.type = 'earn' and le.location_id in (${ids})))`
    );
  }

  // Earn activity: points earned from purchases in the last N days
  if (audience.minEarned) {
    const since = new Date(now - audience.minEarned.withinDays * 86400000).toISOString();
    conditions.push(
      sql`(select coalesce(sum(le.points_delta), 0) from ledger_entries le where le.membership_id = ${memberships.id} and le.type = 'earn' and le.reason_code is distinct from 'bonus' and le.occurred_at >= ${since}::timestamptz) >= ${audience.minEarned.points}`
    );
  }

  // Level: worked out from points earned in the level window, against the shop's current levels
  if (audience.tier) {
    const [row] = await db
      .select({ config: ruleVersions.config })
      .from(programmes)
      .innerJoin(ruleVersions, eq(ruleVersions.id, programmes.currentRuleVersionId))
      .where(eq(programmes.tenantId, tenantId))
      .limit(1);
    const rule = row ? ruleConfigSchema.parse(row.config) : null;
    const levels = rule?.tiers.enabled ? [...rule.tiers.levels].sort((a, b) => a.minPoints - b.minPoints) : [];
    if (levels.length === 0) {
      conditions.push(sql`false`); // the shop has no levels, so nobody is in one
    } else {
      const since = new Date();
      since.setMonth(since.getMonth() - rule!.tiers.qualificationMonths);
      const earned = sql`(select coalesce(sum(le.points_delta), 0) from ledger_entries le where le.membership_id = ${memberships.id} and le.type = 'earn' and le.reason_code is distinct from 'bonus' and le.occurred_at >= ${since.toISOString()}::timestamptz)`;
      if (audience.tier.toLowerCase() === "none") {
        conditions.push(sql`${earned} < ${levels[0].minPoints}`);
      } else {
        const index = levels.findIndex((l) => l.name.toLowerCase() === audience.tier!.toLowerCase());
        if (index === -1) conditions.push(sql`false`);
        else {
          conditions.push(sql`${earned} >= ${levels[index].minPoints}`);
          if (levels[index + 1]) conditions.push(sql`${earned} < ${levels[index + 1].minPoints}`);
        }
      }
    }
  }
  return db
    .select({ membershipId: memberships.id, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(membershipBalances, eq(membershipBalances.membershipId, memberships.id))
    .where(and(...conditions));
}

export async function previewAudience(ctx: RequestContext, audience: unknown) {
  assertCan(ctx, "campaign.manage");
  const parsed = audienceSchema.parse(audience ?? {});
  const rows = await audienceRows(ctx.tenantId!, parsed);
  const [all] = await db
    .select({ count: count() })
    .from(memberships)
    .where(and(eq(memberships.tenantId, ctx.tenantId!), eq(memberships.status, "active")));
  return { recipients: rows.length, totalCustomers: Number(all?.count ?? 0) };
}

/** Queues the emails for one campaign (who is chosen now, so opt-outs up to this moment count) and sends them. */
async function dispatchCampaign(campaignId: string, from: "scheduled" | "sending" = "scheduled") {
  // Claim it first, so two runs at once can never send the same offer twice. An offer sent right now is
  // created already "sending", so the scheduled-offers run can't pick it up halfway through.
  const [claimed] = await db
    .update(campaigns)
    .set({ status: "sending" })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.status, from)))
    .returning();
  if (!claimed) return null;

  let rows = await audienceRows(claimed.tenantId, claimed.audience as Audience);
  if (claimed.maxRecipients && rows.length > claimed.maxRecipients) rows = rows.slice(0, claimed.maxRecipients);

  const [tenant] = await db.select({ name: tenants.name, slug: tenants.slug }).from(tenants).where(eq(tenants.id, claimed.tenantId)).limit(1);
  const ids: string[] = [];
  for (const r of rows) {
    const entry = await queueEmail({
      toEmail: r.email,
      template: "campaign",
      kind: "marketing",
      tenantId: claimed.tenantId,
      payload: {
        campaignId: claimed.id,
        subject: claimed.subject,
        body: claimed.body,
        businessName: tenant?.name,
        hubUrl: `${env.APP_URL}/b/${tenant?.slug}`,
        unsubscribeUrl: marketingOptOutUrl(r.membershipId, claimed.id),
        unsubscribeLabel: "Stop offers from this shop",
      },
    });
    ids.push(entry.id);
  }

  const [sent] = await db
    .update(campaigns)
    .set({ status: "sent", sentAt: new Date(), recipientCount: rows.length })
    .where(eq(campaigns.id, claimed.id))
    .returning();

  await emitEvent(claimed.tenantId, "campaign.sent", { campaignId: claimed.id, recipients: rows.length });

  // Send after the response; anything left over goes out with the next outbox run
  const deliver = async () => {
    for (let i = 0; i < ids.length; i += 25) {
      try {
        await processOutbox(25, { ids: ids.slice(i, i + 25) });
      } catch (err) {
        logger.warn({ err, campaignId: claimed.id }, "Campaign batch failed; the outbox will retry");
      }
    }
  };
  try {
    after(deliver);
  } catch {
    // Outside a request (tests, cron): send now
    await deliver();
  }
  return sent;
}

export async function sendCampaign(ctx: RequestContext, input: unknown) {
  assertCan(ctx, "campaign.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");
  const { subject, body, audience, sendAt, maxRecipients } = campaignSchema.parse(input);
  await assertGrowthAllowed(ctx.tenantId, "Sending offers");

  const when = sendAt ? new Date(sendAt) : null;
  const later = Boolean(when && when.getTime() > Date.now() + 60_000);
  if (later && when!.getTime() > Date.now() + 60 * 86400_000) throw new Error("Pick a time within the next 60 days.");

  // A simple sending limit so customers aren't flooded (FR-090 "limits"); cancelled offers don't count
  const [recent] = await db
    .select({ count: count() })
    .from(campaigns)
    .where(and(eq(campaigns.tenantId, ctx.tenantId), gte(campaigns.createdAt, new Date(Date.now() - 86400000)), ne(campaigns.status, "cancelled")));
  if (Number(recent?.count ?? 0) >= MAX_CAMPAIGNS_PER_DAY) {
    throw new Error(`You can send up to ${MAX_CAMPAIGNS_PER_DAY} offers a day. Try again tomorrow.`);
  }

  const rows = await audienceRows(ctx.tenantId, audience);
  if (rows.length === 0) throw new Error("Nobody matches these filters yet. Widen them and try again.");

  const [campaign] = await db
    .insert(campaigns)
    .values({
      tenantId: ctx.tenantId,
      subject,
      body,
      audience,
      status: later ? "scheduled" : "sending",
      scheduledAt: later ? when : new Date(),
      maxRecipients: maxRecipients ?? null,
      recipientCount: Math.min(rows.length, maxRecipients ?? rows.length),
      createdBy: ctx.userId,
    })
    .returning();

  await logAuditEvent(ctx, {
    action: later ? "campaign.scheduled" : "campaign.sent",
    targetType: "campaign",
    targetId: campaign.id,
    metadata: { recipients: campaign.recipientCount, audience, sendAt: later ? when!.toISOString() : null, maxRecipients: maxRecipients ?? null },
  });

  if (later) return campaign;
  return (await dispatchCampaign(campaign.id, "sending")) ?? campaign;
}

/** Sends every scheduled offer whose time has come. Safe to call often; each offer goes out once. */
export async function runDueCampaigns(now = new Date()) {
  const due = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.status, "scheduled"), lte(campaigns.scheduledAt, now)))
    .limit(20);
  let sent = 0;
  for (const c of due) {
    try {
      if (await dispatchCampaign(c.id)) sent++;
    } catch (err) {
      logger.error({ err, campaignId: c.id }, "Scheduled campaign failed");
    }
  }
  return { sent };
}

/** Stops an offer that has not gone out yet. */
export async function cancelCampaign(ctx: RequestContext, id: string) {
  assertCan(ctx, "campaign.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");
  const [row] = await db
    .update(campaigns)
    .set({ status: "cancelled" })
    .where(and(eq(campaigns.id, id), eq(campaigns.tenantId, ctx.tenantId), eq(campaigns.status, "scheduled")))
    .returning();
  if (!row) throw new Error("That offer has already gone out, or doesn't exist.");
  await logAuditEvent(ctx, { action: "campaign.cancelled", targetType: "campaign", targetId: id });
  return { cancelled: true };
}

/** Sent campaigns with delivery counts from the outbox (FR-094). */
export async function listCampaigns(ctx: RequestContext) {
  assertCan(ctx, "campaign.manage");
  // Opening the list is a good moment to send anything that has come due
  await runDueCampaigns().catch(() => undefined);
  const list = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.tenantId, ctx.tenantId!))
    .orderBy(desc(campaigns.createdAt))
    .limit(30);
  if (list.length === 0) return [];
  const stats = await db
    .select({
      campaignId: sql<string>`${emailOutbox.payload}->>'campaignId'`,
      status: emailOutbox.status,
      count: count(),
    })
    .from(emailOutbox)
    .where(and(eq(emailOutbox.tenantId, ctx.tenantId!), eq(emailOutbox.template, "campaign")))
    .groupBy(sql`${emailOutbox.payload}->>'campaignId'`, emailOutbox.status);
  const events = await campaignEventCounts(list.map((c) => c.id));
  return list.map((c) => {
    const mine = stats.filter((s) => s.campaignId === c.id);
    const n = (status: string) => Number(mine.find((s) => s.status === status)?.count ?? 0);
    const e = events.get(c.id) ?? { clicks: 0, bounces: 0, complaints: 0, optOuts: 0 };
    return { ...c, delivered: n("sent"), waiting: n("queued"), failed: n("failed") + n("dead"), ...e };
  });
}

/** The "Stop offers" link: switches off marketing for this card and records the withdrawal. */
export async function stopOffersByLink(membershipId: string, token: string, campaignId?: string) {
  const expected = Buffer.from(marketingOptOutToken(membershipId));
  const given = Buffer.from(token || "");
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    throw new Error("This link isn't valid. Change your email settings from your account instead.");
  }
  const [before] = await db.select({ was: memberships.marketingOptIn }).from(memberships).where(eq(memberships.id, membershipId)).limit(1);
  const [row] = await db
    .update(memberships)
    .set({ marketingOptIn: false })
    .where(eq(memberships.id, membershipId))
    .returning({ tenantId: memberships.tenantId });
  if (!row) throw new Error("This card no longer exists.");
  await db.insert(consentRecords).values({
    tenantId: row.tenantId,
    membershipId,
    purpose: "marketing_email",
    granted: false,
    textVersion: "1.0",
    source: "email_unsubscribe_link",
  });
  await emitEvent(row.tenantId, "consent.withdrawn", { membershipId, purpose: "marketing_email", source: "email_unsubscribe_link" });
  // Count it against the offer the link came from, if that offer is really this shop's
  if (campaignId && before?.was) {
    const [c] = await db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.tenantId, row.tenantId))).limit(1);
    if (c) await recordEmailEvent({ type: "optout", tenantId: row.tenantId, campaignId: c.id, outboxId: null });
  }
  const [t] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, row.tenantId)).limit(1);
  return { businessName: t?.name ?? "this shop", on: false };
}
