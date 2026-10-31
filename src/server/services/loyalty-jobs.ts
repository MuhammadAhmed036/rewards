import { and, eq, gt, sql } from "drizzle-orm";
import { emitEvent } from "./events";
import { db } from "../db";
import { emailOutbox, ledgerEntries, membershipBalances, memberships, programmes, ruleVersions, tenants, users } from "../db/schema";
import { ruleConfigSchema, type RuleConfig } from "@/lib/points";
import { logger } from "@/lib/logger";
import { notifyRewardsUnlocked, unsubscribeUrl } from "./notifications";
import { queueEmail } from "./email";
import { env } from "@/lib/env";

/**
 * Points that don't come from a purchase: welcome and birthday bonuses (FR-027), and expiry of
 * points after a long time without a visit (FR-028). Every change is a normal ledger entry.
 */

async function currentRule(tenantId: string): Promise<RuleConfig | null> {
  const [row] = await db
    .select({ config: ruleVersions.config, status: programmes.status })
    .from(programmes)
    .innerJoin(ruleVersions, eq(ruleVersions.id, programmes.currentRuleVersionId))
    .where(eq(programmes.tenantId, tenantId))
    .limit(1);
  if (!row || row.status !== "published") return null;
  return ruleConfigSchema.parse(row.config);
}

/** Adds bonus points once per idempotency key; returns the new balance, or null if it was already given. */
export async function grantBonus(tenantId: string, membershipId: string, points: number, note: string, idempotencyKey: string) {
  if (points <= 0) return null;
  const result = await db.transaction(async (tx) => {
    const [done] = await tx
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.tenantId, tenantId), eq(ledgerEntries.idempotencyKey, idempotencyKey)))
      .limit(1);
    if (done) return null;
    const [bal] = await tx
      .select()
      .from(membershipBalances)
      .where(and(eq(membershipBalances.membershipId, membershipId), eq(membershipBalances.tenantId, tenantId)))
      .for("update");
    if (!bal) return null;
    await tx.insert(ledgerEntries).values({
      tenantId,
      membershipId,
      type: "earn",
      pointsDelta: points,
      reasonCode: "bonus",
      note,
      idempotencyKey,
    });
    const newBalance = bal.balance + points;
    await tx
      .update(membershipBalances)
      .set({ balance: newBalance, lifetimeEarned: bal.lifetimeEarned + points, updatedAt: new Date() })
      .where(eq(membershipBalances.membershipId, membershipId));
    return { before: bal.balance, newBalance };
  });
  if (result) await notifyRewardsUnlocked(membershipId, tenantId, result.before, result.newBalance);
  return result?.newBalance ?? null;
}

/** Called when someone joins: gives the shop's welcome bonus, if it has one. */
export async function grantWelcomeBonus(tenantId: string, membershipId: string) {
  try {
    const rule = await currentRule(tenantId);
    if (!rule?.bonuses.welcomePoints) return null;
    return await grantBonus(tenantId, membershipId, rule.bonuses.welcomePoints, "Welcome bonus", `welcome-${membershipId}`);
  } catch (err) {
    logger.error({ err, membershipId }, "Welcome bonus failed");
    return null;
  }
}

/**
 * Pays the referral bonus to a new customer and the friend who invited them, once the newcomer's first
 * purchase has been recorded (not just on joining, so empty sign-ups earn nothing). Each side is paid
 * at most once, and a friend is only rewarded up to the shop's limit.
 */
export async function grantReferralBonuses(tenantId: string, refereeMembershipId: string) {
  try {
    const [referee] = await db
      .select({ referrerId: memberships.referredByMembershipId })
      .from(memberships)
      .where(and(eq(memberships.id, refereeMembershipId), eq(memberships.tenantId, tenantId)))
      .limit(1);
    if (!referee?.referrerId) return null;
    const rule = await currentRule(tenantId);
    const points = rule?.bonuses.referralPoints ?? 0;
    if (!rule || points <= 0) return null;

    const [referrer] = await db
      .select({ id: memberships.id, status: memberships.status })
      .from(memberships)
      .where(and(eq(memberships.id, referee.referrerId), eq(memberships.tenantId, tenantId)))
      .limit(1);
    if (!referrer || referrer.status !== "active") return null;

    const [already] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.membershipId, referrer.id), sql`${ledgerEntries.idempotencyKey} like 'referral-from-%'`));
    const alreadyPaidThisOne = await db
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.tenantId, tenantId), eq(ledgerEntries.idempotencyKey, `referral-from-${refereeMembershipId}`)))
      .limit(1);
    if (alreadyPaidThisOne.length === 0 && (already?.n ?? 0) >= rule.bonuses.maxReferralsPerMember) return null;

    await grantBonus(tenantId, referrer.id, points, "Thanks for inviting a friend", `referral-from-${refereeMembershipId}`);
    await grantBonus(tenantId, refereeMembershipId, points, "Welcome gift from a friend", `referral-${refereeMembershipId}`);
    return { points };
  } catch (err) {
    logger.error({ err, refereeMembershipId }, "Referral bonus failed");
    return null;
  }
}

