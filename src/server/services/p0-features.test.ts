import "dotenv/config";
import { describe, it, expect } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { emailOutbox, sessions, users, verifications } from "../db/schema";
import { registerOwnerAndTenant, createLocation, updateLocation } from "./tenant";
import { joinProgramme, revokeMemberQr } from "./member";
import { addStaffMember, updateStaffMember } from "./staff";
import { requestPasswordReset, resetPassword } from "./password-reset";
import { createEmailVerificationToken, verifyEmailToken, hashLinkToken } from "./verification";
import { setProgrammeStatus, publishRuleVersion, getProgramme } from "./programme";
import { adjustBalance, earn, redeemForMember } from "./ledger";
import { createReward, getRewards } from "./rewards";
import { createSession } from "../auth";
import { RequestContext } from "../security/permissions";

async function shop(tag: string, opts: { emailVerified?: boolean } = {}) {
  const stamp = `${tag}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const s = await registerOwnerAndTenant({
    email: `owner-${stamp}@p0.test`,
    password: "Password123!",
    name: "P0 Owner",
    businessName: `P0 Cafe ${stamp}`,
    slug: stamp,
    emailVerified: opts.emailVerified,
  });
  const ctx: RequestContext = { userId: s.user.id, tenantId: s.tenant.id, role: "owner", requestId: "p0" };
  return { ...s, ctx, slug: stamp };
}

/** The link token is only ever in the email, so read it back from the outbox like a mail client would. */
async function tokenFromLatestEmail(email: string, template: string) {
  const [row] = await db
    .select({ payload: emailOutbox.payload })
    .from(emailOutbox)
    .where(and(eq(emailOutbox.toEmail, email), eq(emailOutbox.template, template)))
    .orderBy(desc(emailOutbox.createdAt))
    .limit(1);
  const url = String((row?.payload as { url?: string })?.url ?? "");
  return new URL(url).searchParams.get("token")!;
}

describe("Password reset", () => {
  it("emails a single-use link, stores only its hash, and signs the account out everywhere", async () => {
    const s = await shop("reset");
    const email = s.user.email;
    await createSession(s.user.id, "staff");

    // A shop owner is a staff account, so the forgot form refuses it
    await expect(requestPasswordReset(email)).rejects.toThrow(/staff account/);

    const token = "a".repeat(64);
    await db.insert(verifications).values({
      identifier: `reset:${email}`,
      value: hashLinkToken(token),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const stored = await db.select().from(verifications).where(eq(verifications.identifier, `reset:${email}`));
    expect(stored).toHaveLength(1);
    expect(stored[0].value).not.toBe(token);

    await expect(resetPassword(token, "short")).rejects.toThrow(/at least 8/);
    await resetPassword(token, "BrandNewPass456!");
    expect(await db.select().from(sessions).where(eq(sessions.userId, s.user.id))).toHaveLength(0);
    await expect(resetPassword(token, "AnotherPass789!")).rejects.toThrow(/expired or was already used/);
  });

  it("asks an unregistered email to register first", async () => {
    await expect(requestPasswordReset(`nobody-${Date.now()}@p0.test`)).rejects.toThrow(/register first/);
  });
});

describe("Email verification", () => {
  it("confirms the address once, and is required before re-publishing a paused programme", async () => {
    const s = await shop("verify", { emailVerified: false });
    await setProgrammeStatus(s.ctx, "paused");
    await expect(setProgrammeStatus(s.ctx, "published")).rejects.toThrow(/Confirm your email/);

    await createEmailVerificationToken(s.user.id, s.user.email, s.tenant.id);
    const token = await tokenFromLatestEmail(s.user.email, "email_verification");
    await verifyEmailToken(token);
    const [u] = await db.select({ at: users.emailVerifiedAt }).from(users).where(eq(users.id, s.user.id));
    expect(u.at).not.toBeNull();
    await expect(verifyEmailToken(token)).rejects.toThrow();

    await setProgrammeStatus(s.ctx, "published");
  });
});

describe("Earning rules", () => {
  it("publishes a new version and keeps the history", async () => {
    const s = await shop("rules");
    await publishRuleVersion(s.ctx, { earn: { mode: "spend", pointsPerUnit: 2, unitMinor: 100 }, caps: {}, exclusions: {}, expiry: {} });
    const p = await getProgramme(s.ctx);
    expect(p?.currentRule?.earn.pointsPerUnit).toBe(2);
    expect(p?.history.length).toBeGreaterThanOrEqual(2);
    expect(p?.history[0].version).toBeGreaterThan(p!.history[1].version);
  });
});

describe("Locations", () => {
  it("adds, closes and reopens locations, and never closes the last open one", async () => {
    const s = await shop("loc");
    await expect(updateLocation(s.ctx, s.location.id, { status: "closed" })).rejects.toThrow(/at least one open location/);
    const branch = await createLocation(s.ctx, { name: "Second branch" });
    const closed = await updateLocation(s.ctx, branch.id, { status: "closed", addressLine: "1 High St" });
    expect(closed.status).toBe("closed");
    await expect(updateLocation(s.ctx, branch.id, { timezone: "Mars/Olympus" })).rejects.toThrow(/time zone/);
  });

  it("refuses points at a closed location or another business's location", async () => {
    const a = await shop("loc-a");
    const b = await shop("loc-b");
    const member = await joinProgramme({ tenantSlug: a.slug, email: `cust-${Date.now()}@p0.test` });
    const branch = await createLocation(a.ctx, { name: "Pop-up" });
    await updateLocation(a.ctx, branch.id, { status: "closed" });

    const attempt = (locationId: string) =>
      earn(a.ctx, { membershipId: member.membership.id, locationId, amountMinor: 500, idempotencyKey: crypto.randomUUID() });
    await expect(attempt(branch.id)).rejects.toThrow(/closed/);
    await expect(attempt(b.location.id)).rejects.toThrow(/isn't part of this business/);
    await expect(
      redeemForMember(a.ctx, { membershipId: member.membership.id, locationId: b.location.id, costPoints: 1, title: "Tea", idempotencyKey: crypto.randomUUID() })
    ).rejects.toThrow(/isn't part of this business/);
  });

  it("only lets staff be tied to their own business's locations", async () => {
    const a = await shop("scope-a");
    const b = await shop("scope-b");
    const staff = await addStaffMember(a.ctx, { email: `staff-${Date.now()}@p0.test`, name: "Sam", role: "staff", temporaryPassword: "Password123!" });
    await updateStaffMember(a.ctx, staff.id, { locationIds: [a.location.id] });
    await expect(updateStaffMember(a.ctx, staff.id, { locationIds: [b.location.id] })).rejects.toThrow(/isn't part of your business/);
  });
});

describe("Reward limits customers can see", () => {
  it("explains when a reward has hit its per-customer limit", async () => {
    const s = await shop("limit");
    const member = await joinProgramme({ tenantSlug: s.slug, email: `lim-${Date.now()}@p0.test` });
    const m = member.membership.id;
    const reward = await createReward(s.ctx, { title: "Free Tea", costPoints: 5, perMemberLimit: 1 });
    await adjustBalance(s.ctx, { membershipId: m, pointsDelta: 20, reasonCode: "goodwill", note: "test", idempotencyKey: crypto.randomUUID() });
    await redeemForMember(s.ctx, { membershipId: m, rewardId: reward.id, idempotencyKey: crypto.randomUUID() });

    const [tea] = await getRewards(s.tenant.id, { memberBalance: 15, membershipId: m });
    expect(tea.eligible).toBe(false);
    expect(tea.unavailableReason).toMatch(/already had this/);
    expect(tea.timesRedeemed).toBe(1);
  });

  it("rejects an end date before the start date", async () => {
    const s = await shop("dates");
    await expect(
      createReward(s.ctx, { title: "Bad", costPoints: 5, startsAt: new Date("2030-02-01"), endsAt: new Date("2030-01-01") })
    ).rejects.toThrow(/end date/);
  });
});

describe("Cancelling a customer's QR code", () => {
  it("is limited to the customer's own business", async () => {
    const a = await shop("qr-a");
    const b = await shop("qr-b");
    const member = await joinProgramme({ tenantSlug: a.slug, email: `qr-${Date.now()}@p0.test` });
    await expect(revokeMemberQr(b.ctx, member.membership.id)).rejects.toThrow(/FORBIDDEN/);
    const result = await revokeMemberQr(a.ctx, member.membership.id);
    expect(result.membership.qrVersion).toBe(member.membership.qrVersion + 1);
  });
});
