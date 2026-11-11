import { db } from "../db";
import { emitEvent } from "./events";
import { rewards, rewardLocations, programmes, tenants, products, redemptions } from "../db/schema";
import { RequestContext, assertCan } from "../security/permissions";
import { logAuditEvent } from "./audit";
import { eq, and, asc, count, getTableColumns, gt, sql } from "drizzle-orm";
import { z } from "zod";

export const createRewardSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  productId: z.string().uuid().optional(),
  type: z.enum(["free_item", "discount", "upgrade", "fixed_value", "custom"]).default("free_item"),
  costPoints: z.number().int().min(1, "Cost must be at least 1 point/stamp"),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  quantityTotal: z.number().int().min(1).optional(),
  perMemberLimit: z.number().int().min(1).optional(),
  locationIds: z.array(z.string().uuid()).optional(),
  // FR-066: how long a claim holds its points and stock, and whether points can be put towards it part by part
  holdMinutes: z.number().int().min(1, "Hold for at least 1 minute").max(1440, "Hold for 24 hours at most").default(10),
  allowPartial: z.boolean().default(false),
  valueMinor: z.number().int().min(1).optional(),
  minPartialPoints: z.number().int().min(1).optional(),
});

export type CreateRewardInput = z.input<typeof createRewardSchema>;

/** Partial use needs to know what the whole reward is worth and the smallest amount of points allowed. */
function assertPartialRules(r: { allowPartial: boolean; costPoints: number; valueMinor?: number | null; minPartialPoints?: number | null }) {
  if (!r.allowPartial) return;
  if (!r.valueMinor) throw new Error("Say what the whole reward is worth, so a part of it can be given.");
  if (!r.minPartialPoints) throw new Error("Set the smallest number of points a customer can use.");
  if (r.minPartialPoints >= r.costPoints) throw new Error("The smallest part must be less than the full cost.");
}

/** Confirms a menu item belongs to this business before a reward points at it. */
async function assertOwnProduct(tenantId: string, productId: string) {
  const [product] = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
    .limit(1);
  if (!product) throw new Error("That menu item wasn't found");
  return product;
}

export async function createReward(ctx: RequestContext, input: CreateRewardInput) {
  assertCan(ctx, "reward.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");

  // Check tier limit: maxActiveRewards (A18 / FR-011)
  const [tenant] = await db
    .select({ limits: tenants.limits })
    .from(tenants)
    .where(eq(tenants.id, ctx.tenantId))
    .limit(1);

  const maxActiveRewards = (tenant?.limits as Record<string, unknown> | null)?.maxActiveRewards;
  if (typeof maxActiveRewards === "number" && maxActiveRewards > 0) {
    const [rewardCount] = await db
      .select({ count: count() })
      .from(rewards)
      .where(and(eq(rewards.tenantId, ctx.tenantId), eq(rewards.status, "active")));

    if (Number(rewardCount?.count ?? 0) >= maxActiveRewards) {
      throw new Error(
        `Active reward limit reached for your plan (maximum: ${maxActiveRewards}). Upgrade your plan to create more rewards.`
      );
    }
  }

  const validated = createRewardSchema.parse(input);
  if (validated.startsAt && validated.endsAt && validated.endsAt <= validated.startsAt) {
    throw new Error("The end date must be after the start date");
  }
  if (validated.productId) await assertOwnProduct(ctx.tenantId, validated.productId);
  assertPartialRules(validated);

  const [prog] = await db
    .select({ id: programmes.id })
    .from(programmes)
    .where(eq(programmes.tenantId, ctx.tenantId))
    .limit(1);

  if (!prog) throw new Error("Programme not found for tenant");

  const created = await db.transaction(async (tx) => {
    const [newReward] = await tx
      .insert(rewards)
      .values({
        tenantId: ctx.tenantId!,
        programmeId: prog.id,
        version: 1,
        title: validated.title,
        description: validated.description || null,
        imageUrl: validated.imageUrl || null,
        productId: validated.productId || null,
        type: validated.type,
        costPoints: validated.costPoints,
        startsAt: validated.startsAt || null,
        endsAt: validated.endsAt || null,
        quantityTotal: validated.quantityTotal || null,
        perMemberLimit: validated.perMemberLimit || null,
        holdMinutes: validated.holdMinutes,
        allowPartial: validated.allowPartial,
        valueMinor: validated.valueMinor ?? null,
        minPartialPoints: validated.allowPartial ? (validated.minPartialPoints ?? null) : null,
        status: "active",
      })
      .returning();

    if (validated.locationIds && validated.locationIds.length > 0) {
      await tx.insert(rewardLocations).values(
        validated.locationIds.map((locId) => ({
          rewardId: newReward.id,
          locationId: locId,
        }))
      );
    }

    await logAuditEvent(
      ctx,
      {
        action: "reward.created",
        targetType: "reward",
        targetId: newReward.id,
        metadata: { title: validated.title, costPoints: validated.costPoints },
      },
      tx
    );

    return newReward;
  });
  await emitEvent(ctx.tenantId, "reward.created", { rewardId: created.id, title: created.title, costPoints: created.costPoints });
  return created;
}

