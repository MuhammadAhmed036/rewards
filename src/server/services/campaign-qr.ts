import { db } from "../db";
import {
  promoQrCodes,
  promoQrScans,
  tenants,
  products,
  memberships,
  users,
  ledgerEntries,
  membershipBalances,
} from "../db/schema";
import { RequestContext, assertCan } from "../security/permissions";
import { generateQrDataUrl } from "../qr";
import { env } from "@/lib/env";
import { getBaseUrl } from "@/lib/url";
import { eq, and, desc, sql, lt } from "drizzle-orm";
import {
  addStamp,
  claimStampCard,
  effectiveRequiredVisits,
  getMemberStampCards,
  type StampCard,
} from "./stamp-cards";
import crypto from "crypto";

export interface CreateCampaignQrInput {
  title: string;
  offerType: "points_bonus" | "stamps_bonus" | "free_product" | "discount_promo";
  pointsToAward?: number;
  requiredVisits?: number;
  productId?: string;
  productRewardName?: string;
  discountPercent?: number;
  validityDays?: number;
  locationId?: string;
}

/**
 * Creates a dynamic promotional QR code for a business.
 * Valid for X days, fully tenant-scoped, and deactivatable at any time.
 */
export async function createCampaignQr(
  ctx: RequestContext,
  input: CreateCampaignQrInput,
  request?: Request | { headers: Headers } | null
) {
  if (!ctx.tenantId) throw new Error("tenantId is required");

  // Load tenant slug
  const [tenant] = await db
    .select({ slug: tenants.slug, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, ctx.tenantId))
    .limit(1);

  if (!tenant) throw new Error("Tenant not found");

  // If productId provided, verify product exists
  let rewardName = input.productRewardName;
  if (input.productId && !rewardName) {
    const [prod] = await db
      .select({ name: products.name })
      .from(products)
      .where(and(eq(products.id, input.productId), eq(products.tenantId, ctx.tenantId)))
      .limit(1);
    if (prod) rewardName = prod.name;
  }

  // Auto-detect required visits if title contains "Buy 3" or similar and requiredVisits wasn't set
  let requiredVisits = Math.max(1, input.requiredVisits || 1);
  if (requiredVisits === 1 && input.title) {
    const match = input.title.match(/buy\s*(\d+)/i);
    if (match && match[1]) {
      requiredVisits = parseInt(match[1], 10);
    }
  }

  const validityDays = Math.max(1, Math.min(365, input.validityDays || 30));
  const expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);
  const code = `QR_${crypto.randomBytes(6).toString("hex").toUpperCase()}`;

  const baseUrl = getBaseUrl(request);
  const scanUrl = `${baseUrl}/b/${tenant.slug}?claimQr=${code}`;
  const qrDataUrl = await generateQrDataUrl(scanUrl);

  const [campaign] = await db
    .insert(promoQrCodes)
    .values({
      tenantId: ctx.tenantId,
      locationId: input.locationId || null,
      code,
      title: input.title.trim(),
      offerType: input.offerType,
      pointsToAward: input.pointsToAward || 0,
      requiredVisits,
      productId: input.productId || null,
      productRewardName: rewardName || null,
      discountPercent: input.discountPercent || 0,
      status: "active",
      validityDays,
      expiresAt,
      totalScans: 0,
      totalClaims: 0,
      qrDataUrl,
      scanUrl,
      createdBy: ctx.userId || null,
    })
    .returning();

  return campaign;
}

/**
 * Lists all promotional QR codes created by a store with auto-expiry check.
 */
