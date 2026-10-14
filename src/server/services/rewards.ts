import { db } from "../db";
import { rewards, rewardLocations, programmes } from "../db/schema";
import { RequestContext, assertCan } from "../security/permissions";
import { logAuditEvent } from "./audit";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";

export const createRewardSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  type: z.enum(["free_item", "discount", "upgrade", "fixed_value", "custom"]).default("free_item"),
  costPoints: z.number().int().min(1, "Cost must be at least 1 point/stamp"),
  startsAt: z.date().optional(),
  endsAt: z.date().optional(),
  quantityTotal: z.number().int().min(1).optional(),
  perMemberLimit: z.number().int().min(1).optional(),
  locationIds: z.array(z.string().uuid()).optional(),
});

export type CreateRewardInput = z.infer<typeof createRewardSchema>;

export async function createReward(ctx: RequestContext, input: CreateRewardInput) {
  assertCan(ctx, "reward.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");

  const validated = createRewardSchema.parse(input);

  const [prog] = await db
    .select({ id: programmes.id })
    .from(programmes)
    .where(eq(programmes.tenantId, ctx.tenantId))
    .limit(1);

  if (!prog) throw new Error("Programme not found for tenant");

  return await db.transaction(async (tx) => {
    const [newReward] = await tx
      .insert(rewards)
      .values({
        tenantId: ctx.tenantId!,
        programmeId: prog.id,
        version: 1,
        title: validated.title,
        description: validated.description || null,
        imageUrl: validated.imageUrl || null,
        type: validated.type,
        costPoints: validated.costPoints,
        startsAt: validated.startsAt || null,
        endsAt: validated.endsAt || null,
        quantityTotal: validated.quantityTotal || null,
        perMemberLimit: validated.perMemberLimit || null,
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
}

export async function updateReward(
  ctx: RequestContext,
  rewardId: string,
  input: Partial<CreateRewardInput> & { status?: "active" | "paused" | "archived" }
) {
  assertCan(ctx, "reward.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");

  const [existing] = await db
    .select()
    .from(rewards)
    .where(and(eq(rewards.id, rewardId), eq(rewards.tenantId, ctx.tenantId)))
    .limit(1);

  if (!existing) throw new Error("Reward not found");

  const nextVersion = existing.version + 1;

  const [updated] = await db
    .update(rewards)
    .set({
      title: input.title ?? existing.title,
      description: input.description !== undefined ? input.description : existing.description,
      imageUrl: input.imageUrl !== undefined ? input.imageUrl : existing.imageUrl,
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

  return updated;
}

export type RewardItem = typeof rewards.$inferSelect;
export type RewardWithEligibility = RewardItem & {
  eligible: boolean;
  pointsShortfall: number;
};

export async function getRewards(
  tenantId: string,
  options: { includeInactive?: boolean; memberBalance: number }
): Promise<RewardWithEligibility[]>;
export async function getRewards(
  tenantId: string,
  options?: { includeInactive?: boolean; memberBalance?: undefined }
): Promise<RewardItem[]>;
export async function getRewards(
  tenantId: string,
  options: { includeInactive?: boolean; memberBalance?: number } = {}
): Promise<RewardItem[] | RewardWithEligibility[]> {
  const query = db
    .select()
    .from(rewards)
    .where(
      options.includeInactive
        ? eq(rewards.tenantId, tenantId)
        : and(eq(rewards.tenantId, tenantId), eq(rewards.status, "active"))
    )
    .orderBy(desc(rewards.costPoints));

  const list = await query;

  if (options.memberBalance !== undefined) {
    return list.map((r) => {
      const eligible = options.memberBalance! >= r.costPoints;
      const pointsShortfall = eligible ? 0 : r.costPoints - options.memberBalance!;
      return {
        ...r,
        eligible,
        pointsShortfall,
      };
    });
  }

  return list;
}
