import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import {
  tenants,
  programmes,
  memberships,
  membershipBalances,
  ledgerEntries,
  users,
  ruleVersions,
} from "@/server/db/schema";
import { describeRule, ruleConfigSchema, activeMultiplier, tierFor, type RuleConfig } from "@/lib/points";
import { earnedInTierWindow } from "@/server/services/ledger";
import { currencySymbol } from "@/lib/money";
import { getVisibleLinks } from "@/server/services/links";
import { getRewards } from "@/server/services/rewards";
import { generateLiveQrToken, generateMemberQrToken, generateQrDataUrl } from "@/server/qr";
import { tenantUsesLiveQr } from "@/server/services/member";
import { eq, and, desc, inArray } from "drizzle-orm";
import { logoRefSql, resolveLogoUrl } from "@/server/services/business-logo";
import { getMemberStampCards } from "@/server/services/stamp-cards";
import { getSessionContext } from "@/server/auth";
import { readSessionCookie } from "@/server/auth/session-response";
import { isBusinessAccount } from "@/server/auth/portal-access";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug query parameter is required" }, { status: 400 });
  }

  // 1. Load tenant
  const [tenant] = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      status: tenants.status,
      currency: tenants.currency,
      brandPrimaryHex: tenants.brandPrimaryHex,
      logoRef: logoRefSql,
    })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);

  if (!tenant || tenant.status !== "active") {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Business not found or inactive" } },
      { status: 404 }
    );
  }

  // 2. Load the programme (a paused one still shows cards and balances, just no new points)
  const [progRow] = await db
    .select({
      id: programmes.id,
      name: programmes.name,
      type: programmes.type,
      status: programmes.status,
      termsVersion: programmes.termsVersion,
      termsText: programmes.termsText,
      currentRuleVersionId: programmes.currentRuleVersionId,
    })
    .from(programmes)
    .where(and(eq(programmes.tenantId, tenant.id), inArray(programmes.status, ["published", "paused"])))
    .limit(1);

  // How customers earn, in plain words, so the rule is visible to them (FR-051)
  let earningRule: string | null = null;
  let expiryRule: string | null = null;
  let parsedRule: RuleConfig | null = null;
  if (progRow?.currentRuleVersionId) {
    const [rule] = await db
      .select({ config: ruleVersions.config })
      .from(ruleVersions)
      .where(eq(ruleVersions.id, progRow.currentRuleVersionId))
      .limit(1);
    if (rule) {
      const parsed = ruleConfigSchema.parse(rule.config);
      parsedRule = parsed;
      if (parsed.expiry.enabled) {
        expiryRule = `${progRow.type === "stamps" ? "Stamps" : "Points"} expire after ${parsed.expiry.months} months without a visit`;
      }
      earningRule = describeRule(
        parsed,
        progRow.type === "stamps" ? "stamps" : "points",
        currencySymbol(tenant.currency || "GBP")
      );
    }
  }
  const prog = progRow
    ? {
        id: progRow.id,
        name: progRow.name,
        type: progRow.type,
        status: progRow.status,
        termsVersion: progRow.termsVersion,
        termsText: progRow.termsText,
        earningRule,
        expiryRule,
        // What customers can see about boosts, levels and inviting friends (FR-051)
        activeBoost: (() => {
          if (!parsedRule) return null;
          const boost = activeMultiplier(parsedRule);
          if (!boost.label) return null;
          const running = parsedRule.multipliers.find((m) => m.label === boost.label && m.percent === boost.percent);
          return { label: boost.label, percent: boost.percent, endsAt: running?.endsAt ?? null };
        })(),
        tierLevels: parsedRule?.tiers.enabled ? parsedRule.tiers.levels : [],
        tierMonths: parsedRule?.tiers.qualificationMonths ?? 12,
        referralPoints: parsedRule?.bonuses.referralPoints ?? 0,
      }
    : undefined;

  // 3. Anti-Gating: Load visible links (same for all members)
  const visibleLinks = await getVisibleLinks(tenant.id);

  // 4. Check for logged in customer session
  let memberData = null;
  let currentBalance = 0;

  {
    // Same decryption, expiry and idle-timeout rules as every other signed-in request
    // Same decryption, expiry and idle-timeout rules as every other signed-in request.
    // Only customers get a card here: owner, staff and admin accounts never see one.
    const sessionCtx = await getSessionContext(readSessionCookie(request));
    const session =
      sessionCtx && !(await isBusinessAccount(sessionCtx.userId)) ? { userId: sessionCtx.userId } : null;

    if (session) {
      // A card exists only if the customer registered at this shop; nothing is created automatically.
      const [membership] = await db
        .select({
          id: memberships.id,
          memberNumber: memberships.memberNumber,
          publicId: memberships.publicId,
          qrVersion: memberships.qrVersion,
          status: memberships.status,
          joinedAt: memberships.joinedAt,
          userName: users.name,
          userEmail: users.email,
        })
        .from(memberships)
        .innerJoin(users, eq(memberships.userId, users.id))
        .where(
          and(
            eq(memberships.tenantId, tenant.id),
            eq(memberships.userId, session.userId)
          )
        )
        .limit(1);

      if (membership && membership.status === "active") {
        const [bal] = await db
          .select()
          .from(membershipBalances)
          .where(eq(membershipBalances.membershipId, membership.id))
          .limit(1);

        currentBalance = bal?.balance || 0;

        // A business that uses live codes shows one that changes every 30 seconds
        const rotatingQr = await tenantUsesLiveQr(tenant.id);
        const qrToken = rotatingQr ? generateLiveQrToken(membership.publicId, membership.qrVersion) : generateMemberQrToken(membership.publicId, membership.qrVersion);
        const qrDataUrl = await generateQrDataUrl(qrToken);

        // Recent history
        const recentHistory = await db
          .select({
            id: ledgerEntries.id,
            type: ledgerEntries.type,
            pointsDelta: ledgerEntries.pointsDelta,
            note: ledgerEntries.note,
            occurredAt: ledgerEntries.occurredAt,
          })
          .from(ledgerEntries)
          .where(eq(ledgerEntries.membershipId, membership.id))
          .orderBy(desc(ledgerEntries.occurredAt))
          .limit(10);

        let memberTier: { name: string | null; earnPercent: number; next: string | null; pointsToNext: number; earnedInWindow: number } | null = null;
        if (parsedRule?.tiers.enabled) {
          const earned = await earnedInTierWindow(db, tenant.id, membership.id, parsedRule);
          const t = tierFor(parsedRule, earned);
          memberTier = {
            name: t.current?.name ?? null,
            earnPercent: t.current?.earnPercent ?? 100,
            next: t.next?.name ?? null,
            pointsToNext: t.pointsToNext,
            earnedInWindow: earned,
          };
        }

        memberData = {
          membershipId: membership.id,
          memberNumber: membership.memberNumber,
          displayName: membership.userName || "Valued Member",
          balance: currentBalance,
          lifetimeEarned: bal?.lifetimeEarned || 0,
          qrToken,
          qrDataUrl,
          rotatingQr,
          recentHistory,
          stampCards: await getMemberStampCards(tenant.id, membership.id),
          // Level and invite code, only when the shop uses them
          tier: memberTier,
          referralCode: membership.memberNumber,
        };
      }
    }
  }

  // 5. Load rewards with eligibility based on member balance
  const rewardsList = await getRewards(tenant.id, {
    memberBalance: currentBalance,
    membershipId: memberData?.membershipId,
  });

  return NextResponse.json({
    data: {
      tenant: (({ logoRef, ...t }) => ({ ...t, logoUrl: resolveLogoUrl(t.id, logoRef) }))(tenant),
      programme: prog || { type: "points", name: `${tenant.name} Rewards` },
      member: memberData,
      rewards: rewardsList,
      links: visibleLinks,
    },
  });
}

