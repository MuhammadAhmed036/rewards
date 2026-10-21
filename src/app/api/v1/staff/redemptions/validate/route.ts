import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { validateRedemptionCode } from "@/server/services/ledger";
import { checkRedemptionValidateRateLimit, RateLimitError, rateLimitResponse } from "@/server/security/rate-limit";
import { z } from "zod";

const validateSchema = z.object({
  code: z.string().min(1, "Redemption code is required"),
});

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager", "staff"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  try {
    await checkRedemptionValidateRateLimit(guard.ctx.userId);

    const body = await request.json();
    const validated = validateSchema.parse(body);

    const result = await validateRedemptionCode(guard.ctx, validated.code);
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_FAILED",
          message: err instanceof Error ? err.message : "Code validation failed",
        },
      },
      { status: 400 }
    );
  }
}

