import { NextRequest, NextResponse } from "next/server";
import { scanAndClaimCampaignQr, getCampaignQrPublicInfo } from "@/server/services/campaign-qr";
import { requireOwnMembership } from "@/server/auth/customer-membership";
import { z } from "zod";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");
  const code = searchParams.get("code");

  if (!slug || !code) {
    return NextResponse.json(
      { error: { message: "Both slug and code query params are required" } },
      { status: 400 }
    );
  }

  try {
    const info = await getCampaignQrPublicInfo(slug, code);
    if (!info) {
      return NextResponse.json(
        { error: { message: "Promotional QR code not found" } },
        { status: 404 }
      );
    }
    return NextResponse.json({ data: info });
  } catch (err) {
    return NextResponse.json(
      { error: { message: err instanceof Error ? err.message : "Failed to load promo QR info" } },
      { status: 500 }
    );
  }
}

const claimSchema = z.object({
  tenantId: z.string().uuid("Invalid tenant ID"),
  code: z.string().min(1, "QR code required"),
  membershipId: z.string().uuid("Invalid membership ID"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = claimSchema.parse(body);

    const owned = await requireOwnMembership(request, validated.membershipId, validated.tenantId);
    if ("response" in owned) return owned.response;

    const result = await scanAndClaimCampaignQr(
      validated.tenantId,
      validated.code,
      validated.membershipId
    );

    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "CLAIM_FAILED",
          message: err instanceof Error ? err.message : "Failed to claim promotional QR code",
        },
      },
      { status: 400 }
    );
  }
}
