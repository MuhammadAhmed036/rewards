import crypto from "crypto";
import { after } from "next/server";
import { and, eq, gt, lte } from "drizzle-orm";
import { db } from "../db";
import { memberships, programmes, rewards, ruleVersions, tenants, users } from "../db/schema";
import { describeRule, ruleConfigSchema } from "@/lib/points";
import { currencySymbol } from "@/lib/money";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { processOutbox, queueEmail, type EmailTemplate } from "./email";

/**
 * Service emails about a customer's card (FR-092, FR-093). They are transactional rather than
 * marketing, but every one carries a one-click link to switch them off for that shop (UC-16).
 */

export function unsubscribeToken(membershipId: string) {
  return crypto.createHmac("sha256", env.AUTH_SECRET).update(`notify:${membershipId}`).digest("hex").slice(0, 32);
}

export function unsubscribeUrl(membershipId: string) {
  return `${env.APP_URL}/unsubscribe?m=${membershipId}&t=${unsubscribeToken(membershipId)}`;
}

function tokenMatches(membershipId: string, token: string) {
  const expected = Buffer.from(unsubscribeToken(membershipId));
  const given = Buffer.from(token || "");
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/** Send queued emails once the response has gone out, so staff at the till don't wait for the mail server. */
function flushSoon(emailId: string) {
  try {
    after(async () => {
      try {
        await processOutbox(1, { ids: [emailId] });
      } catch (err) {
        logger.warn({ err }, "Outbox flush after response failed; the cron will retry");
      }
    });
  } catch {
    // Outside a request (tests, scripts): the outbox cron sends it later.
  }
}

async function recipient(membershipId: string) {
  const [row] = await db
    .select({
      email: users.email,
      deletedAt: users.deletedAt,
      status: memberships.status,
      memberNumber: memberships.memberNumber,
      emailNotifications: memberships.emailNotifications,
      tenantId: tenants.id,
      businessName: tenants.name,
      slug: tenants.slug,
      programmeType: programmes.type,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
    .leftJoin(programmes, eq(programmes.tenantId, memberships.tenantId))
    .where(eq(memberships.id, membershipId))
    .limit(1);
  // Anonymised accounts and switched-off cards get nothing (suppression is recorded in the log)
  if (!row || row.deletedAt || row.status === "deleted" || row.email.endsWith("@anonymised.local")) return null;
  if (!row.emailNotifications) {
    logger.info({ membershipId }, "Card email suppressed: customer switched notifications off");
    return null;
  }
  return { ...row, unit: row.programmeType === "stamps" ? "stamps" : "points", hubUrl: `${env.APP_URL}/b/${row.slug}` };
}

async function send(membershipId: string, template: EmailTemplate, extra: (r: NonNullable<Awaited<ReturnType<typeof recipient>>>) => Record<string, unknown>) {
  try {
    const r = await recipient(membershipId);
    if (!r) return false;
    const entry = await queueEmail({
      toEmail: r.email,
      template,
      tenantId: r.tenantId,
      kind: "transactional",
      payload: {
        businessName: r.businessName,
        hubUrl: r.hubUrl,
        unit: r.unit,
        unsubscribeUrl: unsubscribeUrl(membershipId),
        ...extra(r),
      },
    });
    flushSoon(entry.id);
    return true;
  } catch (err) {
    // An email problem must never undo or block points that were already saved
    logger.error({ err, membershipId, template }, "Couldn't queue card email");
    return false;
  }
}

export async function notifyWelcome(membershipId: string) {
  let earningRule: string | null = null;
  try {
    const [row] = await db
      .select({ config: ruleVersions.config, type: programmes.type, currency: tenants.currency })
      .from(memberships)
      .innerJoin(programmes, eq(programmes.tenantId, memberships.tenantId))
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .innerJoin(ruleVersions, eq(ruleVersions.id, programmes.currentRuleVersionId))
      .where(eq(memberships.id, membershipId))
      .limit(1);
    if (row) {
      earningRule = describeRule(ruleConfigSchema.parse(row.config), row.type === "stamps" ? "stamps" : "points", currencySymbol(row.currency || "GBP"));
    }
  } catch {
    // The welcome email still goes without the rule line
  }
  return send(membershipId, "welcome", (r) => ({ memberNumber: r.memberNumber, earningRule }));
}

/** After points go up, tell the customer about the best reward they've just become able to claim. */
export async function notifyRewardsUnlocked(membershipId: string, tenantId: string, before: number, after: number) {
  if (after <= before) return false;
  const now = new Date();
  const crossed = await db
    .select({ title: rewards.title, costPoints: rewards.costPoints, startsAt: rewards.startsAt, endsAt: rewards.endsAt })
    .from(rewards)
    .where(and(eq(rewards.tenantId, tenantId), eq(rewards.status, "active"), gt(rewards.costPoints, before), lte(rewards.costPoints, after)));
  const live = crossed
    .filter((r) => (!r.startsAt || r.startsAt <= now) && (!r.endsAt || r.endsAt > now))
    .sort((a, b) => b.costPoints - a.costPoints);
  if (live.length === 0) return false;
  return send(membershipId, "reward_unlocked", () => ({ rewardTitle: live[0].title, balance: after }));
}

export function notifyRedemption(membershipId: string, rewardTitle: string, costPoints: number, newBalance: number) {
  return send(membershipId, "redemption_receipt", () => ({ rewardTitle, costPoints, newBalance }));
}

/** One-click switch from the email footer; the signed token proves the link came from us. */
export async function setCardEmailsByLink(membershipId: string, token: string, on: boolean) {
  if (!tokenMatches(membershipId, token)) throw new Error("This link isn't valid. Change your email settings from your account instead.");
  const [row] = await db
    .update(memberships)
    .set({ emailNotifications: on })
    .where(eq(memberships.id, membershipId))
    .returning({ tenantId: memberships.tenantId });
  if (!row) throw new Error("This card no longer exists.");
  const [t] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, row.tenantId)).limit(1);
  return { businessName: t?.name ?? "this shop", on };
}
