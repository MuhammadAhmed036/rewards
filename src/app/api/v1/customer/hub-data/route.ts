import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import {
  tenants,
  programmes,
  memberships,
  membershipBalances,
  ledgerEntries,
  users,
} from "@/server/db/schema";
import { getVisibleLinks } from "@/server/services/links";
import { getRewards } from "@/server/services/rewards";
import { generateMemberQrToken, generateQrDataUrl } from "@/server/qr";
import { eq, and, desc } from "drizzle-orm";
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

  // 2. Load published programme
  const [prog] = await db
    .select({
      id: programmes.id,
      name: programmes.name,
      type: programmes.type,
      termsVersion: programmes.termsVersion,
      termsText: programmes.termsText,
    })
    .from(programmes)
    .where(and(eq(programmes.tenantId, tenant.id), eq(programmes.status, "published")))
    .limit(1);

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

        const qrToken = generateMemberQrToken(membership.publicId, membership.qrVersion);
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

        memberData = {
          membershipId: membership.id,
          memberNumber: membership.memberNumber,
          displayName: membership.userName || "Valued Member",
          balance: currentBalance,
          lifetimeEarned: bal?.lifetimeEarned || 0,
          qrToken,
          qrDataUrl,
          recentHistory,
          stampCards: await getMemberStampCards(tenant.id, membership.id),
        };
      }
    }
  }

  // 5. Load rewards with eligibility based on member balance
  const rewardsList = await getRewards(tenant.id, {
    memberBalance: currentBalance,
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

