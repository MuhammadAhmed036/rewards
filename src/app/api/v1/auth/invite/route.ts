import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { acceptStaffInvitation, describeInvitation } from "@/server/services/staff";

/** Who invited you and as what, for the accept-invite page. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "";
  try {
    return NextResponse.json({ data: await describeInvitation(token) });
  } catch (err) {
    return NextResponse.json(
      { error: { code: "INVITE_INVALID", message: err instanceof Error ? err.message : "This invite isn't valid" } },
      { status: 400 }
    );
  }
}

const acceptSchema = z.object({
  token: z.string().min(10),
  password: z.string().max(200),
  name: z.string().trim().max(80).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = acceptSchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json({ data: await acceptStaffInvitation(body.token, body) });
  } catch (err) {
    const message = err instanceof z.ZodError ? "This invite link is incomplete." : err instanceof Error ? err.message : "Couldn't accept the invite";
    return NextResponse.json({ error: { code: "INVITE_ACCEPT_FAILED", message } }, { status: 400 });
  }
}