export async function getCampaignQrs(
  ctx: RequestContext,
  request?: Request | { headers: Headers } | null
) {
  if (!ctx.tenantId) throw new Error("tenantId is required");

  const now = new Date();

  // Mark expired any codes where expiresAt < now and status === 'active'
  await db
    .update(promoQrCodes)
    .set({ status: "expired" })
    .where(
      and(
        eq(promoQrCodes.tenantId, ctx.tenantId),
        eq(promoQrCodes.status, "active"),
        lt(promoQrCodes.expiresAt, now)
      )
    );

  const items = await db
    .select()
    .from(promoQrCodes)
    .where(eq(promoQrCodes.tenantId, ctx.tenantId))
    .orderBy(desc(promoQrCodes.createdAt));

  const [tenant] = await db
    .select({ slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, ctx.tenantId))
    .limit(1);

  const tenantSlug = tenant?.slug || "";
  const baseUrl = getBaseUrl(request);

  return await Promise.all(
    items.map(async (item) => {
      const expectedScanUrl = `${baseUrl}/b/${tenantSlug}?claimQr=${item.code}`;
      const hasLocalhostMismatch =
        item.scanUrl.includes("localhost") && !baseUrl.includes("localhost");

      if (hasLocalhostMismatch) {
        const updatedQrDataUrl = await generateQrDataUrl(expectedScanUrl);
        await db
          .update(promoQrCodes)
          .set({ scanUrl: expectedScanUrl, qrDataUrl: updatedQrDataUrl })
          .where(eq(promoQrCodes.id, item.id));

        return {
          ...item,
          scanUrl: expectedScanUrl,
          qrDataUrl: updatedQrDataUrl,
        };
      }
      return item;
    })
  );
}

/**
 * Deactivates / expires an active QR code manually on-demand.
 */
export async function deactivateCampaignQr(ctx: RequestContext, qrId: string) {
  if (!ctx.tenantId) throw new Error("tenantId is required");

  const [updated] = await db
    .update(promoQrCodes)
    .set({ status: "deactivated", updatedAt: new Date() })
    .where(and(eq(promoQrCodes.id, qrId), eq(promoQrCodes.tenantId, ctx.tenantId)))
    .returning();

  if (!updated) {
    throw new Error("Campaign QR code not found or unauthorized");
  }

  return updated;
}

/**
 * Customer scans and claims a promotional QR code.
 * Validates expiration, records visit progress (e.g. 1/3, 2/3, 3/3),
 * handles duplicate claim prevention, and sets up pending claim for staff/owner approval.
 */
