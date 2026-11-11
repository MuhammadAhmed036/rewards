import crypto from "crypto";
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db, DbExecutor } from "../db";
import { householdMembers, memberships, tenants, users } from "../db/schema";
import { isBusinessAccount } from "../auth/portal-access";
import { getBaseUrl } from "@/lib/url";
import { logAuditEvent } from "./audit";
import { sendEmailNow } from "./email";
import { emitEvent } from "./events";
import { hashLinkToken } from "./verification";

/**
 * Household cards (FR-029). One card, one shared balance, a few people who each sign in as themselves.
 *
 * - Only the card's owner can invite, and only by email. The invited person agrees by opening the emailed link.
 * - The owner can remove anyone and anyone can leave, at any time. The card's code is replaced when someone
 *   leaves, so a saved copy of it stops working.
 * - A person who already has their own card at the shop can't also join one there: two balances would have to be merged.
 * - Joining and leaving are written to the audit log, and a customer who deletes their account is taken out.
 */
export const MAX_HOUSEHOLD_PEOPLE = 4; // the card's owner and three more
const INVITE_TTL_DAYS = 7;

const normalise = (email: string) => email.toLowerCase().trim();

/** The shared card this person belongs to at a shop, if they joined one. */
export async function householdCardFor(userId: string, tenantId: string, executor: DbExecutor = db): Promise<string | null> {
  const [row] = await executor
    .select({ membershipId: householdMembers.membershipId })
    .from(householdMembers)
    .where(and(eq(householdMembers.userId, userId), eq(householdMembers.tenantId, tenantId), eq(householdMembers.status, "active")))
    .limit(1);
  return row?.membershipId ?? null;
}

/** Their own card, or the household card they share. */
export async function userCanUseMembership(userId: string, membershipId: string, executor: DbExecutor = db): Promise<boolean> {
  const [own] = await executor
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.id, membershipId), eq(memberships.userId, userId)))
    .limit(1);
  if (own) return true;
  const [shared] = await executor
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(and(eq(householdMembers.membershipId, membershipId), eq(householdMembers.userId, userId), eq(householdMembers.status, "active")))
    .limit(1);
  return Boolean(shared);
}

function actor(userId: string, tenantId: string) {
  return { userId, tenantId, role: "customer" as const, requestId: crypto.randomUUID() };
}

async function ownedCard(userId: string, membershipId: string) {
  const [card] = await db
    .select({ id: memberships.id, tenantId: memberships.tenantId, status: memberships.status, userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.id, membershipId))
    .limit(1);
  if (!card || card.userId !== userId) throw new Error("Only the owner of a card can change who shares it.");
  if (card.status !== "active") throw new Error("This card isn't active.");
  return card;
}

export async function inviteToHousehold(userId: string, membershipId: string, rawEmail: string, name?: string) {
  const card = await ownedCard(userId, membershipId);
  const email = normalise(rawEmail);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address.");

  const [me] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (me?.email === email) throw new Error("That's your own email.");

  const [tenant] = await db.select({ name: tenants.name, status: tenants.status }).from(tenants).where(eq(tenants.id, card.tenantId)).limit(1);
  if (!tenant || tenant.status !== "active") throw new Error("This business isn't taking changes right now.");

  const [invitee] = await db.select({ id: users.id, deletedAt: users.deletedAt }).from(users).where(eq(users.email, email)).limit(1);
  if (invitee) {
    if (invitee.deletedAt || (await isBusinessAccount(invitee.id))) {
      throw new Error("That email can't be added to a household card.");
    }
    const [theirOwn] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.userId, invitee.id), eq(memberships.tenantId, card.tenantId)))
      .limit(1);
    if (theirOwn) throw new Error("They already have their own card here, so they can't share yours as well.");
    if (await householdCardFor(invitee.id, card.tenantId)) throw new Error("They already share a card at this business.");
  }

  // Replace an invite still waiting for the same address; count the people already in or invited
  const people = await db
    .select({ id: householdMembers.id, email: householdMembers.email, status: householdMembers.status, expiresAt: householdMembers.expiresAt })
    .from(householdMembers)
    .where(and(eq(householdMembers.membershipId, membershipId), ne(householdMembers.status, "removed")));
  const live = people.filter((p) => p.status === "active" || (p.expiresAt && p.expiresAt > new Date()));
  if (live.some((p) => p.status === "active" && p.email === email)) throw new Error("They already share this card.");
  const replacing = live.find((p) => p.status === "invited" && p.email === email);
  if (1 + live.length - (replacing ? 1 : 0) >= MAX_HOUSEHOLD_PEOPLE) {
    throw new Error(`A card can be shared by up to ${MAX_HOUSEHOLD_PEOPLE} people, including you.`);
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400_000);
  const [row] = await db.transaction(async (tx) => {
    // Lapsed or replaced invites for this address are dropped so only the newest link works
    await tx
      .delete(householdMembers)
      .where(and(eq(householdMembers.membershipId, membershipId), eq(householdMembers.email, email), eq(householdMembers.status, "invited")));
    return tx
      .insert(householdMembers)
      .values({
        tenantId: card.tenantId,
        membershipId,
        email,
        name: name?.trim().slice(0, 120) || null,
        status: "invited",
        tokenHash: hashLinkToken(token),
        invitedBy: userId,
        expiresAt,
      })
      .returning({ id: householdMembers.id });
  });

  const { sent } = await sendEmailNow({
    toEmail: email,
    template: "household_invite",
    kind: "transactional",
    tenantId: card.tenantId,
    payload: {
      inviterName: me?.name || "Someone",
      businessName: tenant.name,
      url: `${getBaseUrl()}/household/accept?token=${token}`,
      days: INVITE_TTL_DAYS,
    },
  });
  if (!sent) {
    await db.delete(householdMembers).where(eq(householdMembers.id, row.id));
    throw new Error("We couldn't send the invitation email right now. Please try again in a minute.");
  }
  await logAuditEvent(actor(userId, card.tenantId), { action: "household.invited", targetType: "membership", targetId: membershipId, metadata: { email } });
  return { id: row.id, email, expiresAt };
}