function todayIn(timezone: string, now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Removes the whole balance of a card that's had no activity for the shop's expiry period. */
async function expireBalance(tenantId: string, membershipId: string, lastActivity: Date) {
  const removed = await db.transaction(async (tx) => {
    const key = `expire-${membershipId}-${lastActivity.toISOString()}`;
    const [done] = await tx
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.tenantId, tenantId), eq(ledgerEntries.idempotencyKey, key)))
      .limit(1);
    if (done) return 0;
    const [bal] = await tx.select().from(membershipBalances).where(eq(membershipBalances.membershipId, membershipId)).for("update");
    if (!bal || bal.balance <= 0) return 0;
    await tx.insert(ledgerEntries).values({
      tenantId,
      membershipId,
      type: "expire",
      pointsDelta: -bal.balance,
      reasonCode: "inactivity",
      note: "Points expired after a long time without a visit",
      idempotencyKey: key,
    });
    await tx.update(membershipBalances).set({ balance: 0, updatedAt: new Date() }).where(eq(membershipBalances.membershipId, membershipId));
    return bal.balance;
  });
  if (removed > 0) await emitEvent(tenantId, "points.expired", { membershipId, points: removed });
  return removed;
}

/**
 * Customers who agreed to offers and haven't had any points activity for `days` days get one friendly email.
 * Each quiet spell is emailed once: the next one only counts after they come back and go quiet again.
 */
async function sendInactivityEmails(tenantId: string, businessName: string, slug: string, days: number, now: Date) {
  const cutoff = new Date(now.getTime() - days * 86400000);
  const lastActivity = sql<Date>`coalesce((select max(le.occurred_at) from ledger_entries le where le.membership_id = ${memberships.id} and le.type <> 'expire'), ${memberships.joinedAt})`;
  const quiet = await db
    .select({ membershipId: memberships.id, email: users.email, last: lastActivity })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.tenantId, tenantId),
        eq(memberships.status, "active"),
        eq(memberships.marketingOptIn, true),
        sql`${users.deletedAt} is null`,
        sql`${lastActivity} < ${cutoff.toISOString()}::timestamptz`,
        sql`not exists (select 1 from email_suppressions s where s.email = ${users.email})`
      )
    )
    .limit(500);

  let sent = 0;
  const { marketingOptOutUrl } = await import("./campaigns");
  for (const q of quiet) {
    // One email per quiet spell: the key names the last visit it follows
    const key = `inactivity-${q.membershipId}-${new Date(q.last).toISOString().slice(0, 10)}`;
    const [done] = await db
      .select({ id: emailOutbox.id })
      .from(emailOutbox)
      .where(and(eq(emailOutbox.template, "campaign"), sql`${emailOutbox.payload}->>'journey' = ${key}`))
      .limit(1);
    if (done) continue;
    await queueEmail({
      toEmail: q.email,
      template: "campaign",
      kind: "marketing",
      tenantId,
      payload: {
        journey: key,
        subject: `We miss you at ${businessName}`,
        body: `It's been a little while since your last visit to ${businessName}. Your card is ready and your rewards are waiting. Come in and see us soon.`,
        businessName,
        hubUrl: `${env.APP_URL}/b/${slug}`,
        unsubscribeUrl: marketingOptOutUrl(q.membershipId),
        unsubscribeLabel: "Stop offers from this shop",
      },
    });
    sent++;
  }
  return sent;
}

