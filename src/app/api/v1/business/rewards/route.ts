import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { createReward, updateReward, getRewards, createRewardSchema } from "@/server/services/rewards";
import { z } from "zod";

// The points menu ("100 points = free tea"). Owners, managers and staff can all keep it up to date.
const ROLES = ["owner", "manager", "staff"] as const;

const updateRewardBodySchema = z.object({
  id: z.string().uuid("Valid reward ID required"),
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  productId: z.string().uuid().nullable().optional(),
  type: z.enum(["free_item", "discount", "upgrade", "fixed_value", "custom"]).optional(),
  costPoints: z.number().int().min(1).optional(),
  status: z.enum(["active", "paused", "archived"]).optional(),
  quantityTotal: z.number().int().min(1).nullable().optional(),
  perMemberLimit: z.number().int().min(1).nullable().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
});

function failure(code: string, err: unknown, fallback: string) {
  const message =
    err instanceof z.ZodError ? err.errors[0]?.message || fallback : err instanceof Error ? err.message : fallback;
  return NextResponse.json({ error: { code, message } }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, { allowedRoles: [...ROLES], requireTenant: true });
  if ("response" in guard) return guard.response;

  try {
    const list = await getRewards(guard.ctx.tenantId!, { includeInactive: true });
    return NextResponse.json({ data: list });
  } catch (err) {
    return failure("LIST_REWARDS_FAILED", err, "Failed to list rewards");
  }
}

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, { allowedRoles: [...ROLES], requireTenant: true });
  if ("response" in guard) return guard.response;

  try {
    const validated = createRewardSchema.parse(await request.json().catch(() => ({})));
    const reward = await createReward(guard.ctx, validated);
    return NextResponse.json({ data: reward }, { status: 201 });
  } catch (err) {
    return failure("CREATE_REWARD_FAILED", err, "Failed to create reward");
  }
}

export async function PATCH(request: NextRequest) {
  const guard = await guardApiRequest(request, { allowedRoles: [...ROLES], requireTenant: true });
  if ("response" in guard) return guard.response;

  try {
    const { id, ...updates } = updateRewardBodySchema.parse(await request.json().catch(() => ({})));
    const updated = await updateReward(guard.ctx, id, updates);
    return NextResponse.json({ data: updated });
  } catch (err) {
    return failure("UPDATE_REWARD_FAILED", err, "Failed to update reward");
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await guardApiRequest(request, { allowedRoles: [...ROLES], requireTenant: true });
  if ("response" in guard) return guard.response;

  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Reward id query parameter is required" } },
        { status: 400 }
      );
    }
    const archived = await updateReward(guard.ctx, id, { status: "archived" });
    return NextResponse.json({ data: archived });
  } catch (err) {
    return failure("ARCHIVE_REWARD_FAILED", err, "Failed to archive reward");
  }
}
