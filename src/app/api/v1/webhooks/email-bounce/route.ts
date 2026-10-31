import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardCronRequest } from "@/server/auth/cron-guard";
import { recordProviderReport } from "@/server/services/email-events";

const bodySchema = z.object({
  email: z.string().email(),
  type: z.enum(["bounce", "complaint"]),
});

/**
 * For a mail provider (or a forwarding rule) to report that an address bounced or marked an offer as spam.
 * Protected with the same secret as the scheduled jobs: send it as `Authorization: Bearer <CRON_SECRET>`.
 */
export async function POST(request: NextRequest) {
  const denied = guardCronRequest(request);
  if (denied) return denied;
  try {
    const { email, type } = bodySchema.parse(await request.json());
    return NextResponse.json({ data: await recordProviderReport(email, type) });
  } catch (err) {
    const message = err instanceof z.ZodError ? "Send {\"email\": \"...\", \"type\": \"bounce\" | \"complaint\"}." : "Could not record that report.";
    return NextResponse.json({ error: { code: "BAD_REQUEST", message } }, { status: 400 });
  }
}
