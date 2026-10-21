import { NextRequest, NextResponse } from "next/server";
import { joinProgramme } from "@/server/services/member";
import { createSession } from "@/server/auth";
import { checkJoinRateLimit, getClientIp, RateLimitError, rateLimitResponse } from "@/server/security/rate-limit";
import { z } from "zod";

const joinSchema = z.object({
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  email: z.string().email("Valid email required"),
  password: z.string().min(6, "Password must be at least 6 characters").optional(),
  name: z.string().optional(),
  marketingOptIn: z.boolean().optional(),
  locationPublicId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request);
    await checkJoinRateLimit(clientIp);

    const body = await request.json();
    const validated = joinSchema.parse(body);

    const result = await joinProgramme(validated);

    // Create customer session
    const session = await createSession(result.membership.userId, false);

    const response = NextResponse.json({ data: result });
    response.cookies.set("loyalty_session", session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: session.expiresAt,
      path: "/",
    });

    return response;
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }
    const msg = err instanceof Error ? err.message : "Failed to join programme";
    const isDuplicate = msg.toLowerCase().includes("already exists");
    return NextResponse.json(
      {
        error: {
          code: isDuplicate ? "ACCOUNT_ALREADY_EXISTS" : "JOIN_FAILED",
          message: msg,
        },
      },
      { status: isDuplicate ? 409 : 400 }
    );
  }
}