export async function updateReward(
  ctx: RequestContext,
  rewardId: string,
  input: Omit<Partial<CreateRewardInput>, "productId" | "startsAt" | "endsAt" | "quantityTotal" | "perMemberLimit" | "valueMinor" | "minPartialPoints"> & {
    productId?: string | null;
    startsAt?: Date | null;
    endsAt?: Date | null;
    quantityTotal?: number | null;
    perMemberLimit?: number | null;
    valueMinor?: number | null;
    minPartialPoints?: number | null;
    status?: "active" | "paused" | "archived";
  }
) {
  assertCan(ctx, "reward.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");
  if (input.productId) await assertOwnProduct(ctx.tenantId, input.productId);

  const [existing] = await db
    .select()
    .from(rewards)
    .where(and(eq(rewards.id, rewardId), eq(rewards.tenantId, ctx.tenantId)))
    .limit(1);

  if (!existing) throw new Error("Reward not found");

  const nextVersion = existing.version + 1;

  const next = {
    allowPartial: input.allowPartial ?? existing.allowPartial,
    costPoints: input.costPoints ?? existing.costPoints,
    valueMinor: input.valueMinor !== undefined ? input.valueMinor : existing.valueMinor,
    minPartialPoints: input.minPartialPoints !== undefined ? input.minPartialPoints : existing.minPartialPoints,
  };
  if (input.holdMinutes !== undefined && (input.holdMinutes < 1 || input.holdMinutes > 1440)) {
    throw new Error("Hold a claim for between 1 minute and 24 hours");
  }
  assertPartialRules(next);

  const [updated] = await db
    .update(rewards)
    .set({
      holdMinutes: input.holdMinutes ?? existing.holdMinutes,
      allowPartial: next.allowPartial,
      valueMinor: next.valueMinor,
      minPartialPoints: next.allowPartial ? next.minPartialPoints : null,
      title: input.title ?? existing.title,
      description: input.description !== undefined ? input.description : existing.description,
      imageUrl: input.imageUrl !== undefined ? input.imageUrl : existing.imageUrl,
      productId: input.productId !== undefined ? input.productId : existing.productId,
      type: input.type ?? existing.type,
      costPoints: input.costPoints ?? existing.costPoints,
      startsAt: input.startsAt !== undefined ? input.startsAt : existing.startsAt,
      endsAt: input.endsAt !== undefined ? input.endsAt : existing.endsAt,
      quantityTotal: input.quantityTotal !== undefined ? input.quantityTotal : existing.quantityTotal,
      perMemberLimit: input.perMemberLimit !== undefined ? input.perMemberLimit : existing.perMemberLimit,
      status: input.status ?? existing.status,
      version: nextVersion,
    })
    .where(and(eq(rewards.id, rewardId), eq(rewards.tenantId, ctx.tenantId)))
    .returning();

  await logAuditEvent(ctx, {
    action: "reward.updated",
    targetType: "reward",
    targetId: updated.id,
    metadata: { version: nextVersion, changes: input },
  });
  await emitEvent(ctx.tenantId, "reward.updated", { rewardId: updated.id, version: nextVersion });

  return updated;
}

export type RewardItem = typeof rewards.$inferSelect & { productName: string | null };
export type RewardWithEligibility = RewardItem & {
  eligible: boolean;
  pointsShortfall: number;
  /** Why it can't be claimed right now apart from points, in plain words (FR-062). */
  unavailableReason: string | null;
  /** How many times this customer has had it. */
  timesRedeemed: number;
  /** The customer's points minus those held by their own claims that haven't been used or lapsed yet. */
  availablePoints: number;
  /** Can be claimed whole right now (`eligible` is also true when only a partial use is possible). */
  fullyEligible: boolean;
};

