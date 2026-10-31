import { NextRequest, NextResponse } from "next/server";
import { guardCronRequest } from "@/server/auth/cron-guard";
import { processOutbox } from "@/server/services/email";
import { runDueCampaigns } from "@/server/services/campaigns";
import { deliverDueWebhooks } from "@/server/services/webhooks";

async function handleRequest(request: NextRequest) {
  const denied = guardCronRequest(request);
  if (denied) return denied;

  const batchSize = request.nextUrl.searchParams.get("batchSize")
    ? parseInt(request.nextUrl.searchParams.get("batchSize")!, 10)
    : 50;

  // Offers scheduled for now or earlier go out first, then the outbox is worked through
  const campaigns = await runDueCampaigns();
  const result = await processOutbox(batchSize);
  // Webhooks that failed earlier are retried here too
  const webhooks = await deliverDueWebhooks();
  return NextResponse.json({ success: true, ...result, campaignsSent: campaigns.sent, webhooksAttempted: webhooks.attempted });
}

export { handleRequest as GET, handleRequest as POST };

