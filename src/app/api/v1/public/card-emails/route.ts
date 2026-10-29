import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setCardEmailsByLink } from "@/server/services/notifications";
import { stopOffersByLink } from "@/server/services/campaigns";

const bodySchema = z.object({
  m: z.string().uuid(),
  t: z.string().min(16).max(64),
  on: z.boolean(),
  kind: z.enum(["card", "offers"]).default("card"),
});

/** The "Stop these emails" link: works without signing in because the link itself is signed. */
export async function POST(request: NextRequest) {
  try {
    const { m, t, on, kind } = bodySchema.parse(await request.json());
    // Offers can only be switched off by link; saying yes again happens from the customer's account
    const data = kind === "offers" ? await stopOffersByLink(m, t) : await setCardEmailsByLink(m, t, on);
    return NextResponse.json({ data: { ...data, kind } });
  } catch (err) {
    const message = err instanceof z.ZodError ? "This link is incomplete." : err instanceof Error ? err.message : "Couldn't change your email settings.";
    return NextResponse.json({ error: { code: "CARD_EMAILS_FAILED", message } }, { status: 400 });
  }
}
