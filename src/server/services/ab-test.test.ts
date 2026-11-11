import "dotenv/config";
import { describe, it, expect } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { emailOutbox } from "../db/schema";
import { registerOwnerAndTenant } from "./tenant";
import { joinProgramme } from "./member";
import { publishRuleVersion } from "./programme";
import { earn } from "./ledger";
import { listCampaigns, sendCampaign } from "./campaigns";
import { compareVariants, splitForTest, MIN_PER_VERSION } from "@/lib/ab-test";
import { RequestContext } from "../security/permissions";

describe("A/B split and verdict (FR-096)", () => {
  const people = (n: number) => Array.from({ length: n }, (_, i) => ({ membershipId: `m-${i}` }));

  it("splits close to the chosen share, the same way every time, and never leaves a version empty", () => {
    const a = splitForTest(people(10), "camp-1", 30);
    expect(a.b).toHaveLength(3);
    expect(a.a).toHaveLength(7);
    expect(splitForTest(people(10), "camp-1", 30).b.map((r) => r.membershipId)).toEqual(a.b.map((r) => r.membershipId));
    // Another offer shuffles differently, so the same customers aren't always in the same version
    expect(splitForTest(people(40), "camp-2", 50).b.map((r) => r.membershipId)).not.toEqual(
      splitForTest(people(40), "camp-3", 50).b.map((r) => r.membershipId)
    );
    const tiny = splitForTest(people(2), "camp-1", 90);
    expect([tiny.a.length, tiny.b.length]).toEqual([1, 1]);
    const everyone = new Set([...a.a, ...a.b].map((r) => r.membershipId));
    expect(everyone.size).toBe(10);
  });

  it("only names a winner when there are enough people and the gap is too big to be chance", () => {
    expect(compareVariants({ reached: 10, converted: 1 }, { reached: 10, converted: 9 }).winner).toBeNull();
    expect(compareVariants({ reached: 10, converted: 1 }, { reached: 10, converted: 9 }).reason).toMatch(new RegExp(`${MIN_PER_VERSION}`));
    expect(compareVariants({ reached: 200, converted: 20 }, { reached: 200, converted: 60 })).toMatchObject({ winner: "B" });
    expect(compareVariants({ reached: 200, converted: 60 }, { reached: 200, converted: 20 })).toMatchObject({ winner: "A" });
    // 22 vs 25 buyers out of 200 is within chance
    expect(compareVariants({ reached: 200, converted: 22 }, { reached: 200, converted: 25 }).winner).toBeNull();
    expect(compareVariants({ reached: 100, converted: 0 }, { reached: 100, converted: 0 }).winner).toBeNull();
  });
});

async function shop() {
  const stamp = `ab-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const s = await registerOwnerAndTenant({
    email: `owner-${stamp}@ab.test`,
    password: "Password123!",
    name: "AB Owner",
    businessName: `AB ${stamp}`,
    slug: stamp,
    emailVerified: true,
  });
  const ctx: RequestContext = { userId: s.user.id, tenantId: s.tenant.id, role: "owner", requestId: "ab" };
  await publishRuleVersion(ctx, {
    earn: { mode: "spend", pointsPerUnit: 1, unitMinor: 100 },
    caps: { maxPointsPerTransaction: 1000, maxPointsPerMemberPerDay: 100000, minMinutesBetweenEarns: 0 },
    exclusions: {},
    expiry: {},
    bonuses: { welcomePoints: 0 },
  });
  return { ...s, ctx, slug: stamp };
}

describe("Sending an A/B test", () => {
  it("sends each customer one version, keeps the rest of the message, and reports how each did", async () => {
    const s = await shop();
    const members: Array<{ id: string; email: string }> = [];
    for (let i = 0; i < 20; i++) {
      const email = `c${i}-${Date.now()}@ab.test`;
      const m = await joinProgramme({ tenantSlug: s.slug, email, marketingOptIn: true });
      members.push({ id: m.membership.id, email });
    }

    const campaign = await sendCampaign(s.ctx, {
      subject: "Weekend offer",
      body: "Come in this weekend for a treat.",
      audience: {},
      versionB: { subject: "Double points, this weekend only", splitPercent: 50 },
    });
    expect(campaign).toMatchObject({ abSplitPercent: 50, subjectB: "Double points, this weekend only", bodyB: null });

    const queued = (await db.select().from(emailOutbox).where(eq(emailOutbox.template, "campaign"))).filter(
      (e) => (e.payload as { campaignId?: string }).campaignId === campaign.id
    );
    const payloads = queued.map((e) => e.payload as { variant: string; subject: string; body: string });
    const b = payloads.filter((p) => p.variant === "B");
    const a = payloads.filter((p) => p.variant === "A");
    expect([a.length, b.length]).toEqual([10, 10]);
    expect(new Set(b.map((p) => p.subject))).toEqual(new Set(["Double points, this weekend only"]));
    expect(new Set(a.map((p) => p.subject))).toEqual(new Set(["Weekend offer"]));
    // Version B didn't change the message, so it keeps the first one
    expect(new Set(payloads.map((p) => p.body))).toEqual(new Set(["Come in this weekend for a treat."]));

    // Three people who got version B buy something; nobody who got A does
    await db.update(emailOutbox).set({ status: "sent" }).where(inArray(emailOutbox.id, queued.map((e) => e.id)));
    const boughtB = queued.filter((e) => (e.payload as { variant: string }).variant === "B").slice(0, 3);
    for (const row of boughtB) {
      const member = members.find((m) => m.email === row.toEmail)!;
      await earn(s.ctx, { membershipId: member.id, locationId: s.location.id, amountMinor: 1000, idempotencyKey: crypto.randomUUID() });
    }

    const [listed] = (await listCampaigns(s.ctx)).filter((c) => c.id === campaign.id);
    expect(listed.abTest).toMatchObject({
      splitPercent: 50,
      a: { reached: 10, converted: 0 },
      b: { reached: 10, converted: 3 },
    });
    // Ten people each is too few to call
    expect(listed.abTest?.verdict.winner).toBeNull();
  });

  it("refuses a test that makes no sense", async () => {
    const s = await shop();
    for (let i = 0; i < 3; i++) await joinProgramme({ tenantSlug: s.slug, email: `r${i}-${Date.now()}@ab.test`, marketingOptIn: true });
    const base = { subject: "Weekend offer", body: "Come in this weekend for a treat.", audience: {} };

    await expect(sendCampaign(s.ctx, { ...base, versionB: { splitPercent: 50 } })).rejects.toThrow(/Change the subject or the message/);
    await expect(sendCampaign(s.ctx, { ...base, versionB: { subject: "Weekend offer", splitPercent: 50 } })).rejects.toThrow(/same as version A/);
    await expect(sendCampaign(s.ctx, { ...base, maxRecipients: 1, versionB: { subject: "Another", splitPercent: 50 } })).rejects.toThrow(/at least 2/);
    await expect(sendCampaign(s.ctx, { ...base, versionB: { subject: "Another", splitPercent: 95 } })).rejects.toThrow();
  });
});