/** What an invitation says, before the person accepts it. */
export async function getInvite(token: string) {
  const [row] = await db
    .select({
      id: householdMembers.id,
      email: householdMembers.email,
      status: householdMembers.status,
      expiresAt: householdMembers.expiresAt,
      businessName: tenants.name,
      slug: tenants.slug,
      inviterName: users.name,
    })
    .from(householdMembers)
    .innerJoin(tenants, eq(tenants.id, householdMembers.tenantId))
    .leftJoin(users, eq(users.id, householdMembers.invitedBy))
    .where(eq(householdMembers.tokenHash, hashLinkToken(token)))
    .limit(1);
  if (!row || row.status !== "invited" || !row.expiresAt || row.expiresAt < new Date()) {
    throw new Error("This invitation has expired or was already used. Ask for a new one.");
  }
  return { email: row.email, businessName: row.businessName, slug: row.slug, inviterName: row.inviterName || "Someone" };
}

/**
 * The person opens the emailed link and agrees. The link proves they own the mailbox, so a customer account is
 * created for the address if there isn't one yet. Returns who they are so the caller can sign them in.
 */
export async function acceptHouseholdInvite(token: string) {
  const hash = hashLinkToken(token);
  return db.transaction(async (tx) => {
    const [invite] = await tx.select().from(householdMembers).where(eq(householdMembers.tokenHash, hash)).for("update").limit(1);
    if (!invite || invite.status !== "invited" || !invite.expiresAt || invite.expiresAt < new Date()) {
      throw new Error("This invitation has expired or was already used. Ask for a new one.");
    }

    const [card] = await tx
      .select({ id: memberships.id, status: memberships.status })
      .from(memberships)
      .where(eq(memberships.id, invite.membershipId))
      .limit(1);
    if (!card || card.status !== "active") throw new Error("This card isn't active any more.");

    const [existing] = await tx.select({ id: users.id, deletedAt: users.deletedAt }).from(users).where(eq(users.email, invite.email)).limit(1);
    let userId: string;
    if (existing) {
      if (existing.deletedAt || (await isBusinessAccount(existing.id))) throw new Error("This email can't join a household card.");
      userId = existing.id;
    } else {
      const [created] = await tx
        .insert(users)
        .values({ email: invite.email, name: invite.name, passwordHash: null, emailVerifiedAt: new Date() })
        .returning({ id: users.id });
      userId = created.id;
    }

    const [theirOwn] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.tenantId, invite.tenantId)))
      .limit(1);
    if (theirOwn) throw new Error("You already have your own card at this business, so you can't share another one.");
    if (await householdCardFor(userId, invite.tenantId, tx)) throw new Error("You already share a card at this business.");

    await tx
      .update(householdMembers)
      .set({ status: "active", userId, acceptedAt: new Date(), tokenHash: null, expiresAt: null })
      .where(eq(householdMembers.id, invite.id));
    const [tenant] = await tx.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, invite.tenantId)).limit(1);
    await logAuditEvent(actor(userId, invite.tenantId), { action: "household.joined", targetType: "membership", targetId: invite.membershipId }, tx);
    return { userId, tenantId: invite.tenantId, membershipId: invite.membershipId, slug: tenant?.slug ?? "" };
  }).then(async (r) => {
    await emitEvent(r.tenantId, "household.member_added", { membershipId: r.membershipId });
    return r;
  });
}