/** Daily job: birthday bonuses, expiry warnings and expiry, for every live programme. */
export async function runDailyLoyaltyJobs(now = new Date()) {
  const summary = { birthdayBonuses: 0, expiryWarnings: 0, expiredCards: 0, pointsExpired: 0, inactivityEmails: 0 };
  const live = await db
    .select({ tenantId: tenants.id, timezone: tenants.timezone, name: tenants.name, slug: tenants.slug, type: programmes.type, config: ruleVersions.config })
    .from(tenants)
    .innerJoin(programmes, and(eq(programmes.tenantId, tenants.id), eq(programmes.status, "published")))
    .innerJoin(ruleVersions, eq(ruleVersions.id, programmes.currentRuleVersionId))
    .where(eq(tenants.status, "active"));

  for (const shop of live) {
    const rule = ruleConfigSchema.parse(shop.config);
    const unit = shop.type === "stamps" ? "stamps" : "points";

    // Birthday bonus, once a year, on the customer's birthday in the shop's time zone
    if (rule.bonuses.birthdayPoints > 0) {
      const today = todayIn(shop.timezone || "Europe/London", now);
      const birthdays = await db
        .select({ membershipId: memberships.id })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(memberships.tenantId, shop.tenantId),
            eq(memberships.status, "active"),
            eq(users.birthMonth, today.month),
            eq(users.birthDay, today.day)
          )
        );
      for (const b of birthdays) {
        const given = await grantBonus(shop.tenantId, b.membershipId, rule.bonuses.birthdayPoints, "Happy birthday bonus", `birthday-${b.membershipId}-${today.year}`);
        if (given !== null) summary.birthdayBonuses++;
      }
    }

    // Automatic "we miss you" email, once for each quiet spell (FR-092). Offers need the customer's yes.
    if (rule.journeys.inactivityDays > 0) {
      summary.inactivityEmails += await sendInactivityEmails(shop.tenantId, shop.name, shop.slug, rule.journeys.inactivityDays, now);
    }

    if (!rule.expiry.enabled) continue;
    const lastActivity = sql<Date>`(select max(le.occurred_at) from ledger_entries le where le.membership_id = ${memberships.id} and le.type <> 'expire')`;
    const cards = await db
      .select({
        membershipId: memberships.id,
        balance: membershipBalances.balance,
        lastActivity: sql<Date>`coalesce(${lastActivity}, ${memberships.joinedAt})`,
        email: users.email,
        emailNotifications: memberships.emailNotifications,
      })
      .from(memberships)
      .innerJoin(membershipBalances, eq(membershipBalances.membershipId, memberships.id))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.tenantId, shop.tenantId), gt(membershipBalances.balance, 0)));

    for (const card of cards) {
      const last = new Date(card.lastActivity);
      const expiresAt = new Date(last);
      expiresAt.setMonth(expiresAt.getMonth() + rule.expiry.months);

      if (expiresAt <= now) {
        const removed = await expireBalance(shop.tenantId, card.membershipId, last);
        if (removed > 0) {
          summary.expiredCards++;
          summary.pointsExpired += removed;
        }
        continue;
      }

      // One warning per expiry date, sent within the warning window
      const warnFrom = new Date(expiresAt.getTime() - rule.expiry.warnDays * 86400000);
      if (now >= warnFrom && card.emailNotifications && !card.email.endsWith("@anonymised.local")) {
        const expiresOn = expiresAt.toISOString().slice(0, 10);
        const [already] = await db
          .select({ id: emailOutbox.id })
          .from(emailOutbox)
          .where(
            and(
              eq(emailOutbox.template, "points_expiring"),
              sql`${emailOutbox.payload}->>'membershipId' = ${card.membershipId}`,
              sql`${emailOutbox.payload}->>'expiresOn' = ${expiresOn}`
            )
          )
          .limit(1);
        if (!already) {
          await queueEmail({
            toEmail: card.email,
            template: "points_expiring",
            tenantId: shop.tenantId,
            payload: {
              membershipId: card.membershipId,
              expiresOn,
              balance: card.balance,
              unit,
              businessName: shop.name,
              hubUrl: `${env.APP_URL}/b/${shop.slug}`,
              unsubscribeUrl: unsubscribeUrl(card.membershipId),
            },
          });
          summary.expiryWarnings++;
        }
      }
    }
  }
  return summary;
}
