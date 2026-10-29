import { db, DbExecutor } from "../db";
import {
  ledgerEntries,
  membershipBalances,
  memberships,
  programmes,
  ruleVersions,
  rewards,
  rewardLocations,
  redemptions,
  tenants,
  products,
  locations,
} from "../db/schema";
import { RequestContext, assertCan } from "../security/permissions";
import { calculatePoints, RuleConfig } from "@/lib/points";
import { hashRedemptionCode, generateRedemptionCode } from "../qr";
import { logAuditEvent } from "./audit";
import { notifyRedemption, notifyRewardsUnlocked } from "./notifications";
import { sentry } from "@/lib/sentry";
import { eq, and, sql, desc, gte, lt } from "drizzle-orm";

export interface EarnParams {
  membershipId: string;
  locationId: string;
  amountMinor?: number;
  tipMinor?: number;
  idempotencyKey: string;
  managerOverrideReason?: string;
}

export interface EarnResult {
  entryId: string;
  pointsDelta: number;
  newBalance: number;
  lifetimeEarned: number;
  isDuplicate: boolean;
}

/** Points can only be given or spent at one of this business's open locations. */
async function assertOpenLocation(executor: DbExecutor, tenantId: string, locationId: string) {
  const [location] = await executor
    .select({ status: locations.status })
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.tenantId, tenantId)))
    .limit(1);
  if (!location) throw new Error("LOCATION_NOT_FOUND: That location isn't part of this business");
  if (location.status !== "active") throw new Error("LOCATION_CLOSED: This location is closed. Pick another one.");
}

export async function previewEarn(
  ctx: RequestContext,
  params: { membershipId: string; locationId: string; amountMinor?: number; tipMinor?: number }
) {
  assertCan(ctx, "ledger.earn", { locationId: params.locationId });
  if (!ctx.tenantId) throw new Error("tenantId required");

  const [tenant] = await db
    .select({ id: tenants.id, status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, ctx.tenantId))
    .limit(1);

  if (!tenant || tenant.status !== "active") {
    throw new Error("TENANT_SUSPENDED: Business account is suspended");
  }

  const [prog] = await db
    .select()
    .from(programmes)
    .where(eq(programmes.tenantId, ctx.tenantId))
    .limit(1);

  if (!prog || !prog.currentRuleVersionId) {
    throw new Error("No active programme rules configured");
  }

  if (prog.status !== "published") {
    throw new Error(`PROGRAMME_NOT_ACTIVE: Loyalty programme is ${prog.status}. Earning is only allowed when published.`);
  }

  const [ruleRow] = await db
    .select()
    .from(ruleVersions)
    .where(eq(ruleVersions.id, prog.currentRuleVersionId))
    .limit(1);

  const rule = ruleRow.config as RuleConfig;

  // Compute points earned today by member
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [todayEarns] = await db
    .select({
      total: sql<number>`COALESCE(SUM(points_delta), 0)::int`,
    })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.tenantId, ctx.tenantId),
        eq(ledgerEntries.membershipId, params.membershipId),
        eq(ledgerEntries.type, "earn"),
        gte(ledgerEntries.occurredAt, startOfDay)
      )
    );

  const pointsCalc = calculatePoints({
    amountMinor: params.amountMinor,
    tipMinor: params.tipMinor,
    alreadyEarnedTodayInTenantTz: todayEarns?.total || 0,
    rule,
  });

  const [balanceRow] = await db
    .select()
    .from(membershipBalances)
    .where(eq(membershipBalances.membershipId, params.membershipId))
    .limit(1);

  const currentBalance = balanceRow?.balance || 0;

  return {
    pointsToAward: pointsCalc.points,
    eligibleMinor: pointsCalc.eligibleMinor,
    currentBalance,
    projectedBalance: currentBalance + pointsCalc.points,
    cappedByTransaction: pointsCalc.cappedByTransaction,
    cappedByDailyLimit: pointsCalc.cappedByDailyLimit,
  };
}

