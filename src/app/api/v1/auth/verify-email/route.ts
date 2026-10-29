import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyEmailToken } from "@/server/services/verification";

const bodySchema = z.object({ token: z.string().min(10, "This link is incomplete. Open it from the email again.") });

export async function POST(request: NextRequest) {
  try {
    const { token } = bodySchema.parse(await request.json());
    const result = await verifyEmailToken(token);
    return NextResponse.json({ data: { verified: true, email: result.email } });
  } catch (err) {
    const message =
      err instanceof z.ZodError ? err.errors[0]?.message : err instanceof Error ? err.message : "Couldn't confirm the email";
    return NextResponse.json({ error: { code: "VERIFY_FAILED", message } }, { status: 400 });
  }
}
