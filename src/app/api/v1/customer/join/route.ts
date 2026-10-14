import { NextRequest, NextResponse } from "next/server";
import { joinProgramme } from "@/server/services/member";
import { createSession } from "@/server/auth";
import { z } from "zod";

const joinSchema = z.object({
  tenantSlug: z.string().min(1, "Tenant slug is required"),
  email: z.string().email("Valid email required"),
  name: z.string().optional(),
  marketingOptIn: z.boolean().optional(),
  locationPublicId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
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
    return NextResponse.json(
      {
        error: {
          code: "JOIN_FAILED",
          message: err instanceof Error ? err.message : "Failed to join programme",
        },
      },
      { status: 400 }
    );
  }
}
