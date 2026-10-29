import { NextRequest, NextResponse } from "next/server";
import { guardCronRequest } from "@/server/auth/cron-guard";
import { runDailyLoyaltyJobs } from "@/server/services/loyalty-jobs";
import { processOutbox } from "@/server/services/email";

/** Daily: birthday bonuses, expiry warnings and expiry; then sends the emails it queued. */
async function handleRequest(request: NextRequest) {
  const denied = guardCronRequest(request);
  if (denied) return denied;
  const summary = await runDailyLoyaltyJobs();
  const emails = await processOutbox(100);
  return NextResponse.json({ success: true, ...summary, emails });
}

export { handleRequest as GET, handleRequest as POST };