export async function earn(ctx: RequestContext, params: EarnParams): Promise<EarnResult> {
  assertCan(ctx, "ledger.earn", { locationId: params.locationId });
  if (!ctx.tenantId) throw new Error("tenantId required");

  const result = await db.transaction(async (tx) => {
    // 0. Verify tenant is active (Section 19: Suspended tenant cannot earn/redeem)
    const [tenant] = await tx
      .select({ id: tenants.id, status: tenants.status })
      .from(tenants)
      .where(eq(tenants.id, ctx.tenantId!))
      .limit(1);

    if (!tenant || tenant.status !== "active") {
      throw new Error("TENANT_SUSPENDED: Business account is suspended");
    }
    await assertOpenLocation(tx, ctx.tenantId!, params.locationId);

    // 1. Idempotency check: if entry already exists with this idempotency key for this tenant, return it safely
    const [existingEntry] = await tx
      .select()
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.tenantId, ctx.tenantId!),
          eq(ledgerEntries.idempotencyKey, params.idempotencyKey)
        )
      )
      .limit(1);

    if (existingEntry) {
      const [currentBal] = await tx
        .select()
        .from(membershipBalances)
        .where(eq(membershipBalances.membershipId, params.membershipId))
        .limit(1);

      return {
        entryId: existingEntry.id,
        pointsDelta: existingEntry.pointsDelta,
        newBalance: currentBal?.balance || 0,
        lifetimeEarned: currentBal?.lifetimeEarned || 0,
        isDuplicate: true,
      };
    }

    // 2. Validate Membership
    const [membership] = await tx
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.id, params.membershipId),
          eq(memberships.tenantId, ctx.tenantId!)
        )
      )
      .limit(1);

    if (!membership) {
      throw new Error("Active membership not found for this tenant");
    }

    if (membership.status !== "active") {
      throw new Error(`MEMBERSHIP_SUSPENDED: Membership is ${membership.status}`);
    }

    // 3. Load Programme & Rule
    const [prog] = await tx
      .select()
      .from(programmes)
      .where(eq(programmes.tenantId, ctx.tenantId!))
      .limit(1);

    if (!prog || !prog.currentRuleVersionId) {
      throw new Error("No active programme rules configured");
    }

    if (prog.status !== "published") {
      throw new Error(`PROGRAMME_NOT_ACTIVE: Loyalty programme is ${prog.status}. Earning is only allowed when published.`);
    }

    const [ruleRow] = await tx
      .select()
      .from(ruleVersions)
      .where(eq(ruleVersions.id, prog.currentRuleVersionId))
      .limit(1);

    const rule = ruleRow.config as RuleConfig;

    // 4. Duplicate visit guard: check last earn time
    const [lastEarn] = await tx
      .select({ occurredAt: ledgerEntries.occurredAt })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.tenantId, ctx.tenantId!),
          eq(ledgerEntries.membershipId, params.membershipId),
          eq(ledgerEntries.type, "earn")
        )
      )
      .orderBy(desc(ledgerEntries.occurredAt))
      .limit(1);

    if (lastEarn && rule.caps.minMinutesBetweenEarns > 0) {
      const minutesSince =
        (Date.now() - new Date(lastEarn.occurredAt).getTime()) / (1000 * 60);
      if (minutesSince < rule.caps.minMinutesBetweenEarns) {
        if (!params.managerOverrideReason) {
          throw new Error(
            `DUPLICATE_VISIT: Member earned points ${Math.round(minutesSince)}m ago. Minimum interval is ${rule.caps.minMinutesBetweenEarns}m.`
          );
        }
      }
    }

    // 5. Lock balance row FOR UPDATE (Concurrency safety)
    const [lockedBalance] = await tx
      .select()
      .from(membershipBalances)
      .where(eq(membershipBalances.membershipId, params.membershipId))
      .for("update");

    if (!lockedBalance) {
      throw new Error("Membership balance record missing");
    }

    // 6. Calculate points
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [todayEarns] = await tx
      .select({
        total: sql<number>`COALESCE(SUM(points_delta), 0)::int`,
      })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.tenantId, ctx.tenantId!),
          eq(ledgerEntries.membershipId, params.membershipId),
          eq(ledgerEntries.type, "earn"),
          gte(ledgerEntries.occurredAt, startOfDay)
        )
      );

    const pointsCalc = calculatePoints({
      amountMinor: params.amountMinor,
      tipMinor: params.tipMinor,
      alreadyEarnedTodayInTenantTz: todayEarns?.total || 0,
      rule,
    });

    if (pointsCalc.points <= 0) {
      throw new Error("Transaction spend does not qualify for points under current rules");
    }

    // 7. Insert into ledger_entries (Source of Truth)
    const [entry] = await tx
      .insert(ledgerEntries)
      .values({
        tenantId: ctx.tenantId!,
        membershipId: params.membershipId,
        type: "earn",
        pointsDelta: pointsCalc.points,
        basisAmountMinor: params.amountMinor || null,
        ruleVersionId: prog.currentRuleVersionId,
        locationId: params.locationId,
        actorUserId: ctx.userId,
        reasonCode: params.managerOverrideReason ? "manager_override" : null,
        note: params.managerOverrideReason || null,
        idempotencyKey: params.idempotencyKey,
      })
      .returning();

    // 8. Update membership_balances (Projection)
    const newBalance = lockedBalance.balance + pointsCalc.points;
    const newLifetimeEarned = lockedBalance.lifetimeEarned + pointsCalc.points;

    await tx
      .update(membershipBalances)
      .set({
        balance: newBalance,
        lifetimeEarned: newLifetimeEarned,
        updatedAt: new Date(),
      })
      .where(eq(membershipBalances.membershipId, params.membershipId));

    if (params.managerOverrideReason) {
      await logAuditEvent(
        ctx,
        {
          action: "ledger.earn_override",
          targetType: "ledger_entry",
          targetId: entry.id,
          reason: params.managerOverrideReason,
        },
        tx
      );
    }

    return {
      entryId: entry.id,
      pointsDelta: pointsCalc.points,
      newBalance,
      lifetimeEarned: newLifetimeEarned,
      isDuplicate: false,
    };
  });

  // Email the customer if this visit took them past a reward (never blocks or undoes the points)
  if (!result.isDuplicate && result.pointsDelta > 0) {
    await notifyRewardsUnlocked(params.membershipId, ctx.tenantId!, result.newBalance - result.pointsDelta, result.newBalance);
  }
  return result;
}

