import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { requestRedemption } from "@/server/services/ledger";
import { db } from "@/server/db";
import { redemptions } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const redeemRequestSchema = z.object({
  membershipId: z.string().uuid(),
  rewardId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["customer", "owner", "manager", "staff"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  try {
    const body = await request.json();
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

