import { db } from "../db";
import {
  users,
  memberships,
  tenants,
  membershipBalances,
  consentRecords,
  ledgerEntries,
  linkClickEvents,
  feedbackMessages,
  auditEvents,
} from "../db/schema";
import { invalidateUserSessions, purgeExpiredSessions } from "../auth";
import { logAuditEvent } from "./audit";
import { logoRefSql, resolveLogoUrl } from "./business-logo";
import { and, eq, desc, lt } from "drizzle-orm";
import crypto from "crypto";

export async function getCustomerPrivacyData(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
      birthMonth: users.birthMonth,
      birthDay: users.birthDay,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new Error("User not found");
  }

  // Fetch all memberships across all businesses
  const membershipRows = await db
    .select({
      id: memberships.id,
      tenantId: memberships.tenantId,
      memberNumber: memberships.memberNumber,
      status: memberships.status,
      marketingOptIn: memberships.marketingOptIn,
      emailNotifications: memberships.emailNotifications,
      joinedAt: memberships.joinedAt,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      brandPrimaryHex: tenants.brandPrimaryHex,
      logoRef: logoRefSql,
      balance: membershipBalances.balance,
      lifetimeEarned: membershipBalances.lifetimeEarned,
      lifetimeRedeemed: membershipBalances.lifetimeRedeemed,
    })
    .from(memberships)
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .leftJoin(membershipBalances, eq(memberships.id, membershipBalances.membershipId))
    .where(eq(memberships.userId, userId))
    .orderBy(desc(memberships.joinedAt));

  // Fetch consent records for all these memberships
  const membershipIds = membershipRows.map((m) => m.id);
  const consents = [];

  for (const mId of membershipIds) {
    const cRows = await db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.membershipId, mId))
      .orderBy(desc(consentRecords.createdAt));
    consents.push(...cRows);
  }

  return {
    user,
    memberships: membershipRows.map(({ logoRef, ...m }) => ({
      ...m,
      logoUrl: resolveLogoUrl(m.tenantId, logoRef),
    })),
    consents,
  };
}

/** A customer switches service emails about one card on or off from their account (FR-055). */
export async function updateCardEmails(userId: string, membershipId: string, on: boolean) {
  const [updated] = await db
    .update(memberships)
    .set({ emailNotifications: on })
    .where(and(eq(memberships.id, membershipId), eq(memberships.userId, userId)))
    .returning();
  if (!updated) throw new Error("Membership not found or unauthorized");
  return updated;
}

export async function updateMarketingConsent(
  userId: string,
  input: {
    membershipId: string;
    granted: boolean;
    source?: string;
  }
) {
  return await db.transaction(async (tx) => {
    const [membership] = await tx
      .select()
      .from(memberships)
      .where(eq(memberships.id, input.membershipId))
      .limit(1);

    if (!membership || membership.userId !== userId) {
      throw new Error("Membership not found or unauthorized");
    }

    // 1. Update membership marketingOptIn flag
    const [updated] = await tx
      .update(memberships)
      .set({
        marketingOptIn: input.granted,
      })
      .where(eq(memberships.id, input.membershipId))
      .returning();

    // 2. Insert new consent record recording grant or withdrawal
    await tx.insert(consentRecords).values({
      tenantId: membership.tenantId,
      membershipId: membership.id,
      purpose: "marketing_email",
      granted: input.granted,
      textVersion: "1.0",
      source: input.source || "me_privacy_centre",
      createdAt: new Date(),
    });

    return updated;
  });
}

export async function exportUserDataJson(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw new Error("User not found");

  const membershipRows = await db
    .select({
      id: memberships.id,
      memberNumber: memberships.memberNumber,
      status: memberships.status,
      joinedAt: memberships.joinedAt,
      marketingOptIn: memberships.marketingOptIn,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      balance: membershipBalances.balance,
      lifetimeEarned: membershipBalances.lifetimeEarned,
      lifetimeRedeemed: membershipBalances.lifetimeRedeemed,
    })
    .from(memberships)
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .leftJoin(membershipBalances, eq(memberships.id, membershipBalances.membershipId))
    .where(eq(memberships.userId, userId));

  const exportData: Record<string, unknown> = {
    exportDate: new Date().toISOString(),
    regulations: "UK GDPR Article 15 / Data Protection Act 2018",
    profile: user,
    memberships: [],
  };

  for (const m of membershipRows) {
    const history = await db
      .select({
        id: ledgerEntries.id,
        occurredAt: ledgerEntries.occurredAt,
        type: ledgerEntries.type,
        pointsDelta: ledgerEntries.pointsDelta,
        basisAmountMinor: ledgerEntries.basisAmountMinor,
        reasonCode: ledgerEntries.reasonCode,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.membershipId, m.id))
      .orderBy(desc(ledgerEntries.occurredAt));

    const consents = await db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.membershipId, m.id))
      .orderBy(desc(consentRecords.createdAt));

    (exportData.memberships as Array<unknown>).push({
      ...m,
      transactionHistory: history,
      consentRecords: consents,
    });
  }

  return exportData;
}

export async function deleteAndAnonymiseAccount(userId: string) {
  return await db.transaction(async (tx) => {
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) throw new Error("User not found");

    const anonymisedId = crypto.randomUUID().slice(0, 8);
    const anonymisedEmail = `deleted-${anonymisedId}@anonymised.local`;

    // Anonymise personal fields
    await tx
      .update(users)
      .set({
        name: "Anonymised Customer",
        email: anonymisedEmail,
        passwordHash: null,
        image: null,
        birthMonth: null,
        birthDay: null,
        deletedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Update memberships to deleted and revoke marketing opt-in
    await tx
      .update(memberships)
      .set({
        status: "deleted",
        marketingOptIn: false,
      })
      .where(eq(memberships.userId, userId));

    // Invalidate sessions immediately
    await invalidateUserSessions(userId);

    await logAuditEvent(
      { userId, role: "customer", requestId: crypto.randomUUID() },
      {
        action: "privacy.account_anonymised",
        targetType: "user",
        targetId: userId,
        reason: "Right to erasure / Account deletion request",
      },
      tx
    );

    return { success: true, message: "Account data anonymised and sessions invalidated" };
  });
}

export async function runRetentionCleanup() {
  const now = Date.now();
  const thirteenMonthsAgo = new Date(now - 13 * 30 * 24 * 60 * 60 * 1000);
  const twentyFourMonthsAgo = new Date(now - 24 * 30 * 24 * 60 * 60 * 1000);

  // 1. Retention: link click events older than 13 months
  const deletedClicks = await db
    .delete(linkClickEvents)
    .where(lt(linkClickEvents.clickedAt, thirteenMonthsAgo))
    .returning({ id: linkClickEvents.id });

  // 2. Retention: feedback messages older than 24 months
  const deletedFeedback = await db
    .delete(feedbackMessages)
    .where(lt(feedbackMessages.createdAt, twentyFourMonthsAgo))
    .returning({ id: feedbackMessages.id });

  // 3. Retention: audit events older than 24 months
  const deletedAudit = await db
    .delete(auditEvents)
    .where(lt(auditEvents.createdAt, twentyFourMonthsAgo))
    .returning({ id: auditEvents.id });

  // 4. Expired sign-in sessions (idle timeout passed, or staff/admin absolute limit reached)
  const deletedSessionsCount = await purgeExpiredSessions();

  return {
    deletedClicksCount: deletedClicks.length,
    deletedFeedbackCount: deletedFeedback.length,
    deletedAuditCount: deletedAudit.length,
    deletedSessionsCount,
  };
}
