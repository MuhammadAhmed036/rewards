import "dotenv/config";
import { describe, it, expect } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { auditEvents, emailOutbox, householdMembers, memberships } from "../db/schema";
import { registerOwnerAndTenant } from "./tenant";
import { joinProgramme } from "./member";
import { publishRuleVersion } from "./programme";
import { createReward } from "./rewards";
import { earn, requestRedemption } from "./ledger";
import { deleteAndAnonymiseAccount } from "./privacy";
import {
  MAX_HOUSEHOLD_PEOPLE,
  acceptHouseholdInvite,
  getHousehold,
  getInvite,
  householdCardFor,
  inviteToHousehold,
  removeFromHousehold,
  userCanUseMembership,
} from "./household";
import { RequestContext } from "../security/permissions";

async function shop() {
  const stamp = `hh-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const s = await registerOwnerAndTenant({
    email: `owner-${stamp}@hh.test`,
    password: "Password123!",
    name: "House Owner",
    businessName: `House ${stamp}`,
    slug: stamp,
    emailVerified: true,
  });
  const ctx: RequestContext = { userId: s.user.id, tenantId: s.tenant.id, role: "owner", requestId: "hh" };
  await publishRuleVersion(ctx, {
    earn: { mode: "spend", pointsPerUnit: 1, unitMinor: 100 },
    caps: { maxPointsPerTransaction: 5000, maxPointsPerMemberPerDay: 100000, minMinutesBetweenEarns: 0 },
    exclusions: {},
    expiry: {},
    bonuses: { welcomePoints: 0 },
  });
  return { ...s, ctx, slug: stamp };
}
type Shop = Awaited<ReturnType<typeof shop>>;

const uniq = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 100000)}@hh.test`;

async function cardholder(s: Shop, points = 100) {
  const m = await joinProgramme({ tenantSlug: s.slug, email: uniq("holder"), name: "Pat Holder" });
  if (points > 0) await earn(s.ctx, { membershipId: m.membership.id, locationId: s.location.id, amountMinor: points * 100, idempotencyKey: crypto.randomUUID() });
  return { userId: m.membership.userId, membershipId: m.membership.id };
}

/** The link only exists in the email, so read it back from the outbox like a mail client would. */
async function tokenSentTo(email: string) {
  const [row] = await db
    .select({ payload: emailOutbox.payload })
    .from(emailOutbox)
    .where(and(eq(emailOutbox.toEmail, email), eq(emailOutbox.template, "household_invite")))
    .orderBy(desc(emailOutbox.createdAt))
    .limit(1);
  return new URL(String((row?.payload as { url?: string })?.url)).searchParams.get("token")!;
}

async function joinHousehold(card: { userId: string; membershipId: string }, email: string) {
  await inviteToHousehold(card.userId, card.membershipId, email);
  return acceptHouseholdInvite(await tokenSentTo(email));
}

describe("Household cards (FR-029)", () => {
  it("lets an invited person share the card, spend its points, and leave, which changes the card's code", async () => {
    const s = await shop();
    const a = await cardholder(s);
    const reward = await createReward(s.ctx, { title: "Tea", costPoints: 10, locationIds: [] });
    const friend = uniq("friend");

    await inviteToHousehold(a.userId, a.membershipId, friend);
    const token = await tokenSentTo(friend);
    expect(token).toHaveLength(64);
    expect(await getInvite(token)).toMatchObject({ email: friend, businessName: expect.stringContaining("House"), inviterName: "Pat Holder" });
    // Before they accept, they have no access
    expect(await householdCardFor((await db.select().from(householdMembers).where(eq(householdMembers.email, friend)))[0].userId ?? "00000000-0000-0000-0000-000000000000", s.tenant.id)).toBeNull();

    const joined = await acceptHouseholdInvite(token);
    expect(joined).toMatchObject({ membershipId: a.membershipId, slug: s.slug });
    expect(await householdCardFor(joined.userId, s.tenant.id)).toBe(a.membershipId);
    expect(await userCanUseMembership(joined.userId, a.membershipId)).toBe(true);

    // The same link can't be used twice
    await expect(acceptHouseholdInvite(token)).rejects.toThrow(/expired or was already used/);

    // The new person can claim a reward with the shared points, a stranger at the same shop can't
    const them: RequestContext = { userId: joined.userId, tenantId: s.tenant.id, role: "customer", requestId: "hh-them" };
    const claim = await requestRedemption(them, { membershipId: a.membershipId, rewardId: reward.id });
    expect(claim.costPoints).toBe(10);
    const stranger = await cardholder(s, 0);
    const strangerCtx: RequestContext = { userId: stranger.userId, tenantId: s.tenant.id, role: "customer", requestId: "hh-x" };
    await expect(requestRedemption(strangerCtx, { membershipId: a.membershipId, rewardId: reward.id })).rejects.toThrow(/Membership not found/);

    // What each of them sees
    const owner = await getHousehold(a.userId, a.membershipId);
    expect(owner).toMatchObject({ role: "owner", people: [{ status: "active", label: friend, isYou: false, canRemove: true }] });
    const member = await getHousehold(joined.userId, a.membershipId);
    expect(member).toMatchObject({ role: "member", people: [{ isYou: true, canRemove: true }] });
    await expect(getHousehold(stranger.userId, a.membershipId)).rejects.toThrow(/different account/);

    // Leaving: no more access, and the card's code is replaced so a saved copy stops working
    const [before] = await db.select({ v: memberships.qrVersion }).from(memberships).where(eq(memberships.id, a.membershipId));
    await removeFromHousehold(joined.userId, member.people[0].id);
    expect(await householdCardFor(joined.userId, s.tenant.id)).toBeNull();
    expect(await userCanUseMembership(joined.userId, a.membershipId)).toBe(false);
    const [after] = await db.select({ v: memberships.qrVersion }).from(memberships).where(eq(memberships.id, a.membershipId));
    expect(after.v).toBe(before.v + 1);

    // Joining and leaving are on the record
    const actions = (await db.select({ action: auditEvents.action }).from(auditEvents).where(eq(auditEvents.targetId, a.membershipId))).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["household.invited", "household.joined", "household.left"]));
  });

  it("lets only the owner invite or remove others, and keeps to the size limit", async () => {
    const s = await shop();
    const a = await cardholder(s);
    const b = await joinHousehold(a, uniq("b"));

    await expect(inviteToHousehold(b.userId, a.membershipId, uniq("x"))).rejects.toThrow(/Only the owner/);
    const [row] = await db.select().from(householdMembers).where(eq(householdMembers.userId, b.userId));
    const c = await joinHousehold(a, uniq("c"));
    // One member can't remove another; the owner can
    await expect(removeFromHousehold(b.userId, (await db.select().from(householdMembers).where(eq(householdMembers.userId, c.userId)))[0].id)).rejects.toThrow(/owner/);
    await removeFromHousehold(a.userId, row.id);
    expect(await householdCardFor(b.userId, s.tenant.id)).toBeNull();

    // The owner plus three others is the most
    await joinHousehold(a, uniq("d"));
    await joinHousehold(a, uniq("e"));
    expect(MAX_HOUSEHOLD_PEOPLE).toBe(4);
    await expect(inviteToHousehold(a.userId, a.membershipId, uniq("f"))).rejects.toThrow(/up to 4 people/);
  });

  it("refuses people who can't share: their own card, a shop-team login, themselves, a bad address", async () => {
    const s = await shop();
    const a = await cardholder(s);
    const hasOwn = await cardholder(s, 0);
    const [ownEmail] = await db.select().from(memberships).where(eq(memberships.id, hasOwn.membershipId));
    expect(ownEmail).toBeDefined();
    const emailOf = async (userId: string) => (await db.query.users.findFirst({ where: (u, { eq: e }) => e(u.id, userId) }))!.email;

    await expect(inviteToHousehold(a.userId, a.membershipId, await emailOf(hasOwn.userId))).rejects.toThrow(/their own card/);
    await expect(inviteToHousehold(a.userId, a.membershipId, s.user.email)).rejects.toThrow(/can't be added/);
    await expect(inviteToHousehold(a.userId, a.membershipId, await emailOf(a.userId))).rejects.toThrow(/your own email/);
    await expect(inviteToHousehold(a.userId, a.membershipId, "not-an-email")).rejects.toThrow(/valid email/);
  });

  it("stops an invitation working once it has lapsed, and stops a member starting a second card", async () => {
    const s = await shop();
    const a = await cardholder(s);
    const lapsing = uniq("late");
    await inviteToHousehold(a.userId, a.membershipId, lapsing);
    const token = await tokenSentTo(lapsing);
    await db.update(householdMembers).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(householdMembers.email, lapsing));
    await expect(getInvite(token)).rejects.toThrow(/expired/);
    await expect(acceptHouseholdInvite(token)).rejects.toThrow(/expired/);

    const sharedEmail = uniq("shared");
    await joinHousehold(a, sharedEmail);
    await expect(joinProgramme({ tenantSlug: s.slug, email: sharedEmail, allowExistingUser: true })).rejects.toThrow(/already share a household card/);
  });

  it("takes a person out of every household when they delete their account", async () => {
    const s = await shop();
    const a = await cardholder(s);
    const b = await joinHousehold(a, uniq("leaver"));
    await deleteAndAnonymiseAccount(b.userId);
    expect(await householdCardFor(b.userId, s.tenant.id)).toBeNull();

    const c = await joinHousehold(a, uniq("stays"));
    await deleteAndAnonymiseAccount(a.userId);
    // The owner left, so the card is no longer shared with anyone
    expect(await householdCardFor(c.userId, s.tenant.id)).toBeNull();
  });
});
