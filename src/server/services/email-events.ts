import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { emailEvents, emailOutbox, emailSuppressions } from "../db/schema";

export type EmailEventType = "click" | "bounce" | "complaint" | "optout";

/** Remembers that something happened to an email (FR-094). Never throws: tracking must not break sending. */
export async function recordEmailEvent(params: {
  type: EmailEventType;
  tenantId?: string | null;
  outboxId?: string | null;
  campaignId?: string | null;
  detail?: string;
}) {
  try {
    await db.insert(emailEvents).values({
      type: params.type,
      tenantId: params.tenantId ?? null,
      outboxId: params.outboxId ?? null,
      campaignId: params.campaignId ?? null,
      detail: params.detail?.slice(0, 500) ?? null,
    });
  } catch {
    // Tracking is best effort
  }
}

/** Stops offers going to an address that bounced or complained. Harmless if it is already listed. */
export async function suppressEmail(email: string, reason: "bounce" | "complaint") {
  await db
    .insert(emailSuppressions)
    .values({ email: email.toLowerCase().trim(), reason })
    .onConflictDoNothing();
}

export async function isSuppressed(email: string) {
  const [row] = await db
    .select({ id: emailSuppressions.id })
    .from(emailSuppressions)
    .where(eq(emailSuppressions.email, email.toLowerCase().trim()))
    .limit(1);
  return Boolean(row);
}

/** Clicks (people, not taps), bounces, complaints and opt-outs per campaign. */
export async function campaignEventCounts(campaignIds: string[]) {
  if (campaignIds.length === 0) return new Map<string, { clicks: number; bounces: number; complaints: number; optOuts: number }>();
  const rows = await db
    .select({
      campaignId: emailEvents.campaignId,
      type: emailEvents.type,
      // A person tapping the button three times is still one click
      n: sql<number>`count(distinct coalesce(${emailEvents.outboxId}::text, ${emailEvents.id}::text))::int`,
    })
    .from(emailEvents)
    .where(inArray(emailEvents.campaignId, campaignIds))
    .groupBy(emailEvents.campaignId, emailEvents.type);
  const map = new Map<string, { clicks: number; bounces: number; complaints: number; optOuts: number }>();
  for (const id of campaignIds) map.set(id, { clicks: 0, bounces: 0, complaints: 0, optOuts: 0 });
  for (const r of rows) {
    const entry = map.get(r.campaignId!);
    if (!entry) continue;
    if (r.type === "click") entry.clicks = r.n;
    else if (r.type === "bounce") entry.bounces = r.n;
    else if (r.type === "complaint") entry.complaints = r.n;
    else if (r.type === "optout") entry.optOuts = r.n;
  }
  return map;
}

/** Notes a bounce or complaint reported by the mail provider for an address, against its latest offer. */
export async function recordProviderReport(email: string, type: "bounce" | "complaint") {
  const address = email.toLowerCase().trim();
  const [latest] = await db
    .select({ id: emailOutbox.id, tenantId: emailOutbox.tenantId, payload: emailOutbox.payload })
    .from(emailOutbox)
    .where(and(eq(emailOutbox.toEmail, address), eq(emailOutbox.template, "campaign")))
    .orderBy(sql`${emailOutbox.createdAt} desc`)
    .limit(1);
  await suppressEmail(address, type);
  await recordEmailEvent({
    type,
    tenantId: latest?.tenantId,
    outboxId: latest?.id,
    campaignId: (latest?.payload as { campaignId?: string } | undefined)?.campaignId ?? null,
    detail: "Reported by the mail provider",
  });
  return { suppressed: true };
}
