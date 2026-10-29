import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { resendEmailVerification } from "@/server/services/verification";

/** Signed-in users ask for a fresh confirmation link. */
export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, {});
  if ("response" in guard) return guard.response;

  try {
    const result = await resendEmailVerification(guard.ctx.userId);
    return NextResponse.json({ data: result });
  } catch (err) {
    const limited = err instanceof Error && err.message.startsWith("RATE_LIMITED");
    return NextResponse.json(
      {
        error: {
          code: limited ? "RATE_LIMITED" : "RESEND_FAILED",
          message: limited ? "We've sent a few already. Wait 10 minutes, then try again." : "Couldn't send the email. Try again.",
        },
      },
      { status: limited ? 429 : 400 }
    );
  }
}
