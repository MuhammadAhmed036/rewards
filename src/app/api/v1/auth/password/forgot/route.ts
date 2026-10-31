import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requestPasswordReset, PasswordResetError } from "@/server/services/password-reset";

const bodySchema = z.object({
  email: z.string().email("Enter a valid email address"),
  role: z.enum(["customer", "staff", "owner"]).default("customer"),
});

export async function POST(request: NextRequest) {
  try {
    const { email, role } = bodySchema.parse(await request.json());
    await requestPasswordReset(email, role);
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
    if (err instanceof PasswordResetError) {
      const status = err.code === "NO_ACCOUNT" ? 404 : err.code === "WRONG_ACCOUNT_TYPE" ? 403 : 502;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status });
    }
    console.error("Password reset request failed:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Something went wrong. Please try again." } },
      { status: 500 }
    );
  }
}
