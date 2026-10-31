import "dotenv/config";
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import nodemailer from "nodemailer";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { emailOutbox, emailSuppressions } from "../db/schema";
import { registerOwnerAndTenant } from "./tenant";
import { joinProgramme } from "./member";
import { listCampaigns, marketingOptOutToken, previewAudience, sendCampaign, stopOffersByLink } from "./campaigns";
import { processOutbox, queueEmail } from "./email";
import { suppressEmail } from "./email-events";
import { GET as clickRoute } from "@/app/e/c/[id]/route";
import { POST as bounceWebhook } from "@/app/api/v1/webhooks/email-bounce/route";
import { RequestContext } from "../security/permissions";

async function shop() {
  const stamp = `ev-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const s = await registerOwnerAndTenant({
    email: `owner-${stamp}@ev.test`,
    password: "Password123!",
    name: "Events Owner",
    businessName: `Events ${stamp}`,
    slug: stamp,
    emailVerified: true,
  });
  const ctx: RequestContext = { userId: s.user.id, tenantId: s.tenant.id, role: "owner", requestId: "ev" };
  return { ...s, ctx, slug: stamp };
}

afterEach(() => vi.restoreAllMocks());

describe("Offer email events (FR-094)", () => {
  it("counts a click once however many times the button is tapped, and an opt-out against its offer", async () => {
    const s = await shop();
    const member = await joinProgramme({ tenantSlug: s.slug, email: `fan-${Date.now()}@ev.test`, marketingOptIn: true });
    const campaign = await sendCampaign(s.ctx, { subject: "Treat day", body: "Come in for a free treat today.", audience: {} });

    const [mail] = await db.select().from(emailOutbox).where(eq(emailOutbox.template, "campaign"));
    const queued = (await db.select().from(emailOutbox).where(eq(emailOutbox.tenantId, s.tenant.id))).find(
      (e) => (e.payload as { campaignId?: string }).campaignId === campaign.id
    )!;
    expect(mail).toBeDefined();

    // The button leads to the tracked link, which sends the person on to the shop page
    for (let i = 0; i < 3; i++) {
      const res = await clickRoute(new NextRequest(`http://localhost:3000/e/c/${queued.id}`), { params: Promise.resolve({ id: queued.id }) });
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain(`/b/${s.slug}`);
    }
    // A made-up id goes home and records nothing
    const bad = await clickRoute(new NextRequest("http://localhost:3000/e/c/nope"), { params: Promise.resolve({ id: "nope" }) });
    expect(bad.status).toBe(307);

    await stopOffersByLink(member.membership.id, marketingOptOutToken(member.membership.id), campaign.id);
    await stopOffersByLink(member.membership.id, marketingOptOutToken(member.membership.id), campaign.id); // opening the link again adds nothing

    const [stats] = (await listCampaigns(s.ctx)).filter((c) => c.id === campaign.id);
    expect(stats.clicks).toBe(1);
    expect(stats.optOuts).toBe(1);
    expect(stats.bounces).toBe(0);
  });

  it("treats a refused address as a bounce, stops retrying it, and never offers to it again", async () => {
    const s = await shop();
    const email = `gone-${Date.now()}@ev.test`;
    await joinProgramme({ tenantSlug: s.slug, email, marketingOptIn: true });
    const campaign = await sendCampaign(s.ctx, { subject: "Hello again", body: "A note for our regulars here.", audience: {} });

    // The mail server refuses this address
    const refuse = Object.assign(new Error("550 5.1.1 User unknown"), { responseCode: 550 });
    vi.spyOn(nodemailer, "createTransport").mockReturnValue({ sendMail: vi.fn().mockRejectedValue(refuse) } as never);
    const offer = await queueEmail({
      toEmail: email,
      template: "campaign",
      kind: "marketing",
      tenantId: s.tenant.id,
      payload: { campaignId: campaign.id, subject: "x", body: "y", businessName: "Shop", hubUrl: "http://localhost:3000" },
    });
    await processOutbox(1, { ids: [offer.id] });
    vi.restoreAllMocks();

    const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, offer.id));
    expect(row.status).toBe("dead"); // no retries
    expect(row.attempts).toBe(1);
    const [stats] = (await listCampaigns(s.ctx)).filter((c) => c.id === campaign.id);
    expect(stats.bounces).toBe(1);
    expect((await db.select().from(emailSuppressions).where(eq(emailSuppressions.email, email))).length).toBe(1);
    // They drop out of future offers, but their card is untouched
    expect((await previewAudience(s.ctx, {})).recipients).toBe(0);
  });

  it("never sends an offer to a suppressed address, and takes provider reports only with the secret", async () => {
    const s = await shop();
    const email = `spam-${Date.now()}@ev.test`;
    const offer = await queueEmail({ toEmail: email, template: "campaign", kind: "marketing", tenantId: s.tenant.id, payload: { subject: "x", body: "y", businessName: "Shop" } });
    await suppressEmail(email, "complaint");
    const result = await processOutbox(1, { ids: [offer.id] });
    expect(result.sent).toBe(0);
    expect((await db.select().from(emailOutbox).where(eq(emailOutbox.id, offer.id)))[0].status).toBe("dead");

    const body = JSON.stringify({ email: `reported-${Date.now()}@ev.test`, type: "bounce" });
    const noAuth = await bounceWebhook(new NextRequest("http://localhost:3000/api/v1/webhooks/email-bounce", { method: "POST", body }));
    expect(noAuth.status).toBe(401);
    const ok = await bounceWebhook(
      new NextRequest("http://localhost:3000/api/v1/webhooks/email-bounce", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
        body,
      })
    );
    expect(ok.status).toBe(200);
  });
});
