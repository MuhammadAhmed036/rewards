import { NextRequest, NextResponse } from "next/server";
import { guardCronRequest } from "@/server/auth/cron-guard";
import { processOutbox } from "@/server/services/email";

export async function POST(request: NextRequest) {
  const denied = guardCronRequest(request);
  if (denied) return denied;

  const batchSize = request.nextUrl.searchParams.get("batchSize")
    ? parseInt(request.nextUrl.searchParams.get("batchSize")!, 10)
    : 50;

  const result = await processOutbox(batchSize);
  return NextResponse.json({ success: true, ...result });
}