export async function scanAndClaimCampaignQr(
  tenantId: string,
  code: string,
  membershipId: string
) {
  const now = new Date();

  // 1. Fetch QR code
  const [qr] = await db
    .select()
    .from(promoQrCodes)
    .where(and(eq(promoQrCodes.code, code), eq(promoQrCodes.tenantId, tenantId)))
    .limit(1);

  if (!qr) {
    throw new Error("Invalid QR Code: Promotional offer not found for this store.");
  }

  if (qr.status === "deactivated") {
    throw new Error("This promotional QR code was deactivated by the business manager.");
  }

  if (qr.status === "expired" || qr.expiresAt < now) {
    if (qr.status !== "expired") {
      await db.update(promoQrCodes).set({ status: "expired" }).where(eq(promoQrCodes.id, qr.id));
    }
    throw new Error("This promotional QR code has expired.");
  }

  // 2. Fetch Member details
  const [member] = await db
    .select({
      id: memberships.id,
      memberNumber: memberships.memberNumber,
      userName: users.name,
      userEmail: users.email,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(and(eq(memberships.id, membershipId), eq(memberships.tenantId, tenantId)))
    .limit(1);

  if (!member) {
    throw new Error("Member not found for this store.");
  }

  // Multi-visit offers ("Buy 3 get 1 free") are stamp cards: repeatable, and claimed by the member once full.
  if (effectiveRequiredVisits(qr) > 1) {
    return collectStampFromScan(tenantId, qr, member.id);
  }

  // 3. Check if member already claimed and had this offer approved
  const [alreadyApproved] = await db
    .select()
    .from(promoQrScans)
    .where(
      and(
        eq(promoQrScans.campaignQrId, qr.id),
        eq(promoQrScans.membershipId, member.id),
        eq(promoQrScans.status, "approved")
      )
    )
    .limit(1);

  if (alreadyApproved) {
    return {
      success: true,
      isIntermediateVisit: false,
      isAlreadyClaimed: true,
      currentVisit: qr.requiredVisits || 1,
      requiredVisits: qr.requiredVisits || 1,
      campaignTitle: qr.title,
      productRewardName: qr.productRewardName,
      message: `🎉 You have already claimed this offer! Each customer can claim this perk once.`,
    };
  }

  // 4. Check if member already has a pending claim waiting for staff approval
  const [pendingClaim] = await db
    .select()
    .from(promoQrScans)
    .where(
      and(
        eq(promoQrScans.campaignQrId, qr.id),
        eq(promoQrScans.membershipId, member.id),
        eq(promoQrScans.status, "pending_claim")
      )
    )
    .limit(1);

  if (pendingClaim) {
    return {
      success: true,
      isIntermediateVisit: false,
      isPendingClaim: true,
      currentVisit: pendingClaim.requiredVisits,
      requiredVisits: pendingClaim.requiredVisits,
      campaignTitle: qr.title,
      productRewardName: qr.productRewardName,
      message: `⏳ Your Free ${qr.productRewardName || "Perk"} claim is waiting at the counter! Staff or Owner will approve and hand it over to you.`,
    };
  }

  // 5. Determine required visits (e.g. 3 for "BUY 3 GET ONE FREE")
  let requiredVisits = Math.max(1, qr.requiredVisits || 1);
  if (requiredVisits === 1 && qr.title) {
    const match = qr.title.match(/buy\s*(\d+)/i);
    if (match && match[1]) {
      requiredVisits = parseInt(match[1], 10);
    }
  }

  // Count active in-progress scans
  const previousVisits = await db
    .select()
    .from(promoQrScans)
    .where(
      and(
        eq(promoQrScans.campaignQrId, qr.id),
        eq(promoQrScans.membershipId, member.id),
        eq(promoQrScans.status, "visit_logged")
      )
    );

  // Prevent multiple scans during the same visit (12-hour cooldown per visit)
  if (previousVisits.length > 0) {
    const recentScan = [...previousVisits].sort(
      (a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime()
    )[0];

    const hoursSinceLast = (now.getTime() - new Date(recentScan.scannedAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceLast < 12) {
      return {
        success: true,
        isIntermediateVisit: true,
        isAlreadyScannedToday: true,
        currentVisit: previousVisits.length,
        requiredVisits,
        visitsRemaining: Math.max(0, requiredVisits - previousVisits.length),
        campaignTitle: qr.title,
        productRewardName: qr.productRewardName,
        message: `✅ Visit ${previousVisits.length} of ${requiredVisits} is already logged for today! Next visit can be logged on your next store visit.`,
      };
    }
  }

  const currentVisit = previousVisits.length + 1;

  // Case A: Intermediate visit (e.g. 1/3 or 2/3)
  if (currentVisit < requiredVisits) {
    await db.transaction(async (tx) => {
      await tx.insert(promoQrScans).values({
        tenantId,
        campaignQrId: qr.id,
        membershipId: member.id,
        memberNumber: member.memberNumber,
        memberName: member.userName || member.userEmail || "Member",
        pointsAwarded: 0,
        visitNumber: currentVisit,
        requiredVisits,
        status: "visit_logged",
      });

      await tx
        .update(promoQrCodes)
        .set({
          totalScans: sql`${promoQrCodes.totalScans} + 1`,
          updatedAt: now,
        })
        .where(eq(promoQrCodes.id, qr.id));
    });

    const remaining = requiredVisits - currentVisit;
    return {
      success: true,
      isIntermediateVisit: true,
      isPendingClaim: false,
      currentVisit,
      requiredVisits,
      visitsRemaining: remaining,
      campaignTitle: qr.title,
      productRewardName: qr.productRewardName,
      message: `☕ Visit ${currentVisit} of ${requiredVisits} recorded! Buy ${remaining} more ${
        qr.productRewardName || "item(s)"
      } to get 1 Free!`,
    };
  }

  // Case B: Final visit / Goal reached (e.g. 3 of 3)!
  let awardedPoints = qr.pointsToAward || 0;
  if (qr.offerType === "stamps_bonus" && awardedPoints === 0) {
    awardedPoints = 1;
  }

  await db.transaction(async (tx) => {
    // Record scan as pending_claim waiting for counter approval
    await tx.insert(promoQrScans).values({
      tenantId,
      campaignQrId: qr.id,
      membershipId: member.id,
      memberNumber: member.memberNumber,
      memberName: member.userName || member.userEmail || "Member",
      pointsAwarded: awardedPoints,
      visitNumber: requiredVisits,
      requiredVisits,
      status: "pending_claim",
    });

    await tx
      .update(promoQrCodes)
      .set({
        totalScans: sql`${promoQrCodes.totalScans} + 1`,
        updatedAt: now,
      })
      .where(eq(promoQrCodes.id, qr.id));
  });

  return {
    success: true,
    isIntermediateVisit: false,
    isPendingClaim: true,
    currentVisit: requiredVisits,
    requiredVisits,
    campaignTitle: qr.title,
    productRewardName: qr.productRewardName,
    message: `🎉 Goal Reached (${requiredVisits}/${requiredVisits})! Your Free ${
      qr.productRewardName || "Reward"
    } request is waiting at the counter. Staff / Owner will approve and hand it over to you!`,
  };
}

interface StampScanResult {
  success: true;
  campaignTitle: string;
  productRewardName: string | null;
  currentVisit: number;
  requiredVisits: number;
  visitsRemaining: number;
  card: StampCard;
  message: string;
  isIntermediateVisit: boolean;
  isPendingClaim?: boolean;
  isReady?: boolean;
  isAlreadyScannedToday?: boolean;
  isAlreadyClaimed?: boolean;
}

async function collectStampFromScan(
  tenantId: string,
  qr: typeof promoQrCodes.$inferSelect,
  membershipId: string
): Promise<StampScanResult> {
  const result = await addStamp({ tenantId, membershipId, offerId: qr.id, source: "customer" });
  const { card } = result;
  const remaining = card.requiredStamps - card.stamps;
  const reward = qr.productRewardName || "reward";
  const base = {
    success: true as const,
    campaignTitle: qr.title,
    productRewardName: qr.productRewardName,
    currentVisit: card.stamps,
    requiredVisits: card.requiredStamps,
    visitsRemaining: remaining,
    card,
  };

  if (card.state === "pending") {
    return {
      ...base,
      isIntermediateVisit: false,
      isPendingClaim: true,
      message: `Your free ${reward} is waiting at the counter. Show your card to a member of staff.`,
    };
  }
  if (card.state === "ready") {
    return {
      ...base,
      isIntermediateVisit: false,
      isPendingClaim: false,
      isReady: true,
      message: result.added
        ? `Card complete! Tap "Claim reward" to get your free ${reward}.`
        : `Your card is full. Tap "Claim reward" to get your free ${reward}.`,
    };
  }
  if (result.reason === "cooldown") {
    return {
      ...base,
      isIntermediateVisit: true,
      isAlreadyScannedToday: true,
      message: `Visit ${card.stamps} of ${card.requiredStamps} is already stamped for today. You can collect your next stamp on your next visit.`,
    };
  }
  return {
    ...base,
    isIntermediateVisit: true,
    isPendingClaim: false,
    message: `Visit ${card.stamps} of ${card.requiredStamps} stamped. ${remaining} more for a free ${reward}.`,
  };
}

/**
 * Staff hand over a stamp-card reward at the till. Works whether or not the
 * member has tapped "Claim reward" yet, as long as the card is full.
 */
export async function staffGiveStampReward(
  ctx: RequestContext,
  params: { membershipId: string; offerId: string }
) {
  assertCan(ctx, "ledger.redeem");
  if (!ctx.tenantId) throw new Error("tenantId required");

  const cards = await getMemberStampCards(ctx.tenantId, params.membershipId, { includeUnstarted: true });
  let card = cards.find((c) => c.offerId === params.offerId);
  if (!card) throw new Error("Stamp card offer not found");

  if (card.state === "collecting") {
    const remaining = card.requiredStamps - card.stamps;
    throw new Error(`CARD_NOT_FULL: The customer needs ${remaining} more stamp${remaining === 1 ? "" : "s"}.`);
  }
  if (card.state === "ready") {
    card = await claimStampCard({ tenantId: ctx.tenantId, ...params });
  }

  return approvePromoClaim(ctx, card.pendingScanId!);
}

/**
 * Staff or Owner approves a pending claim and hands over the free product / reward.
 */
export async function approvePromoClaim(ctx: RequestContext, scanId: string) {
  if (!ctx.tenantId) throw new Error("tenantId is required");

  const [scan] = await db
    .select()
    .from(promoQrScans)
    .where(and(eq(promoQrScans.id, scanId), eq(promoQrScans.tenantId, ctx.tenantId)))
    .limit(1);

  if (!scan) throw new Error("Promo scan record not found");
  if (scan.status === "approved") throw new Error("This claim has already been approved");

  const [qr] = await db
    .select()
    .from(promoQrCodes)
    .where(eq(promoQrCodes.id, scan.campaignQrId))
    .limit(1);

  const now = new Date();
  let approverName = "Staff / Owner";
  if (ctx.userId) {
    const [u] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1);
    if (u) approverName = u.name || u.email || "Staff / Owner";
  }

  let newBalance: number | null = null;

  await db.transaction(async (tx) => {
    // 1. If points bonus, credit through append-only ledger
    if (scan.pointsAwarded > 0 && scan.membershipId) {
      const [balanceRow] = await tx
        .select()
        .from(membershipBalances)
        .where(eq(membershipBalances.membershipId, scan.membershipId))
        .for("update");

      const currentBal = balanceRow?.balance || 0;
      const currentLifetime = balanceRow?.lifetimeEarned || 0;
      const computedBal = currentBal + scan.pointsAwarded;

      await tx.insert(ledgerEntries).values({
        tenantId: ctx.tenantId!,
        membershipId: scan.membershipId,
        type: "earn",
        pointsDelta: scan.pointsAwarded,
        reasonCode: "promo_qr_bonus",
        note: `Approved promo claim: ${qr?.title || "Promo QR"}`,
        idempotencyKey: `promo_claim_approve_${scan.id}_${Date.now()}`,
        occurredAt: now,
      });

      await tx
        .update(membershipBalances)
        .set({
          balance: computedBal,
          lifetimeEarned: currentLifetime + scan.pointsAwarded,
          updatedAt: now,
        })
        .where(eq(membershipBalances.membershipId, scan.membershipId));

      newBalance = computedBal;
    }

    // 2. Mark this scan as approved
    await tx
      .update(promoQrScans)
      .set({
        status: "approved",
        approvedBy: ctx.userId || null,
        approvedByName: approverName,
        approvedAt: now,
      })
      .where(eq(promoQrScans.id, scan.id));

    // 3. Mark previous in-progress visit scans for this member as approved (completed cycle)
    if (scan.membershipId) {
      await tx
        .update(promoQrScans)
        .set({ status: "approved", approvedAt: now })
        .where(
          and(
            eq(promoQrScans.campaignQrId, scan.campaignQrId),
            eq(promoQrScans.membershipId, scan.membershipId),
            eq(promoQrScans.status, "visit_logged")
          )
        );
    }

    // 4. Increment total claims counter
    if (qr) {
      await tx
        .update(promoQrCodes)
        .set({
          totalClaims: sql`${promoQrCodes.totalClaims} + 1`,
          updatedAt: now,
        })
        .where(eq(promoQrCodes.id, qr.id));
    }
  });

  return {
    success: true,
    scanId: scan.id,
    status: "approved",
    approvedByName: approverName,
    approvedAt: now.toISOString(),
    newBalance,
  };
}

/**
 * Staff or Owner discards / resets an offer claim or in-progress visit.
 */
export async function discardPromoClaim(ctx: RequestContext, scanId: string) {
  if (!ctx.tenantId) throw new Error("tenantId is required");

  const [scan] = await db
    .select()
    .from(promoQrScans)
    .where(and(eq(promoQrScans.id, scanId), eq(promoQrScans.tenantId, ctx.tenantId)))
    .limit(1);

  if (!scan) throw new Error("Promo scan record not found");

  const now = new Date();
  let approverName = "Staff / Owner";
  if (ctx.userId) {
    const [u] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1);
    if (u) approverName = u.name || u.email || "Staff / Owner";
  }

  await db.transaction(async (tx) => {
    await tx
      .update(promoQrScans)
      .set({
        status: "discarded",
        approvedBy: ctx.userId || null,
        approvedByName: approverName,
        approvedAt: now,
      })
      .where(eq(promoQrScans.id, scan.id));

    if (scan.membershipId) {
      await tx
        .update(promoQrScans)
        .set({ status: "discarded", approvedAt: now })
        .where(
          and(
            eq(promoQrScans.campaignQrId, scan.campaignQrId),
            eq(promoQrScans.membershipId, scan.membershipId),
            eq(promoQrScans.status, "visit_logged")
          )
        );
    }
  });

  return {
    success: true,
    scanId: scan.id,
    status: "discarded",
  };
}

/**
 * Returns public metadata for a promo QR code so the customer landing page
 * can display the promotional banner even before the customer logs in.
 */
export async function getCampaignQrPublicInfo(slug: string, code: string) {
  const [tenant] = await db
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);

  if (!tenant) return null;

  const [qr] = await db
    .select()
    .from(promoQrCodes)
    .where(and(eq(promoQrCodes.code, code), eq(promoQrCodes.tenantId, tenant.id)))
    .limit(1);

  if (!qr) return null;

  const now = new Date();
  let status = qr.status;
  if (status === "active" && qr.expiresAt < now) {
    status = "expired";
  }

  let requiredVisits = Math.max(1, qr.requiredVisits || 1);
  if (requiredVisits === 1 && qr.title) {
    const match = qr.title.match(/buy\s*(\d+)/i);
    if (match && match[1]) {
      requiredVisits = parseInt(match[1], 10);
    }
  }

  return {
    id: qr.id,
    tenantId: qr.tenantId,
    businessName: tenant.name,
    code: qr.code,
    title: qr.title,
    offerType: qr.offerType,
    pointsToAward: qr.pointsToAward,
    requiredVisits,
    productRewardName: qr.productRewardName,
    discountPercent: qr.discountPercent,
    status,
    expiresAt: qr.expiresAt.toISOString(),
    isExpired: status === "expired",
    isDeactivated: status === "deactivated",
  };
}

/**
 * Returns scan and claim activity reports for staff & owner.
 */
export async function getCampaignQrReports(ctx: RequestContext) {
  if (!ctx.tenantId) throw new Error("tenantId is required");

  return await db
    .select({
      id: promoQrScans.id,
      campaignQrId: promoQrScans.campaignQrId,
      campaignTitle: promoQrCodes.title,
      offerType: promoQrCodes.offerType,
      productRewardName: promoQrCodes.productRewardName,
      memberName: promoQrScans.memberName,
      memberNumber: promoQrScans.memberNumber,
      pointsAwarded: promoQrScans.pointsAwarded,
      visitNumber: promoQrScans.visitNumber,
      requiredVisits: promoQrScans.requiredVisits,
      status: promoQrScans.status,
      approvedByName: promoQrScans.approvedByName,
      approvedAt: promoQrScans.approvedAt,
      scannedAt: promoQrScans.scannedAt,
    })
    .from(promoQrScans)
    .innerJoin(promoQrCodes, eq(promoQrScans.campaignQrId, promoQrCodes.id))
    .where(eq(promoQrScans.tenantId, ctx.tenantId))
    .orderBy(desc(promoQrScans.scannedAt))
    .limit(100);
}
