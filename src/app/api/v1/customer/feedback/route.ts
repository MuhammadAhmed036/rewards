import { NextRequest, NextResponse } from "next/server";
import { submitFeedback } from "@/server/services/feedback";
import { checkFeedbackRateLimit, getClientIp, RateLimitError, rateLimitResponse } from "@/server/security/rate-limit";
import { z } from "zod";

const feedbackSchema = z.object({
  tenantId: z.string().uuid("Tenant ID required"),
  membershipId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  message: z.string().min(1).max(2000),
  contactBackOk: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = feedbackSchema.parse(body);

    const clientIp = getClientIp(request);
    const rateLimitIdentifier = validated.membershipId || clientIp;
    await checkFeedbackRateLimit(rateLimitIdentifier);

    const result = await submitFeedback(validated);
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }
    return NextResponse.json(
      {
        error: {
          code: "FEEDBACK_SUBMISSION_FAILED",
          message: err instanceof Error ? err.message : "Failed to submit feedback",
        },
      },
      { status: 400 }
    );
  }
}