// ==========================================
// Redemption Logic
// ==========================================

export async function requestRedemption(
  ctx: RequestContext,
  params: { membershipId: string; rewardId: string }
) {
  assertCan(ctx, "customer.redeem");
  if (!ctx.tenantId) throw new Error("tenantId required");

  // Verify tenant is active
  const [tenant] = await db
    .select({ id: tenants.id, status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, ctx.tenantId))
    .limit(1);

  if (!tenant || tenant.status !== "active") {
    throw new Error("TENANT_SUSPENDED: Business account is suspended");
  }

  // Validate member & reward
  const [membership] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.id, params.membershipId),
        eq(memberships.tenantId, ctx.tenantId)
      )
    )
    .limit(1);

  if (!membership) {
    throw new Error("Membership not found");
  }

  if (membership.status !== "active") {
    throw new Error(`MEMBERSHIP_SUSPENDED: Membership is ${membership.status}`);
  }

  const [reward] = await db
    .select()
    .from(rewards)
    .where(and(eq(rewards.id, params.rewardId), eq(rewards.tenantId, ctx.tenantId)))
    .limit(1);

  if (!reward || reward.status !== "active") {
    throw new Error("Reward is currently unavailable");
  }

  // Check validity time window per FR-060
  const now = new Date();
  if (reward.startsAt && new Date(reward.startsAt) > now) {
    throw new Error("REWARD_NOT_ACTIVE: Reward is not yet active");
  }
  if (reward.endsAt && new Date(reward.endsAt) < now) {
    throw new Error("REWARD_EXPIRED: Reward has expired");
  }

  // Check stock
  if (reward.quantityTotal && reward.quantityRedeemed >= reward.quantityTotal) {
    throw new Error("Reward is out of stock");
  }

  // Check member balance
  const [balanceRow] = await db
    .select()
    .from(membershipBalances)
    .where(eq(membershipBalances.membershipId, params.membershipId))
    .limit(1);

  if (!balanceRow || balanceRow.balance < reward.costPoints) {
    throw new Error(
      `INSUFFICIENT_BALANCE: You need ${reward.costPoints} points, but have ${balanceRow?.balance || 0}`
    );
  }

  // Check per-member limit
  if (reward.perMemberLimit) {
    const [existingCount] = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(redemptions)
      .where(
        and(
          eq(redemptions.membershipId, params.membershipId),
          eq(redemptions.rewardId, reward.id),
          eq(redemptions.status, "confirmed")
        )
      );

    if (existingCount.count >= reward.perMemberLimit) {
      throw new Error(`You have reached the limit of ${reward.perMemberLimit} for this reward`);
    }
  }

  // Generate 8-character code and set 10-minute expiry
  const { code, codeHash, codeLast4 } = generateRedemptionCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes TTL

  const [newRedemption] = await db
    .insert(redemptions)
    .values({
      tenantId: ctx.tenantId,
      membershipId: params.membershipId,
      rewardId: reward.id,
      rewardVersion: reward.version,
      costPoints: reward.costPoints,
      status: "pending",
      codeHash,
      codeLast4,
      expiresAt,
    })
    .returning();

  return {
    redemptionId: newRedemption.id,
    code,
    expiresAt,
    costPoints: reward.costPoints,
    rewardTitle: reward.title,
  };
}

