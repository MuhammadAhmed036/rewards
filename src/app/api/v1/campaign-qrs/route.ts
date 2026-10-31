import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { createCampaignQr, getCampaignQrs } from "@/server/services/campaign-qr";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().min(1, "Campaign title is required"),
  offerType: z.enum(["points_bonus", "stamps_bonus", "free_product", "discount_promo"]).default("points_bonus"),
  pointsToAward: z.number().int().min(0).optional(),
  requiredVisits: z.number().int().min(1).optional(),
  productId: z.string().uuid().optional(),
  productRewardName: z.string().optional(),
  discountPercent: z.number().int().min(0).max(100).optional(),
  validityDays: z.number().int().min(1).max(365).default(30),
  locationId: z.string().uuid().optional(),
});

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager", "staff", "platform_admin"],
  });
  if ("response" in guard) return guard.response;

  try {
    const list = await getCampaignQrs(guard.ctx, request);
    return NextResponse.json({ data: list });
  } catch (err) {
    return NextResponse.json(
      { error: { message: err instanceof Error ? err.message : "Failed to load promo QR codes" } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager", "staff", "platform_admin"],
  });
  if ("response" in guard) return guard.response;

  try {
    const body = await request.json().catch(() => ({}));
    const validated = createSchema.parse(body);

    const created = await createCampaignQr(guard.ctx, validated, request);
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: { message: err instanceof Error ? err.message : "Failed to create promo QR code" } },
      { status: 400 }
    );
  }
}

