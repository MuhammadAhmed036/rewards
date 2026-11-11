import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { cancelRedemptionRequest, requestRedemption } from "@/server/services/ledger";
import { db } from "@/server/db";
import { redemptions } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const redeemRequestSchema = z.object({
  membershipId: z.string().uuid(),
  rewardId: z.string().uuid(),
  /** Only for a reward that can be used in part: how many points to put towards it */
  points: z.number().int().positive().optional(),
});

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["customer", "owner", "manager", "staff"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  try {
    const body = await request.json().catch(() => ({}));
    const validated = redeemRequestSchema.parse(body);

    const result = await requestRedemption(guard.ctx, validated);
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "REDEMPTION_REQUEST_FAILED",
          message: err instanceof Error ? err.message : "Failed to request redemption",
        },
      },
      { status: 400 }
    );
  }
}

/** The customer gives the claim back, so its points and stock are free straight away. */
export async function DELETE(request: NextRequest) {
  const guard = await guardApiRequest(request, { allowedRoles: ["customer"], requireTenant: true });
  if ("response" in guard) return guard.response;
  const id = z.string().uuid().safeParse(request.nextUrl.searchParams.get("id"));
  if (!id.success) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Missing claim id" } }, { status: 400 });
  try {
    return NextResponse.json({ data: await cancelRedemptionRequest(guard.ctx, id.data) });
  } catch (err) {
    return NextResponse.json(
      { error: { code: "CANCEL_FAILED", message: err instanceof Error ? err.message : "Couldn't cancel that claim" } },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing redemption id" }, { status: 400 });
  }

  const [redemption] = await db
    .select({
      id: redemptions.id,
      status: redemptions.status,
      expiresAt: redemptions.expiresAt,
      confirmedAt: redemptions.confirmedAt,
    })
    .from(redemptions)
    .where(eq(redemptions.id, id))
    .limit(1);

  if (!redemption) {
    return NextResponse.json({ error: "Redemption not found" }, { status: 404 });
  }

  return NextResponse.json({ data: redemption });
}