export async function validateRedemptionCode(ctx: RequestContext, code: string) {
  assertCan(ctx, "ledger.redeem");
  if (!ctx.tenantId) throw new Error("tenantId required");

  const hash = hashRedemptionCode(code);

  const [redemption] = await db
    .select({
      id: redemptions.id,
      membershipId: redemptions.membershipId,
      rewardId: redemptions.rewardId,
      costPoints: redemptions.costPoints,
      status: redemptions.status,
      expiresAt: redemptions.expiresAt,
      codeLast4: redemptions.codeLast4,
      tenantId: redemptions.tenantId,
    })
    .from(redemptions)
    .where(
      and(
        eq(redemptions.codeHash, hash),
        eq(redemptions.tenantId, ctx.tenantId)
      )
    )
    .limit(1);

  if (!redemption) {
    throw new Error("Invalid redemption code");
  }

  if (redemption.status === "confirmed") {
    throw new Error("CODE_ALREADY_USED: This redemption code has already been confirmed");
  }

  if (redemption.status === "expired" || new Date(redemption.expiresAt) < new Date()) {
    throw new Error("CODE_EXPIRED: This redemption code has expired");
  }

  if (redemption.status !== "pending") {
    throw new Error(`Redemption code is ${redemption.status}`);
  }

  // Fetch reward and member summary
  const [reward] = await db
    .select()
    .from(rewards)
    .where(eq(rewards.id, redemption.rewardId))
    .limit(1);

  const [balanceRow] = await db
    .select()
    .from(membershipBalances)
    .where(eq(membershipBalances.membershipId, redemption.membershipId))
    .limit(1);

  return {
    redemption,
    reward,
    memberBalance: balanceRow?.balance || 0,
    hasSufficientBalance: (balanceRow?.balance || 0) >= redemption.costPoints,
  };
}

