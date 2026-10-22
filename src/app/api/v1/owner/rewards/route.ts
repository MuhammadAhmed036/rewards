import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { createReward, updateReward, getRewards, createRewardSchema } from "@/server/services/rewards";
import { z } from "zod";

const updateRewardBodySchema = z.object({
  id: z.string().uuid("Valid reward ID required"),
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  type: z.enum(["free_item", "discount", "upgrade", "fixed_value", "custom"]).optional(),
  costPoints: z.number().int().min(1).optional(),
  status: z.enum(["active", "paused", "archived"]).optional(),
  quantityTotal: z.number().int().min(1).nullable().optional(),
  perMemberLimit: z.number().int().min(1).nullable().optional(),
});

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  try {
    const list = await getRewards(guard.ctx.tenantId!, { includeInactive: true });
    return NextResponse.json({ data: list });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "LIST_REWARDS_FAILED",
          message: err instanceof Error ? err.message : "Failed to list rewards",
        },
      },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  try {
    const body = await request.json();
    const validated = createRewardSchema.parse(body);

    const reward = await createReward(guard.ctx, validated);
    return NextResponse.json({ data: reward }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "CREATE_REWARD_FAILED",
          message: err instanceof Error ? err.message : "Failed to create reward",
        },
      },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  try {
    const body = await request.json();
    const validated = updateRewardBodySchema.parse(body);

    const { id, ...updates } = validated;
    const updated = await updateReward(guard.ctx, id, updates as any);
    return NextResponse.json({ data: updated });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "UPDATE_REWARD_FAILED",
          message: err instanceof Error ? err.message : "Failed to update reward",
        },
      },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager"],
    requireTenant: true,
  });
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
    return NextResponse.json(
      {
        error: {
          code: "ARCHIVE_REWARD_FAILED",
          message: err instanceof Error ? err.message : "Failed to archive reward",
        },
      },
      { status: 400 }
    );
  }
}
