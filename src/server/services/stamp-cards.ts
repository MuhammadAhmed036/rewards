import { db, DbExecutor } from "../db";
import { promoQrCodes, promoQrScans, memberships, users } from "../db/schema";
import { RequestContext, assertCan } from "../security/permissions";
import { and, eq, inArray } from "drizzle-orm";

/**
 * Stamp cards are multi-visit promo offers ("Buy 3 coffees, get 1 free").
 *
 * A member's card for an offer is derived from promo_qr_scans:
 *   visit_logged  — one stamp in the current card
 *   pending_claim — card was full and the member claimed it; waiting for staff to hand over the reward
 *   approved      — completed cards (the claim row carries approvedByName; its stamps don't)
 *   discarded     — reset by staff
 *
 * After staff approve a claim the card starts again from zero.
 */

export type StampCardState = "collecting" | "ready" | "pending";

export interface StampCard {
  offerId: string;
  title: string;
  rewardName: string;
  offerType: string;
  requiredStamps: number;
  stamps: number;
  state: StampCardState;
  pendingScanId: string | null;
  rewardsClaimed: number;
  lastStampAt: string | null;
  offerStatus: "active" | "expired" | "deactivated";
  expiresAt: string;
}

/** Self-scans by the customer are limited to one stamp per visit. */
export const SELF_SCAN_COOLDOWN_HOURS = 12;

type OfferRow = typeof promoQrCodes.$inferSelect;
type ScanRow = typeof promoQrScans.$inferSelect;

export function effectiveRequiredVisits(offer: { requiredVisits: number | null; title: string }) {
  let required = Math.max(1, offer.requiredVisits || 1);
  if (required === 1 && offer.title) {
    const match = offer.title.match(/buy\s*(\d+)/i);
    if (match?.[1]) required = parseInt(match[1], 10);
  }
  return required;
}

export function isStampOffer(offer: { requiredVisits: number | null; title: string }) {
  return effectiveRequiredVisits(offer) > 1;
}

function offerStatus(offer: OfferRow, now = new Date()): StampCard["offerStatus"] {
  if (offer.status === "deactivated") return "deactivated";
  if (offer.status === "expired" || offer.expiresAt < now) return "expired";
  return "active";
}

function rewardPoints(offer: OfferRow) {
  if (offer.offerType === "stamps_bonus" && !offer.pointsToAward) return 1;
  return offer.pointsToAward || 0;
}

function buildCard(offer: OfferRow, scans: ScanRow[]): StampCard {
  const required = effectiveRequiredVisits(offer);
  const stampRows = scans.filter((s) => s.status === "visit_logged");
  const pending = scans.find((s) => s.status === "pending_claim") || null;
  const rewardsClaimed = scans.filter((s) => s.status === "approved" && s.approvedByName).length;
  const lastStamp = stampRows.reduce<Date | null>(
    (latest, s) => (!latest || s.scannedAt > latest ? s.scannedAt : latest),
    null
  );

  const state: StampCardState = pending
    ? "pending"
    : stampRows.length >= required
    ? "ready"
    : "collecting";

  return {
    offerId: offer.id,
    title: offer.title,
    rewardName: offer.productRewardName || offer.title,
    offerType: offer.offerType,
    requiredStamps: required,
    stamps: pending ? required : Math.min(stampRows.length, required),
    state,
    pendingScanId: pending?.id || null,
    rewardsClaimed,
    lastStampAt: lastStamp ? lastStamp.toISOString() : null,
    offerStatus: offerStatus(offer),
    expiresAt: offer.expiresAt.toISOString(),
  };
}

/**
 * Cards for one member.
 * Customers see every offer they have started; staff (includeUnstarted) also see
 * active offers the member hasn't stamped yet, so they can add the first stamp.
 */
export async function getMemberStampCards(
  tenantId: string,
  membershipId: string,
  opts: { includeUnstarted?: boolean } = {},
  executor: DbExecutor = db
): Promise<StampCard[]> {
  const offers = (
    await executor.select().from(promoQrCodes).where(eq(promoQrCodes.tenantId, tenantId))
  ).filter(isStampOffer);
  if (offers.length === 0) return [];

  const scans = await executor
    .select()
    .from(promoQrScans)
    .where(
      and(
        eq(promoQrScans.tenantId, tenantId),
        eq(promoQrScans.membershipId, membershipId),
        inArray(
          promoQrScans.campaignQrId,
          offers.map((o) => o.id)
        )
      )
    );

  const cards: StampCard[] = [];
  for (const offer of offers) {
    const offerScans = scans.filter((s) => s.campaignQrId === offer.id);
    const card = buildCard(offer, offerScans);
    const started = offerScans.some((s) => s.status !== "discarded");
    const live = card.offerStatus === "active";

    if (card.state !== "collecting" || (live && (started || opts.includeUnstarted)) || (!live && card.stamps > 0)) {
      cards.push(card);
    }
  }

  const order: Record<StampCardState, number> = { pending: 0, ready: 1, collecting: 2 };
  return cards.sort(
    (a, b) =>
      order[a.state] - order[b.state] ||
      b.stamps / b.requiredStamps - a.stamps / a.requiredStamps ||
      a.title.localeCompare(b.title)
  );
}