export async function confirmRedemption(
  ctx: RequestContext,
  params: { code: string; locationId: string; idempotencyKey: string }
) {
  assertCan(ctx, "ledger.redeem", { locationId: params.locationId });
  if (!ctx.tenantId) throw new Error("tenantId required");

  const hash = hashRedemptionCode(params.code);

  const result = await db.transaction(async (tx) => {
    // 0. Verify tenant is active
    const [tenant] = await tx
      .select({ id: tenants.id, status: tenants.status })
      .from(tenants)
      .where(eq(tenants.id, ctx.tenantId!))
      .limit(1);

    if (!tenant || tenant.status !== "active") {
      throw new Error("TENANT_SUSPENDED: Business account is suspended");
    }
    await assertOpenLocation(tx, ctx.tenantId!, params.locationId);

    // 1. Find redemption by code hash with row-level lock FOR UPDATE to prevent race conditions
    const [redemption] = await tx
      .select()
      .from(redemptions)
      .where(
        and(
          eq(redemptions.codeHash, hash),
          eq(redemptions.tenantId, ctx.tenantId!)
        )
      )
      .for("update")
      .limit(1);

    if (!redemption) {
      throw new Error("Redemption code not found");
    }

    if (redemption.status === "confirmed") {
      throw new Error("CODE_ALREADY_USED: Code was already redeemed");
    }

    if (redemption.status === "expired" || new Date(redemption.expiresAt) < new Date()) {
      await tx
        .update(redemptions)
        .set({ status: "expired" })
        .where(eq(redemptions.id, redemption.id));
      throw new Error("CODE_EXPIRED: Code has expired");
    }

    if (redemption.status !== "pending") {
      throw new Error(`Redemption is ${redemption.status}`);
    }

    // 2. Validate Reward & Location eligibility
    const [reward] = await tx
      .select()
      .from(rewards)
      .where(eq(rewards.id, redemption.rewardId))
      .limit(1);

    if (!reward || reward.status !== "active") {
      throw new Error("Reward is no longer active");
    }

    const locScopes = await tx
      .select()
      .from(rewardLocations)
      .where(eq(rewardLocations.rewardId, reward.id));

    if (locScopes.length > 0 && !locScopes.some((l) => l.locationId === params.locationId)) {
      throw new Error("Reward cannot be redeemed at this location");
    }

    // 3. Lock balance row FOR UPDATE
    const [balanceRow] = await tx
      .select()
      .from(membershipBalances)
      .where(eq(membershipBalances.membershipId, redemption.membershipId))
      .for("update");

    if (!balanceRow || balanceRow.balance < redemption.costPoints) {
      throw new Error(
        `INSUFFICIENT_BALANCE: Member balance (${balanceRow?.balance || 0}) is less than reward cost (${redemption.costPoints})`
      );
    }

    // 4. Insert ledger_entries (Negative delta)
    const [entry] = await tx
      .insert(ledgerEntries)
      .values({
        tenantId: ctx.tenantId!,
        membershipId: redemption.membershipId,
        type: "redeem",
        pointsDelta: -redemption.costPoints,
        rewardId: reward.id,
        redemptionId: redemption.id,
        locationId: params.locationId,
        actorUserId: ctx.userId,
        idempotencyKey: params.idempotencyKey,
      })
      .returning();

    // 5. Update membership_balances
    const newBalance = balanceRow.balance - redemption.costPoints;
    const newLifetimeRedeemed = balanceRow.lifetimeRedeemed + redemption.costPoints;

    await tx
      .update(membershipBalances)
      .set({
        balance: newBalance,
        lifetimeRedeemed: newLifetimeRedeemed,
        updatedAt: new Date(),
      })
      .where(eq(membershipBalances.membershipId, redemption.membershipId));

    // 6. Update redemption status to confirmed
    await tx
      .update(redemptions)
      .set({
        status: "confirmed",
        confirmedBy: ctx.userId,
        confirmedAt: new Date(),
        locationId: params.locationId,
        ledgerEntryId: entry.id,
      })
      .where(eq(redemptions.id, redemption.id));

    // 7. Increment reward quantity redeemed
    await tx
      .update(rewards)
      .set({
        quantityRedeemed: reward.quantityRedeemed + 1,
      })
      .where(eq(rewards.id, reward.id));

    return {
      redemptionId: redemption.id,
      membershipId: redemption.membershipId,
      pointsDeducted: redemption.costPoints,
      newBalance,
      rewardTitle: reward.title,
    };
  });

  await notifyRedemption(result.membershipId, result.rewardTitle, result.pointsDeducted, result.newBalance);
  return result;
}

// ==========================================
// Spending points at the counter
// ==========================================

export type RedeemForMemberParams = {
  membershipId: string;
  locationId?: string;
  idempotencyKey: string;
} & (
  /** A reward from the points menu, e.g. "Free Tea — 100 points" */
  | { rewardId: string }
  /** Anything else staff choose to give, ideally picked from the menu, for points they set */
  | { productId?: string; title?: string; costPoints: number; note?: string }
);

export interface RedeemForMemberResult {
  entryId: string;
  title: string;
  pointsDeducted: number;
  newBalance: number;
  isDuplicate: boolean;
}

/**
 * Staff or the owner spend a customer's points in one step: either on a points-menu reward,
 * or on something they choose from their own menu when nothing on the points menu fits.
 */
