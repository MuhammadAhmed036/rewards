import { NextRequest, NextResponse } from "next/server";
import { guardCronRequest } from "@/server/auth/cron-guard";
import { runRetentionCleanup } from "@/server/services/privacy";

async function handleRequest(request: NextRequest) {
  const denied = guardCronRequest(request);
  if (denied) return denied;

  const result = await runRetentionCleanup();
  return NextResponse.json({ success: true, ...result });
}

export { handleRequest as GET, handleRequest as POST };

