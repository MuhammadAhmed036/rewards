import { NextRequest, NextResponse } from "next/server";
import { submitSupportReport } from "@/server/services/support";
import { checkFeedbackRateLimit, getClientIp, RateLimitError, rateLimitResponse } from "@/server/security/rate-limit";
import { z } from "zod";

const supportReportSchema = z.object({
  tenantId: z.string().uuid("Invalid tenant ID"),
  membershipId: z.string().uuid().optional(),
  ledgerEntryId: z.string().uuid().optional(),
  message: z.string().min(1, "Message is required").max(2000, "Message cannot exceed 2000 characters"),
  contactInfo: z.string().max(255).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = supportReportSchema.parse(body);

    const clientIp = getClientIp(request);
    await checkFeedbackRateLimit(validated.membershipId || clientIp);

    const report = await submitSupportReport(validated);
    return NextResponse.json({ success: true, data: report });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }
    return NextResponse.json(
      {
        error: {
          code: "SUPPORT_REPORT_FAILED",
          message: err instanceof Error ? err.message : "Failed to submit dispute report",
        },
      },
      { status: 400 }
    );
  }
}