export async function redeemForMember(
  ctx: RequestContext,
  params: RedeemForMemberParams
): Promise<RedeemForMemberResult> {
  assertCan(ctx, "ledger.redeem", params.locationId ? { locationId: params.locationId } : undefined);
  if (!ctx.tenantId) throw new Error("tenantId required");
  const tenantId = ctx.tenantId;

  const result = await db.transaction(async (tx) => {
    const [tenant] = await tx
      .select({ status: tenants.status })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!tenant || tenant.status !== "active") {
      throw new Error("TENANT_SUSPENDED: Business account is suspended");
    }
    if (params.locationId) await assertOpenLocation(tx, tenantId, params.locationId);

    // A retried request (double tap, flaky network) returns the first result instead of charging twice
    const [previous] = await tx
      .select({ id: ledgerEntries.id, pointsDelta: ledgerEntries.pointsDelta, note: ledgerEntries.note })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.tenantId, tenantId), eq(ledgerEntries.idempotencyKey, params.idempotencyKey)))
      .limit(1);
    if (previous) {
      const [bal] = await tx
        .select({ balance: membershipBalances.balance })
        .from(membershipBalances)
        .where(eq(membershipBalances.membershipId, params.membershipId))
        .limit(1);
      return {
        entryId: previous.id,
        title: previous.note ?? "Reward",
        pointsDeducted: -previous.pointsDelta,
        newBalance: bal?.balance ?? 0,
        isDuplicate: true,
      };
    }

    const [membership] = await tx
      .select({ id: memberships.id, status: memberships.status })
      .from(memberships)
      .where(and(eq(memberships.id, params.membershipId), eq(memberships.tenantId, tenantId)))
      .limit(1);
    if (!membership) throw new Error("Customer not found for this business");
    if (membership.status !== "active") {
      throw new Error(`MEMBERSHIP_SUSPENDED: Membership is ${membership.status}`);
    }

    let title: string;
    let cost: number;
    let reward: typeof rewards.$inferSelect | undefined;
    let note: string | null = null;

    if ("rewardId" in params) {
      [reward] = await tx
        .select()
        .from(rewards)
        .where(and(eq(rewards.id, params.rewardId), eq(rewards.tenantId, tenantId)))
        .for("update")
        .limit(1);
      if (!reward || reward.status !== "active") throw new Error("This reward isn't available right now");

      const now = new Date();
      if (reward.startsAt && reward.startsAt > now) throw new Error("REWARD_NOT_ACTIVE: This reward hasn't started yet");
      if (reward.endsAt && reward.endsAt < now) throw new Error("REWARD_EXPIRED: This reward has ended");
      if (reward.quantityTotal && reward.quantityRedeemed >= reward.quantityTotal) {
        throw new Error("This reward has run out");
      }

      if (params.locationId) {
        const scopes = await tx
          .select({ locationId: rewardLocations.locationId })
          .from(rewardLocations)
          .where(eq(rewardLocations.rewardId, reward.id));
        if (scopes.length > 0 && !scopes.some((l) => l.locationId === params.locationId)) {
          throw new Error("This reward can't be given at this location");
        }
      }

      if (reward.perMemberLimit) {
        const [used] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(redemptions)
          .where(
            and(
              eq(redemptions.membershipId, membership.id),
              eq(redemptions.rewardId, reward.id),
              eq(redemptions.status, "confirmed")
            )
          );
        if (used.count >= reward.perMemberLimit) {
          throw new Error(`This customer has already had this reward the maximum ${reward.perMemberLimit} time(s)`);
        }
      }

      title = reward.title;
      cost = reward.costPoints;
    } else {
      cost = params.costPoints;
      if (!Number.isInteger(cost) || cost < 1 || cost > 1_000_000) {
        throw new Error("Enter how many points this costs (a whole number above 0)");
      }
      let productName: string | null = null;
      if (params.productId) {
        const [product] = await tx
          .select({ name: products.name })
          .from(products)
          .where(and(eq(products.id, params.productId), eq(products.tenantId, tenantId)))
          .limit(1);
        if (!product) throw new Error("That menu item wasn't found");
        productName = product.name;
      }
      title = (params.title?.trim() || (productName ? `Free ${productName}` : "")).slice(0, 200);
      if (!title) throw new Error("Pick an item from the menu or type what you're giving");
      note = params.note?.trim().slice(0, 300) || null;
    }

    const [balanceRow] = await tx
      .select()
      .from(membershipBalances)
      .where(and(eq(membershipBalances.membershipId, membership.id), eq(membershipBalances.tenantId, tenantId)))
      .for("update");
    const balance = balanceRow?.balance ?? 0;
    if (!balanceRow || balance < cost) {
      throw new Error(
        `INSUFFICIENT_BALANCE: ${title} costs ${cost} points, but this customer has ${balance}. They need ${cost - balance} more.`
      );
    }

    // Points-menu rewards keep a redemption record so per-customer limits and stock stay accurate
    let redemptionId: string | null = null;
    if (reward) {
      const { codeHash, codeLast4 } = generateRedemptionCode();
      const [redemption] = await tx
        .insert(redemptions)
        .values({
          tenantId,
          membershipId: membership.id,
          rewardId: reward.id,
          rewardVersion: reward.version,
          costPoints: cost,
          status: "confirmed",
          codeHash,
          codeLast4,
          expiresAt: new Date(),
          locationId: params.locationId ?? null,
          confirmedBy: ctx.userId,
          confirmedAt: new Date(),
        })
        .returning({ id: redemptions.id });
      redemptionId = redemption.id;
    }

    const [entry] = await tx
      .insert(ledgerEntries)
      .values({
        tenantId,
        membershipId: membership.id,
        type: "redeem",
        pointsDelta: -cost,
        rewardId: reward?.id ?? null,
        redemptionId,
        locationId: params.locationId ?? null,
        actorUserId: ctx.userId,
        reasonCode: reward ? null : "staff_choice",
        note: note ? `${title} — ${note}` : title,
        idempotencyKey: params.idempotencyKey,
      })
      .returning({ id: ledgerEntries.id });

    if (redemptionId) {
      await tx.update(redemptions).set({ ledgerEntryId: entry.id }).where(eq(redemptions.id, redemptionId));
    }
    if (reward) {
      await tx
        .update(rewards)
        .set({ quantityRedeemed: sql`${rewards.quantityRedeemed} + 1` })
        .where(eq(rewards.id, reward.id));
    }

    const newBalance = balance - cost;
    await tx
      .update(membershipBalances)
      .set({
        balance: newBalance,
        lifetimeRedeemed: balanceRow.lifetimeRedeemed + cost,
        updatedAt: new Date(),
      })
      .where(eq(membershipBalances.membershipId, membership.id));

    await logAuditEvent(
      ctx,
      {
        action: "ledger.points_spent",
        targetType: "membership",
        targetId: membership.id,
        metadata: { title, cost, rewardId: reward?.id ?? null, newBalance },
      },
      tx
    );

    return { entryId: entry.id, title, pointsDeducted: cost, newBalance, isDuplicate: false };
  });

  if (!result.isDuplicate) {
    await notifyRedemption(params.membershipId, result.title, result.pointsDeducted, result.newBalance);
  }
  return result;
}

