import "dotenv/config";
import { describe, it, expect } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { emailOutbox, memberships, staffMembers } from "../db/schema";
import { registerOwnerAndTenant } from "./tenant";
import { joinProgramme } from "./member";
import { adjustBalance, redeemForMember } from "./ledger";
import { createReward } from "./rewards";
import { setCardEmailsByLink, unsubscribeToken } from "./notifications";
import { addStaffMember, acceptStaffInvitation, describeInvitation, resendStaffInvitation } from "./staff";
import { checkPortalAccess } from "../auth/portal-access";
import { RequestContext } from "../security/permissions";

async function shop(tag: string) {
  const stamp = `${tag}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const s = await registerOwnerAndTenant({
    email: `owner-${stamp}@p2.test`,
    password: "Password123!",
    name: "P2 Owner",
    businessName: `P2 Cafe ${stamp}`,
    slug: stamp,
  });
  const ctx: RequestContext = { userId: s.user.id, tenantId: s.tenant.id, role: "owner", requestId: "p2" };
  return { ...s, ctx, slug: stamp };
}

const emailsTo = (to: string, template: string) =>
  db
    .select({ payload: emailOutbox.payload })
    .from(emailOutbox)
    .where(and(eq(emailOutbox.toEmail, to), eq(emailOutbox.template, template)))
    .orderBy(desc(emailOutbox.createdAt));

const give = (ctx: RequestContext, membershipId: string, points: number) =>
  adjustBalance(ctx, { membershipId, pointsDelta: points, reasonCode: "goodwill", note: "test", idempotencyKey: crypto.randomUUID() });

describe("Emails about a customer's card", () => {
  it("welcomes a new customer once, with their customer ID and a way to stop emails", async () => {
    const s = await shop("welcome");
    const email = `cust-${Date.now()}@p2.test`;
    const first = await joinProgramme({ tenantSlug: s.slug, email, name: "Wendy" });
    // Joining again with the same email is refused (they sign in instead), so no second welcome
    await expect(joinProgramme({ tenantSlug: s.slug, email, name: "Wendy" })).rejects.toThrow(/already exists/);

    const sent = await emailsTo(email, "welcome");
    expect(sent).toHaveLength(1);
    const payload = sent[0].payload as Record<string, string>;
    expect(payload.memberNumber).toBe(first.membership.memberNumber);
    expect(payload.unsubscribeUrl).toContain(`m=${first.membership.id}`);
  });

  it("tells the customer when they pass a reward, and sends a receipt when they use points", async () => {
    const s = await shop("unlock");
    const email = `cust-${Date.now()}@p2.test`;
    const m = (await joinProgramme({ tenantSlug: s.slug, email })).membership.id;
    await createReward(s.ctx, { title: "Free Tea", costPoints: 10 });
    const coffee = await createReward(s.ctx, { title: "Free Coffee", costPoints: 20 });

    await give(s.ctx, m, 5);
    expect(await emailsTo(email, "reward_unlocked")).toHaveLength(0);
    await give(s.ctx, m, 20); // 5 -> 25 crosses both; the email names the bigger one
    const unlocked = await emailsTo(email, "reward_unlocked");
    expect(unlocked).toHaveLength(1);
    expect((unlocked[0].payload as Record<string, string>).rewardTitle).toBe("Free Coffee");

    await redeemForMember(s.ctx, { membershipId: m, rewardId: coffee.id, idempotencyKey: crypto.randomUUID() });
    const receipt = await emailsTo(email, "redemption_receipt");
    expect(receipt).toHaveLength(1);
    expect(receipt[0].payload).toMatchObject({ rewardTitle: "Free Coffee", costPoints: 20, newBalance: 5 });
  });

  it("stops card emails from the signed link, and refuses a forged one", async () => {
    const s = await shop("unsub");
    const email = `cust-${Date.now()}@p2.test`;
    const m = (await joinProgramme({ tenantSlug: s.slug, email })).membership.id;
    await createReward(s.ctx, { title: "Free Tea", costPoints: 5 });

    await expect(setCardEmailsByLink(m, "0".repeat(32), false)).rejects.toThrow(/isn't valid/);
    await setCardEmailsByLink(m, unsubscribeToken(m), false);
    const [row] = await db.select({ on: memberships.emailNotifications }).from(memberships).where(eq(memberships.id, m));
    expect(row.on).toBe(false);

    await give(s.ctx, m, 10);
    expect(await emailsTo(email, "reward_unlocked")).toHaveLength(0);
  });
});

describe("Staff invites", () => {
  it("invites someone new, keeps them out until they set a password, then lets them in", async () => {
    const s = await shop("invite");
    const email = `newstaff-${Date.now()}@p2.test`;
    const staff = await addStaffMember(s.ctx, { email, name: "Nina", role: "staff" });
    expect(staff.status).toBe("invited");

    const first = await emailsTo(email, "staff_invitation");
    expect(first).toHaveLength(1);
    const token = new URL(String((first[0].payload as Record<string, string>).url)).searchParams.get("token")!;
    expect((await checkPortalAccess(staff.userId, "staff", s.slug)).ok).toBe(false);

    // A resend replaces the link, so the first one stops working
    await resendStaffInvitation(s.ctx, staff.id);
    await expect(describeInvitation(token)).rejects.toThrow(/expired or was already used/);
    const latest = await emailsTo(email, "staff_invitation");
    const token2 = new URL(String((latest[0].payload as Record<string, string>).url)).searchParams.get("token")!;

    expect(await describeInvitation(token2)).toMatchObject({ email, role: "staff" });
    await expect(acceptStaffInvitation(token2, { password: "short" })).rejects.toThrow(/at least 8/);
    await acceptStaffInvitation(token2, { password: "StaffPass123!", name: "Nina N" });

    const [row] = await db.select({ status: staffMembers.status }).from(staffMembers).where(eq(staffMembers.id, staff.id));
    expect(row.status).toBe("active");
    expect((await checkPortalAccess(staff.userId, "staff", s.slug)).ok).toBe(true);
    await expect(acceptStaffInvitation(token2, { password: "AnotherPass1!" })).rejects.toThrow();
  });

  it("adds someone with a temporary password straight away, without an invite link", async () => {
    const s = await shop("temp");
    const email = `temp-${Date.now()}@p2.test`;
    const staff = await addStaffMember(s.ctx, { email, name: "Tom", role: "staff", temporaryPassword: "Password123!" });
    expect(staff.status).toBe("active");
    const sent = await emailsTo(email, "staff_invitation");
    expect((sent[0].payload as Record<string, unknown>).isNewAccount).toBe(false);
  });
});

describe("Email offers", () => {
  it("only reaches customers who said yes, filters by balance, and honours the opt-out link", async () => {
    const { previewAudience, sendCampaign, listCampaigns, stopOffersByLink, marketingOptOutToken } = await import("./campaigns");
    const s = await shop("offers");
    const yes = await joinProgramme({ tenantSlug: s.slug, email: `yes-${Date.now()}@p2.test`, marketingOptIn: true });
    const rich = await joinProgramme({ tenantSlug: s.slug, email: `rich-${Date.now()}@p2.test`, marketingOptIn: true });
    await joinProgramme({ tenantSlug: s.slug, email: `no-${Date.now()}@p2.test`, marketingOptIn: false });
    await give(s.ctx, rich.membership.id, 50);

    expect((await previewAudience(s.ctx, {})).recipients).toBe(2);
    expect((await previewAudience(s.ctx, { minBalance: 40 })).recipients).toBe(1);

    const campaign = await sendCampaign(s.ctx, { subject: "Double points", body: "Come in this weekend for double points.", audience: {} });
    expect(campaign.recipientCount).toBe(2);
    const listed = await listCampaigns(s.ctx);
    expect(listed[0]).toMatchObject({ id: campaign.id, recipientCount: 2 });

    await expect(stopOffersByLink(yes.membership.id, "f".repeat(32))).rejects.toThrow(/isn't valid/);
    await stopOffersByLink(yes.membership.id, marketingOptOutToken(yes.membership.id));
    expect((await previewAudience(s.ctx, {})).recipients).toBe(1);
  });

  it("is limited to three a day and can't be sent by staff", async () => {
    const { sendCampaign } = await import("./campaigns");
    const s = await shop("offer-limit");
    await joinProgramme({ tenantSlug: s.slug, email: `yes-${Date.now()}@p2.test`, marketingOptIn: true });
    const msg = { subject: "Hello there", body: "A short note for our regulars.", audience: {} };
    for (let i = 0; i < 3; i++) await sendCampaign(s.ctx, msg);
    await expect(sendCampaign(s.ctx, msg)).rejects.toThrow(/up to 3 offers a day/);

    const staffCtx: RequestContext = { ...s.ctx, role: "staff" };
    await expect(sendCampaign(staffCtx, msg)).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("Bonuses and expiry", () => {
  it("gives the welcome bonus once, and a birthday bonus once a year", async () => {
    const { publishRuleVersion } = await import("./programme");
    const { runDailyLoyaltyJobs } = await import("./loyalty-jobs");
    const { users: usersTable, membershipBalances } = await import("../db/schema");
    const s = await shop("bonus");
    await publishRuleVersion(s.ctx, { earn: {}, caps: {}, exclusions: {}, expiry: {}, bonuses: { welcomePoints: 7, birthdayPoints: 5 } });

    const joined = await joinProgramme({ tenantSlug: s.slug, email: `bday-${Date.now()}@p2.test` });
    const balance = async () =>
      (await db.select({ b: membershipBalances.balance }).from(membershipBalances).where(eq(membershipBalances.membershipId, joined.membership.id)))[0].b;
    expect(await balance()).toBe(7);

    const now = new Date("2026-06-15T12:00:00Z");
    await db.update(usersTable).set({ birthMonth: 6, birthDay: 15 }).where(eq(usersTable.id, joined.membership.userId));
    await runDailyLoyaltyJobs(now);
    await runDailyLoyaltyJobs(now);
    expect(await balance()).toBe(12);
  });

  it("warns before points expire, then expires them after the quiet period", async () => {
    const { publishRuleVersion } = await import("./programme");
    const { runDailyLoyaltyJobs } = await import("./loyalty-jobs");
    const { membershipBalances, ledgerEntries } = await import("../db/schema");
    const s = await shop("expiry");
    await publishRuleVersion(s.ctx, { earn: {}, caps: {}, exclusions: {}, expiry: { enabled: true, months: 12, warnDays: 30 }, bonuses: {} });
    const email = `exp-${Date.now()}@p2.test`;
    const m = (await joinProgramme({ tenantSlug: s.slug, email })).membership.id;
    await give(s.ctx, m, 40);

    const inEleven = new Date(Date.now() + 345 * 86400000); // inside the 30-day warning window
    await runDailyLoyaltyJobs(inEleven);
    await runDailyLoyaltyJobs(inEleven);
    expect(await emailsTo(email, "points_expiring")).toHaveLength(1);

    const inThirteen = new Date(Date.now() + 400 * 86400000);
    await runDailyLoyaltyJobs(inThirteen);
    await runDailyLoyaltyJobs(inThirteen);
    const [bal] = await db.select({ b: membershipBalances.balance }).from(membershipBalances).where(eq(membershipBalances.membershipId, m));
    expect(bal.b).toBe(0);
    const expired = await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.membershipId, m), eq(ledgerEntries.type, "expire")));
    expect(expired).toHaveLength(1);
    expect(expired[0].pointsDelta).toBe(-40);
  });
});
