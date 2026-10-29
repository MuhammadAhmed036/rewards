import crypto from "crypto";
import { after } from "next/server";
import { z } from "zod";
import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { campaigns, consentRecords, emailOutbox, membershipBalances, memberships, tenants, users } from "../db/schema";
import { RequestContext, assertCan } from "../security/permissions";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "./audit";
import { processOutbox, queueEmail } from "./email";

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
});
export type Audience = z.infer<typeof audienceSchema>;

export const campaignSchema = z.object({
  subject: z.string().trim().min(3, "Write a subject line").max(150),
  body: z.string().trim().min(10, "Write a short message (at least 10 characters)").max(3000),
  audience: audienceSchema.default({}),
});

const MAX_CAMPAIGNS_PER_DAY = 3;

export function marketingOptOutToken(membershipId: string) {
  return crypto.createHmac("sha256", env.AUTH_SECRET).update(`mkt:${membershipId}`).digest("hex").slice(0, 32);
}
export function marketingOptOutUrl(membershipId: string) {
  return `${env.APP_URL}/unsubscribe?kind=offers&m=${membershipId}&t=${marketingOptOutToken(membershipId)}`;
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

export async function sendCampaign(ctx: RequestContext, input: unknown) {
  assertCan(ctx, "campaign.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");
  const { subject, body, audience } = campaignSchema.parse(input);

  // A simple sending limit so customers aren't flooded (FR-090 "limits")
  const [recent] = await db
    .select({ count: count() })
    .from(campaigns)
    .where(and(eq(campaigns.tenantId, ctx.tenantId), gte(campaigns.createdAt, new Date(Date.now() - 86400000))));
  if (Number(recent?.count ?? 0) >= MAX_CAMPAIGNS_PER_DAY) {
    throw new Error(`You can send up to ${MAX_CAMPAIGNS_PER_DAY} offers a day. Try again tomorrow.`);
  }

  const rows = await audienceRows(ctx.tenantId, audience);
  if (rows.length === 0) throw new Error("Nobody matches these filters yet. Widen them and try again.");

  const [tenant] = await db.select({ name: tenants.name, slug: tenants.slug }).from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
  const [campaign] = await db
    .insert(campaigns)
    .values({ tenantId: ctx.tenantId, subject, body, audience, recipientCount: rows.length, createdBy: ctx.userId, sentAt: new Date() })
    .returning();

  const ids: string[] = [];
  for (const r of rows) {
    const entry = await queueEmail({
      toEmail: r.email,
      template: "campaign",
      kind: "marketing",
      tenantId: ctx.tenantId,
      payload: {
        campaignId: campaign.id,
        subject,
        body,
        businessName: tenant?.name,
        hubUrl: `${env.APP_URL}/b/${tenant?.slug}`,
        unsubscribeUrl: marketingOptOutUrl(r.membershipId),
        unsubscribeLabel: "Stop offers from this shop",
      },
    });
    ids.push(entry.id);
  }

  // Send after the response; anything left over goes out with the daily outbox run
  try {
    after(async () => {
      for (let i = 0; i < ids.length; i += 25) {
        try {
          await processOutbox(25, { ids: ids.slice(i, i + 25) });
        } catch (err) {
          logger.warn({ err, campaignId: campaign.id }, "Campaign batch failed; the outbox will retry");
        }
      }
    });
  } catch {
    // Outside a request (tests): the outbox cron delivers them
  }

  await logAuditEvent(ctx, {
    action: "campaign.sent",
    targetType: "campaign",
    targetId: campaign.id,
    metadata: { recipients: rows.length, audience },
  });
  return campaign;
}

/** Sent campaigns with delivery counts from the outbox (FR-094). */
export async function listCampaigns(ctx: RequestContext) {
  assertCan(ctx, "campaign.manage");
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
  return list.map((c) => {
    const mine = stats.filter((s) => s.campaignId === c.id);
    const n = (status: string) => Number(mine.find((s) => s.status === status)?.count ?? 0);
    return { ...c, delivered: n("sent"), waiting: n("queued"), failed: n("failed") + n("dead") };
  });
}

/** The "Stop offers" link: switches off marketing for this card and records the withdrawal. */
export async function stopOffersByLink(membershipId: string, token: string) {
  const expected = Buffer.from(marketingOptOutToken(membershipId));
  const given = Buffer.from(token || "");
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    throw new Error("This link isn't valid. Change your email settings from your account instead.");
  }
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
  const [t] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, row.tenantId)).limit(1);
  return { businessName: t?.name ?? "this shop", on: false };
}