// ==========================================
// Adjustments & Reversals (Section 8.5)
// ==========================================

export async function adjustBalance(
  ctx: RequestContext,
  params: {
    membershipId: string;
    pointsDelta: number;
    reasonCode: "goodwill" | "correction" | "fraud_removal" | "other";
    note: string;
    idempotencyKey: string;
  }
) {
  assertCan(ctx, "ledger.adjust");
  if (!ctx.tenantId) throw new Error("tenantId required");
  if (params.pointsDelta === 0) throw new Error("Enter how many points to add or remove");

  const result = await db.transaction(async (tx) => {
    // Scoped to the caller's business: an owner can never adjust another business's customer.
    const [lockedBalance] = await tx
      .select()
      .from(membershipBalances)
      .where(
        and(
          eq(membershipBalances.membershipId, params.membershipId),
          eq(membershipBalances.tenantId, ctx.tenantId!)
        )
      )
      .for("update");

    if (!lockedBalance) throw new Error("Customer not found for this business");

    const newBalance = lockedBalance.balance + params.pointsDelta;
    if (newBalance < 0) {
      throw new Error(
        `This customer only has ${lockedBalance.balance} points, so you can remove at most ${lockedBalance.balance}.`
      );
    }

    const [entry] = await tx
      .insert(ledgerEntries)
      .values({
        tenantId: ctx.tenantId!,
        membershipId: params.membershipId,
        type: "adjust",
        pointsDelta: params.pointsDelta,
        actorUserId: ctx.userId,
        reasonCode: params.reasonCode,
        note: params.note,
        idempotencyKey: params.idempotencyKey,
      })
      .returning();

    const newLifetimeEarned =
      params.pointsDelta > 0
        ? lockedBalance.lifetimeEarned + params.pointsDelta
        : lockedBalance.lifetimeEarned;

    await tx
      .update(membershipBalances)
      .set({
        balance: newBalance,
        lifetimeEarned: newLifetimeEarned,
        updatedAt: new Date(),
      })
      .where(eq(membershipBalances.membershipId, params.membershipId));

    await logAuditEvent(
      ctx,
      {
        action: "ledger.balance_adjusted",
        targetType: "membership",
        targetId: params.membershipId,
        reason: `${params.reasonCode}: ${params.note}`,
        metadata: { delta: params.pointsDelta, newBalance },
      },
      tx
    );

    return {
      entryId: entry.id,
      newBalance,
    };
  });

  if (params.pointsDelta > 0) {
    await notifyRewardsUnlocked(params.membershipId, ctx.tenantId!, result.newBalance - params.pointsDelta, result.newBalance);
  }
  return result;
}

