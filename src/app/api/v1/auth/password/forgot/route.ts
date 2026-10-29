import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestPasswordReset } from "@/server/services/password-reset";

const bodySchema = z.object({ email: z.string().email("Enter a valid email address") });

// Always answers the same way, so it can't reveal which emails have accounts.
export async function POST(request: NextRequest) {
  try {
    const { email } = bodySchema.parse(await request.json());
    await requestPasswordReset(email);
    return NextResponse.json({ data: { sent: true } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: { code: "BAD_REQUEST", message: err.errors[0]?.message } }, { status: 400 });
    }
    if (err instanceof Error && err.message.startsWith("RATE_LIMITED")) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many reset emails. Wait 10 minutes and try again." } },
        { status: 429 }
      );
    }
    console.error("Password reset request failed:", err);
    return NextResponse.json({ data: { sent: true } });
  }
}