export async function getRewards(
  tenantId: string,
  options: { includeInactive?: boolean; memberBalance: number; membershipId?: string }
): Promise<RewardWithEligibility[]>;
export async function getRewards(
  tenantId: string,
  options?: { includeInactive?: boolean; memberBalance?: undefined }
): Promise<RewardItem[]>;
export async function getRewards(
  tenantId: string,
  options: { includeInactive?: boolean; memberBalance?: number; membershipId?: string } = {}
): Promise<RewardItem[] | RewardWithEligibility[]> {
  // Cheapest first, so customers see the next thing they can reach at the top
  const list = await db
    .select({ ...getTableColumns(rewards), productName: products.name })
    .from(rewards)
    .leftJoin(products, eq(products.id, rewards.productId))
    .where(
      options.includeInactive
        ? eq(rewards.tenantId, tenantId)
        : and(eq(rewards.tenantId, tenantId), eq(rewards.status, "active"))
    )
    .orderBy(asc(rewards.costPoints), asc(rewards.title));

  if (options.memberBalance !== undefined) {
    const now = new Date();
    const used = new Map<string, number>();
    // Claims that are still open hold their points and one unit of stock until they are used or lapse (FR-066)
    const onHold = new Map<string, { all: number; mine: number }>();
    let heldPoints = 0;
    if (options.membershipId) {
      const rows = await db
        .select({ rewardId: redemptions.rewardId, count: count() })
        .from(redemptions)
        .where(
          and(
            eq(redemptions.membershipId, options.membershipId),
            eq(redemptions.status, "confirmed"),
            eq(redemptions.isPartial, false)
          )
        )
        .groupBy(redemptions.rewardId);
      rows.forEach((r) => used.set(r.rewardId, Number(r.count)));

      const open = await db
        .select({
          rewardId: redemptions.rewardId,
          isPartial: redemptions.isPartial,
          costPoints: redemptions.costPoints,
          mine: sql<boolean>`${redemptions.membershipId} = ${options.membershipId}`,
        })
        .from(redemptions)
        .where(and(eq(redemptions.tenantId, tenantId), eq(redemptions.status, "pending"), gt(redemptions.expiresAt, now)));
      for (const o of open) {
        if (o.mine) heldPoints += o.costPoints;
        if (o.isPartial) continue;
        const entry = onHold.get(o.rewardId) ?? { all: 0, mine: 0 };
        entry.all += 1;
        if (o.mine) entry.mine += 1;
        onHold.set(o.rewardId, entry);
      }
    }
    const balance = options.memberBalance - heldPoints;
    const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

    return list
      // Rewards that ended a while ago just disappear; recently ended ones stay with a reason
      .filter((r) => !r.endsAt || now.getTime() - r.endsAt.getTime() < 7 * 24 * 60 * 60 * 1000)
      .map((r) => {
        const timesRedeemed = used.get(r.id) ?? 0;
        const held = onHold.get(r.id) ?? { all: 0, mine: 0 };
        let unavailableReason: string | null = null;
        if (r.startsAt && r.startsAt > now) unavailableReason = `Available from ${day(r.startsAt)}`;
        else if (r.endsAt && r.endsAt < now) unavailableReason = `Ended on ${day(r.endsAt)}`;
        else if (r.quantityTotal && r.quantityRedeemed >= r.quantityTotal) unavailableReason = "All gone for now";
        else if (r.quantityTotal && r.quantityRedeemed + held.all >= r.quantityTotal)
          unavailableReason = "On hold for other customers for a few minutes";
        else if (r.perMemberLimit && timesRedeemed + held.mine >= r.perMemberLimit)
          unavailableReason = r.perMemberLimit === 1 ? "You've already had this one" : `You've had this ${timesRedeemed + held.mine} times, the most allowed`;
        const enough = balance >= r.costPoints;
        const canPartial = r.allowPartial && !!r.valueMinor && !!r.minPartialPoints && balance >= r.minPartialPoints;
        return {
          ...r,
          eligible: (enough || canPartial) && !unavailableReason,
          fullyEligible: enough && !unavailableReason,
          availablePoints: balance,
          pointsShortfall: enough ? 0 : r.costPoints - balance,
          unavailableReason,
          timesRedeemed,
        };
      });
  }

  return list;
}
