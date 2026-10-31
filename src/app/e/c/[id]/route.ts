import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { emailOutbox } from "@/server/db/schema";
import { recordEmailEvent } from "@/server/services/email-events";
import { getBaseUrl } from "@/lib/url";

/**
 * The button in an offer email points here. It notes the click and sends the person on to the shop's page.
 * The destination is read from the stored email, never from the link, so this can't be used to bounce
 * people to another site.
 */
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const fallback = getBaseUrl(request);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.redirect(fallback);

  const [row] = await db
    .select({ tenantId: emailOutbox.tenantId, payload: emailOutbox.payload, template: emailOutbox.template })
    .from(emailOutbox)
    .where(eq(emailOutbox.id, id))
    .limit(1);
  if (!row || row.template !== "campaign") return NextResponse.redirect(fallback);

  const payload = row.payload as { campaignId?: string; hubUrl?: string };
  await recordEmailEvent({ type: "click", tenantId: row.tenantId, outboxId: id, campaignId: payload.campaignId ?? null });
  return NextResponse.redirect(payload.hubUrl || fallback);
}