export async function reverseTransaction(
  ctx: RequestContext,
  params: {
    ledgerEntryId: string;
    reasonCode: "correction" | "goodwill" | "fraud_removal" | "other";
    note: string;
    idempotencyKey: string;
  }
) {
  assertCan(ctx, "ledger.reverse");
  if (!ctx.tenantId) throw new Error("tenantId required");

  return await db.transaction(async (tx) => {
    const [original] = await tx
      .select()
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.id, params.ledgerEntryId),
          eq(ledgerEntries.tenantId, ctx.tenantId!)
        )
      )
      .limit(1);

    if (!original) throw new Error("Original transaction not found");

    // Check if already reversed
    const [existingReversal] = await tx
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.relatedEntryId, original.id))
      .limit(1);

    if (existingReversal) {
      throw new Error("Transaction has already been reversed");
    }

    const [lockedBalance] = await tx
      .select()
      .from(membershipBalances)
      .where(eq(membershipBalances.membershipId, original.membershipId))
      .for("update");

    // Offsetting points delta
    let effectiveDelta = -original.pointsDelta;
    let newBalance = lockedBalance.balance + effectiveDelta;
    let shortfallNote = params.note;

    // Per Section 8.5 & Decision 8: Balance must never go below 0 (clamp reduction to current balance)
    if (newBalance < 0) {
      shortfallNote = `${params.note} [Shortfall capped: original reversal of ${effectiveDelta} points clamped to -${lockedBalance.balance}]`;
      effectiveDelta = -lockedBalance.balance;
      newBalance = 0;
    }

    const [reversalEntry] = await tx
      .insert(ledgerEntries)
      .values({
        tenantId: ctx.tenantId!,
        membershipId: original.membershipId,
        type: "reverse",
        pointsDelta: effectiveDelta,
        relatedEntryId: original.id,
        locationId: original.locationId,
        actorUserId: ctx.userId,
        reasonCode: params.reasonCode,
        note: shortfallNote,
        idempotencyKey: params.idempotencyKey,
      })
      .returning();

    await tx
      .update(membershipBalances)
      .set({
        balance: newBalance,
        updatedAt: new Date(),
      })
      .where(eq(membershipBalances.membershipId, original.membershipId));

    // If reversing a confirmed redemption, restore reward stock
    if (original.type === "redeem" && original.rewardId) {
      await tx
        .update(rewards)
        .set({
          quantityRedeemed: sql`GREATEST(0, quantity_redeemed - 1)`,
        })
        .where(eq(rewards.id, original.rewardId));
    }

    await logAuditEvent(
      ctx,
      {
        action: "ledger.transaction_reversed",
        targetType: "ledger_entry",
        targetId: original.id,
        reason: shortfallNote,
      },
      tx
    );

    return {
      reversalEntryId: reversalEntry.id,
      newBalance,
    };
  });
}

// ==========================================
// Reconciliation & Expiry Jobs
// ==========================================

export async function reconcileBalances(tenantId?: string) {
  const baseQuery = db
    .select({
      membershipId: ledgerEntries.membershipId,
      calculatedSum: sql<number>`SUM(points_delta)::int`,
      recordedBalance: membershipBalances.balance,
      tenantId: ledgerEntries.tenantId,
    })
    .from(ledgerEntries)
    .innerJoin(
      membershipBalances,
      eq(ledgerEntries.membershipId, membershipBalances.membershipId)
    );

  const query = tenantId
    ? baseQuery.where(eq(ledgerEntries.tenantId, tenantId))
    : baseQuery;

  const rows = await query.groupBy(
    ledgerEntries.membershipId,
    membershipBalances.balance,
    ledgerEntries.tenantId
  );

  const discrepancies: Array<{
    membershipId: string;
    calculated: number;
    recorded: number;
    tenantId: string;
  }> = [];

  for (const row of rows) {
    if (row.calculatedSum !== row.recordedBalance) {
      discrepancies.push({
        membershipId: row.membershipId,
        calculated: row.calculatedSum,
        recorded: row.recordedBalance,
        tenantId: row.tenantId,
      });

      sentry.captureMessage(
        `Balance reconciliation mismatch for member ${row.membershipId}: ledger sum=${row.calculatedSum}, balance=${row.recordedBalance}`,
        "error",
        { membershipId: row.membershipId, tenantId: row.tenantId }
      );
    }
  }

  return {
    reconciledCount: rows.length,
    discrepancies,
    isConsistent: discrepancies.length === 0,
  };
}

export async function expirePendingRedemptions(executor: DbExecutor = db) {
  const now = new Date();
  const expired = await executor
    .update(redemptions)
    .set({ status: "expired" })
    .where(
      and(
        eq(redemptions.status, "pending"),
        lt(redemptions.expiresAt, now)
      )
    )
    .returning({ id: redemptions.id });

  return { expiredCount: expired.length };
}
