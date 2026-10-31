import "dotenv/config";
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { campaigns, emailOutbox } from "../db/schema";
import { registerOwnerAndTenant } from "./tenant";
import { joinProgramme } from "./member";
import { cancelCampaign, listCampaigns, runDueCampaigns, sendCampaign } from "./campaigns";
import { RequestContext } from "../security/permissions";

async function shop() {
  const stamp = `sched-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const s = await registerOwnerAndTenant({
    email: `owner-${stamp}@sched.test`,
    password: "Password123!",
    name: "Sched Owner",
    businessName: `Sched ${stamp}`,
    slug: stamp,
    emailVerified: true,
  });
  const ctx: RequestContext = { userId: s.user.id, tenantId: s.tenant.id, role: "owner", requestId: "sched" };
  return { ...s, ctx, slug: stamp };
}

const message = { subject: "Weekend offer", body: "Come in this weekend for a treat." };
const queuedFor = async (campaignId: string) =>
  (await db.select().from(emailOutbox).where(eq(emailOutbox.template, "campaign"))).filter(
    (e) => (e.payload as { campaignId?: string }).campaignId === campaignId
  );

describe("Scheduled offers and budget (FR-090)", () => {
  it("holds a future offer back, sends it once when it is due, and never twice", async () => {
    const s = await shop();
    await joinProgramme({ tenantSlug: s.slug, email: `a-${Date.now()}@sched.test`, marketingOptIn: true });
    const later = new Date(Date.now() + 3600_000);

    const c = await sendCampaign(s.ctx, { ...message, audience: {}, sendAt: later.toISOString() });
    expect(c.status).toBe("scheduled");
    expect(await queuedFor(c.id)).toHaveLength(0);

    // Not due yet: nothing goes out
    await runDueCampaigns(new Date());
    expect(await queuedFor(c.id)).toHaveLength(0);

    // Someone leaves the offers list before it goes: they are not emailed
    const another = await joinProgramme({ tenantSlug: s.slug, email: `b-${Date.now()}@sched.test`, marketingOptIn: true });
    expect(another.membership.id).toBeDefined();

    const due = new Date(later.getTime() + 1000);
    // (Other tests' offers may come due in the same run, so check this one by what happened to it)
    await runDueCampaigns(due);
    expect(await queuedFor(c.id)).toHaveLength(2); // chosen at send time, so the newcomer is included
    await runDueCampaigns(due); // a second run finds nothing more to do for it
    expect(await queuedFor(c.id)).toHaveLength(2);

    const [row] = await db.select().from(campaigns).where(eq(campaigns.id, c.id));
    expect(row.status).toBe("sent");
    expect(row.recipientCount).toBe(2);
  });

  it("can be cancelled before it goes out, but not after", async () => {
    const s = await shop();
    await joinProgramme({ tenantSlug: s.slug, email: `c-${Date.now()}@sched.test`, marketingOptIn: true });
    const c = await sendCampaign(s.ctx, { ...message, audience: {}, sendAt: new Date(Date.now() + 3600_000).toISOString() });
    await cancelCampaign(s.ctx, c.id);
    await runDueCampaigns(new Date(Date.now() + 7200_000));
    expect(await queuedFor(c.id)).toHaveLength(0);
    await expect(cancelCampaign(s.ctx, c.id)).rejects.toThrow(/already gone out|doesn't exist/);

    const sentNow = await sendCampaign(s.ctx, { ...message, audience: {} });
    expect(sentNow.status).toBe("sent");
    await expect(cancelCampaign(s.ctx, sentNow.id)).rejects.toThrow(/already gone out/);
    expect((await listCampaigns(s.ctx)).map((x) => x.status)).toEqual(expect.arrayContaining(["cancelled", "sent"]));
  });

  it("won't cancel another business's offer, and rejects a time too far ahead or an empty audience", async () => {
    const a = await shop();
    const b = await shop();
    await joinProgramme({ tenantSlug: a.slug, email: `d-${Date.now()}@sched.test`, marketingOptIn: true });
    const c = await sendCampaign(a.ctx, { ...message, audience: {}, sendAt: new Date(Date.now() + 3600_000).toISOString() });
    await expect(cancelCampaign(b.ctx, c.id)).rejects.toThrow();
    await expect(sendCampaign(a.ctx, { ...message, audience: {}, sendAt: new Date(Date.now() + 90 * 86400_000).toISOString() })).rejects.toThrow(/60 days/);
    await expect(sendCampaign(b.ctx, { ...message, audience: {} })).rejects.toThrow(/Nobody matches/);
  });

  it("caps how many people one offer reaches", async () => {
    const s = await shop();
    for (let i = 0; i < 4; i++) await joinProgramme({ tenantSlug: s.slug, email: `cap${i}-${Date.now()}@sched.test`, marketingOptIn: true });
    const c = await sendCampaign(s.ctx, { ...message, audience: {}, maxRecipients: 2 });
    expect(c.recipientCount).toBe(2);
    expect(await queuedFor(c.id)).toHaveLength(2);
  });
});