/** The card's owner removes someone (or cancels an invite), or a person leaves. */
export async function removeFromHousehold(userId: string, householdMemberId: string) {
  const [row] = await db.select().from(householdMembers).where(eq(householdMembers.id, householdMemberId)).limit(1);
  if (!row || row.status === "removed") throw new Error("That person isn't on this card.");
  const [card] = await db.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.id, row.membershipId)).limit(1);
  const isOwner = card?.userId === userId;
  const isSelf = row.userId === userId;
  if (!isOwner && !isSelf) throw new Error("Only the card's owner, or the person themselves, can do this.");

  const wasActive = row.status === "active";
  await db.transaction(async (tx) => {
    await tx
      .update(householdMembers)
      .set({ status: "removed", removedAt: new Date(), tokenHash: null })
      .where(eq(householdMembers.id, row.id));
    // A new code for the card, so a saved copy held by the person who left stops working
    if (wasActive) {
      await tx.update(memberships).set({ qrVersion: sql`${memberships.qrVersion} + 1` }).where(eq(memberships.id, row.membershipId));
    }
  });
  await logAuditEvent(actor(userId, row.tenantId), {
    action: wasActive ? (isSelf ? "household.left" : "household.removed") : "household.invite_cancelled",
    targetType: "membership",
    targetId: row.membershipId,
    metadata: { email: row.email },
  });
  if (wasActive) await emitEvent(row.tenantId, "household.member_removed", { membershipId: row.membershipId });
  return { removed: true };
}

/** Who shares a card, as the signed-in person is allowed to see it. */
export async function getHousehold(userId: string, membershipId: string) {
  if (!(await userCanUseMembership(userId, membershipId))) throw new Error("This card belongs to a different account.");
  const [card] = await db.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.id, membershipId)).limit(1);
  const isOwner = card?.userId === userId;

  const rows = await db
    .select({
      id: householdMembers.id,
      email: householdMembers.email,
      userId: householdMembers.userId,
      name: users.name,
      status: householdMembers.status,
      expiresAt: householdMembers.expiresAt,
    })
    .from(householdMembers)
    .leftJoin(users, eq(users.id, householdMembers.userId))
    .where(and(eq(householdMembers.membershipId, membershipId), ne(householdMembers.status, "removed")));
  const [owner] = await db
    .select({ name: users.name, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.id, membershipId))
    .limit(1);

  const mask = (email: string) => email.replace(/^(.).*(@.*)$/, "$1***$2");
  return {
    role: isOwner ? ("owner" as const) : ("member" as const),
    max: MAX_HOUSEHOLD_PEOPLE,
    owner: { name: owner?.name || "Card owner" },
    // Only the owner sees the addresses they invited; members see names
    people: rows
      .filter((r) => r.status === "active" || (r.expiresAt && r.expiresAt > new Date()))
      .map((r) => ({
        id: r.id,
        status: r.status as "active" | "invited",
        label: r.status === "invited" || !r.name ? (isOwner ? r.email : mask(r.email)) : r.name,
        isYou: r.userId === userId,
        canRemove: isOwner || r.userId === userId,
      })),
  };
}

/** A customer deleting their account leaves every household and ends the ones they own. */
export async function leaveAllHouseholds(userId: string, executor: DbExecutor = db) {
  const owned = await executor.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, userId));
  const ownedIds = owned.map((o) => o.id);
  const where = ownedIds.length
    ? and(ne(householdMembers.status, "removed"), or(eq(householdMembers.userId, userId), inArray(householdMembers.membershipId, ownedIds)))
    : and(ne(householdMembers.status, "removed"), eq(householdMembers.userId, userId));
  await executor.update(householdMembers).set({ status: "removed", removedAt: new Date(), tokenHash: null }).where(where);
}

/** Housekeeping: invitations that nobody opened for a week are forgotten. */
export async function purgeLapsedInvites(executor: DbExecutor = db) {
  const gone = await executor
    .delete(householdMembers)
    .where(and(eq(householdMembers.status, "invited"), sql`${householdMembers.expiresAt} < now() - interval '30 days'`))
    .returning({ id: householdMembers.id });
  return gone.length;
}
