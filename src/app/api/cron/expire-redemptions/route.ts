import { NextRequest, NextResponse } from "next/server";
import { guardCronRequest } from "@/server/auth/cron-guard";
import { expirePendingRedemptions } from "@/server/services/ledger";

export async function POST(request: NextRequest) {
  const denied = guardCronRequest(request);
  if (denied) return denied;

  const result = await expirePendingRedemptions();
  return NextResponse.json({ success: true, ...result });
}

