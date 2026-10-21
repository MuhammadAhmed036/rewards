import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { getCampaignQrReports } from "@/server/services/campaign-qr";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager", "staff", "platform_admin"],
  });
  if ("response" in guard) return guard.response;

  try {
    const reports = await getCampaignQrReports(guard.ctx);
    return NextResponse.json({ data: reports });
  } catch (err) {
    return NextResponse.json(
      { error: { message: err instanceof Error ? err.message : "Failed to load scan reports" } },
      { status: 500 }
    );
  }
}

