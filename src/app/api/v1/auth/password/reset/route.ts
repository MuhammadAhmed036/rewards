import { NextRequest, NextResponse } from "next/server";
import { checkAuthIpRateLimit, RateLimitError, rateLimitResponse } from "@/server/security/rate-limit";
import { z } from "zod";
import { resetPassword } from "@/server/services/password-reset";

const bodySchema = z.object({
  token: z.string().min(10, "This reset link is incomplete. Open it from the email again."),
  password: z.string().max(200),
});

export async function POST(request: NextRequest) {
  try {
    await checkAuthIpRateLimit(request, "reset");
    const { token, password } = bodySchema.parse(await request.json().catch(() => ({})));
    await resetPassword(token, password);
    return NextResponse.json({ data: { reset: true } });
  } catch (err) {
    if (err instanceof RateLimitError) return rateLimitResponse(err);
    const message =
      err instanceof z.ZodError ? err.errors[0]?.message : err instanceof Error ? err.message : "Couldn't reset the password";
    return NextResponse.json({ error: { code: "RESET_FAILED", message } }, { status: 400 });
  }
}