async function lockMember(executor: DbExecutor, tenantId: string, membershipId: string) {
  // Row lock serialises concurrent stamp/claim requests for the same member (double taps, two tills).
  const [member] = await executor
    .select({
      id: memberships.id,
      status: memberships.status,
      memberNumber: memberships.memberNumber,
      userName: users.name,
      userEmail: users.email,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(and(eq(memberships.id, membershipId), eq(memberships.tenantId, tenantId)))
    .for("update", { of: memberships })
    .limit(1);

  if (!member) throw new Error("Member not found for this business");
  if (member.status !== "active") throw new Error(`Membership is ${member.status}`);
  return member;
}

async function loadOffer(executor: DbExecutor, tenantId: string, offerId: string) {
  const [offer] = await executor
    .select()
    .from(promoQrCodes)
    .where(and(eq(promoQrCodes.id, offerId), eq(promoQrCodes.tenantId, tenantId)))
    .limit(1);
  if (!offer || !isStampOffer(offer)) throw new Error("Stamp card offer not found");
  return offer;
}

async function loadCard(executor: DbExecutor, offer: OfferRow, membershipId: string) {
  const scans = await executor
    .select()
    .from(promoQrScans)
    .where(and(eq(promoQrScans.campaignQrId, offer.id), eq(promoQrScans.membershipId, membershipId)));
  return { card: buildCard(offer, scans), scans };
}

export interface AddStampResult {
  card: StampCard;
  added: boolean;
  reason?: "cooldown" | "full" | "pending";
  hoursUntilNextStamp?: number;
}

/**
 * Adds one stamp to the member's current card.
 * source "customer" = self-scan of the offer QR (cooldown applies);
 * source "staff" = verified purchase at the till (no cooldown).
 */
export async function addStamp(params: {
  tenantId: string;
  membershipId: string;
  offerId: string;
  source: "customer" | "staff";
}): Promise<AddStampResult> {
  const { tenantId, membershipId, offerId, source } = params;
  const now = new Date();

  return db.transaction(async (tx) => {
    const member = await lockMember(tx, tenantId, membershipId);
    const offer = await loadOffer(tx, tenantId, offerId);

    const status = offerStatus(offer, now);
    if (status === "deactivated") throw new Error("This offer was switched off by the business.");
    if (status === "expired") throw new Error("This offer has ended.");

    const { card } = await loadCard(tx, offer, membershipId);
    if (card.state === "pending") return { card, added: false, reason: "pending" as const };
    if (card.state === "ready") return { card, added: false, reason: "full" as const };

    if (source === "customer" && card.lastStampAt) {
      const hoursSince = (now.getTime() - new Date(card.lastStampAt).getTime()) / 3_600_000;
      if (hoursSince < SELF_SCAN_COOLDOWN_HOURS) {
        return {
          card,
          added: false,
          reason: "cooldown" as const,
          hoursUntilNextStamp: Math.ceil(SELF_SCAN_COOLDOWN_HOURS - hoursSince),
        };
      }
    }

    await tx.insert(promoQrScans).values({
      tenantId,
      campaignQrId: offer.id,
      membershipId,
      memberNumber: member.memberNumber,
      memberName: member.userName || member.userEmail || "Member",
      pointsAwarded: 0,
      visitNumber: card.stamps + 1,
      requiredVisits: card.requiredStamps,
      status: "visit_logged",
    });

    await tx
      .update(promoQrCodes)
      .set({ totalScans: offer.totalScans + 1, updatedAt: now })
      .where(eq(promoQrCodes.id, offer.id));

    const { card: updated } = await loadCard(tx, offer, membershipId);
    return { card: updated, added: true };
  });
}

/**
 * Member claims a full card. Creates the pending claim staff see at the till;
 * the reward is handed over when staff approve it (approvePromoClaim).
 */
export async function claimStampCard(params: {
  tenantId: string;
  membershipId: string;
  offerId: string;
}): Promise<StampCard> {
  const { tenantId, membershipId, offerId } = params;

  return db.transaction(async (tx) => {
    const member = await lockMember(tx, tenantId, membershipId);
    const offer = await loadOffer(tx, tenantId, offerId);
    const { card } = await loadCard(tx, offer, membershipId);

    if (card.state === "pending") return card;
    if (card.state !== "ready") {
      const remaining = card.requiredStamps - card.stamps;
      throw new Error(`CARD_NOT_FULL: Collect ${remaining} more stamp${remaining === 1 ? "" : "s"} first.`);
    }

    await tx.insert(promoQrScans).values({
      tenantId,
      campaignQrId: offer.id,
      membershipId,
      memberNumber: member.memberNumber,
      memberName: member.userName || member.userEmail || "Member",
      pointsAwarded: rewardPoints(offer),
      visitNumber: card.requiredStamps,
      requiredVisits: card.requiredStamps,
      status: "pending_claim",
    });

    return (await loadCard(tx, offer, membershipId)).card;
  });
}

/** Staff add a stamp after a qualifying purchase. */
export async function staffAddStamp(
  ctx: RequestContext,
  params: { membershipId: string; offerId: string }
) {
  assertCan(ctx, "ledger.earn");
  if (!ctx.tenantId) throw new Error("tenantId required");
  return addStamp({ tenantId: ctx.tenantId, ...params, source: "staff" });
}
