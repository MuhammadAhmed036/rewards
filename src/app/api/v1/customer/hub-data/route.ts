import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import {
  tenants,
  programmes,
  memberships,
  membershipBalances,
  ledgerEntries,
  users,
  sessions,
} from "@/server/db/schema";
import { getVisibleLinks } from "@/server/services/links";
import { getRewards } from "@/server/services/rewards";
import { joinProgramme } from "@/server/services/member";
import { generateMemberQrToken, generateQrDataUrl } from "@/server/qr";
import { eq, and, gt, desc } from "drizzle-orm";
import { cookies } from "next/headers";

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
      logoUrl: tenants.logoUrl,
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
  const cookieStore = await cookies();
  const token = cookieStore.get("loyalty_session")?.value;
  let memberData = null;
  let currentBalance = 0;

  if (token) {
    const now = new Date();
    const [session] = await db
      .select({ userId: sessions.userId })
      .from(sessions)
      .where(and(eq(sessions.token, token), gt(sessions.expiresAt, now)))
      .limit(1);

    if (session) {
      let [membership] = await db
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

      if (!membership) {
        const [u] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
        if (u) {
          try {
            await joinProgramme({
              tenantSlug: slug,
              email: u.email,
              name: u.name || undefined,
              marketingOptIn: true,
              allowExistingUser: true,
            });
            const [newMem] = await db
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
            if (newMem) {
              membership = newMem;
            }
          } catch (e) {
            console.error("Auto join for existing session error", e);
          }
        }
      }

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
      tenant,
      programme: prog || { type: "points", name: `${tenant.name} Rewards` },
      member: memberData,
      rewards: rewardsList,
      links: visibleLinks,
    },
  });
}

