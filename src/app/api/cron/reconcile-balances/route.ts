import { NextRequest, NextResponse } from "next/server";
import { guardCronRequest } from "@/server/auth/cron-guard";
import { reconcileBalances } from "@/server/services/ledger";

export async function POST(request: NextRequest) {
  const denied = guardCronRequest(request);
  if (denied) return denied;

  const tenantId = request.nextUrl.searchParams.get("tenantId") || undefined;
  const result = await reconcileBalances(tenantId);
  return NextResponse.json({ success: true, ...result });
}

