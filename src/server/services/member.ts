import { db } from "../db";
import {
  memberships,
  membershipBalances,
  consentRecords,
  users,
  tenants,
  locations,
  blockedEmails,
  qrTokenUses,
} from "../db/schema";
import {
  generateCrockfordCode,
  generateMemberQrToken,
  verifyAnyMemberQrToken,
  generateQrDataUrl,
} from "../qr";
import { getRewards } from "./rewards";
import { getMemberStampCards } from "./stamp-cards";
import { RequestContext, assertCan } from "../security/permissions";
import { logAuditEvent } from "./audit";
import { notifyWelcome } from "./notifications";
import { grantWelcomeBonus } from "./loyalty-jobs";
import { emitEvent } from "./events";
import { hashPassword } from "../auth";
import { eq, and, sql } from "drizzle-orm";
import crypto from "crypto";

export interface JoinProgrammeInput {
  tenantSlug: string;
  email: string;
  password?: string;
  name?: string;
  marketingOptIn?: boolean;
  termsVersion?: string;
  locationPublicId?: string;
  allowExistingUser?: boolean;
  /** A friend's member number: when given, they both get a bonus after this customer's first purchase. */
  referralCode?: string;
}

/**
 * Gmail ignores dots and anything after a "+" in the part before the @. Returns a masked version of an
 * existing account's email when a different spelling of the same Gmail inbox is already registered.
 */
async function findGmailLookalike(email: string): Promise<string | null> {
  const [local, domain] = email.split("@");
  if (domain !== "gmail.com" && domain !== "googlemail.com") return null;
  const base = local.split("+")[0].replace(/\./g, "");
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(
      sql`split_part(${users.email}, '@', 2) in ('gmail.com', 'googlemail.com')
        and replace(split_part(split_part(${users.email}, '@', 1), '+', 1), '.', '') = ${base}
        and ${users.email} <> ${email}`
    )
    .limit(1);
  if (rows.length === 0) return null;
  const [name, host] = rows[0].email.split("@");
  return `${name.slice(0, 1)}***@${host}`;
}

export async function joinProgramme(input: JoinProgrammeInput) {
  const normalizedEmail = input.email.toLowerCase().trim();
  const normalizedSlug = input.tenantSlug.toLowerCase().trim();

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, normalizedSlug))
    .limit(1);

  if (!tenant) throw new Error(`Business "${input.tenantSlug}" not found`);
  if (tenant.status !== "active") throw new Error("This loyalty programme is currently inactive");

  // A business can bar an email from its programme. The same message either way, so it reveals nothing else.
  const [blocked] = await db
    .select({ id: blockedEmails.id })
    .from(blockedEmails)
    .where(and(eq(blockedEmails.tenantId, tenant.id), eq(blockedEmails.email, normalizedEmail)))
    .limit(1);
  if (blocked) throw new Error("EMAIL_BLOCKED: This email can't be used to join this business's programme.");

  let locationId: string | null = null;
  if (input.locationPublicId) {
    const [loc] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.tenantId, tenant.id), eq(locations.publicId, input.locationPublicId)))
      .limit(1);
    if (loc) locationId = loc.id;
  }

  // 1. Ensure user does not already exist with this email
  let userId: string;
  const existingUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existingUsers.length > 0) {
    if (!input.allowExistingUser) {
      throw new Error(
        "An account with this email already exists. Please sign in or use a different email to create a new account."
      );
    }
    userId = existingUsers[0].id;
  } else {
    // The same Gmail inbox can be written many ways (j.smith@, jsmith+cafe@); don't open a second account for it
    const lookalike = await findGmailLookalike(normalizedEmail);
    if (lookalike) {
      throw new Error(
        `DUPLICATE_ACCOUNT: This looks like the same inbox as an existing account (${lookalike}). Sign in with that email instead.`
      );
    }
    let passwordHash: string | null = null;
    if (input.password && input.password.trim()) {
      passwordHash = await hashPassword(input.password);
    }

    const [newUser] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        name: input.name || null,
        passwordHash,
        emailVerifiedAt: new Date(),
      })
      .returning({ id: users.id });
    userId = newUser.id;
  }

  // 2. Check if already a member
  const existingMembership = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.tenantId, tenant.id), eq(memberships.userId, userId)))
    .limit(1);

  if (existingMembership.length > 0) {
    const member = existingMembership[0];
    const [balance] = await db
      .select()
      .from(membershipBalances)
      .where(eq(membershipBalances.membershipId, member.id))
      .limit(1);

    const qrToken = generateMemberQrToken(member.publicId, member.qrVersion);
    const qrDataUrl = await generateQrDataUrl(qrToken);

    return {
      membership: member,
      balance: balance?.balance || 0,
      qrToken,
      qrDataUrl,
      isNew: false,
    };
  }

  // A friend's code only counts when it is a real, active card at this same business
  let referredByMembershipId: string | null = null;
  const referralCode = input.referralCode?.toUpperCase().trim();
  if (referralCode) {
    const [referrer] = await db
      .select({ id: memberships.id, userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.tenantId, tenant.id), eq(memberships.memberNumber, referralCode), eq(memberships.status, "active")))
      .limit(1);
    if (referrer && referrer.userId !== userId) referredByMembershipId = referrer.id;
  }

  // 3. Create new membership
  const created = await db.transaction(async (tx) => {
    const memberNumber = generateCrockfordCode(8);
    const publicId = `mem_${crypto.randomBytes(12).toString("hex")}`;

    const [newMembership] = await tx
      .insert(memberships)
      .values({
        tenantId: tenant.id,
        userId,
        memberNumber,
        publicId,
        qrVersion: 1,
        status: "active",
        joinedLocationId: locationId,
        referredByMembershipId,
        marketingOptIn: !!input.marketingOptIn,
      })
      .returning();

    // Initial Balance (0 points)
    await tx.insert(membershipBalances).values({
      membershipId: newMembership.id,
      tenantId: tenant.id,
      balance: 0,
      lifetimeEarned: 0,
      lifetimeRedeemed: 0,
    });

    const termsVer = input.termsVersion || "1.0";

    // Consent Record: Programme Terms (Required)
    await tx.insert(consentRecords).values({
      tenantId: tenant.id,
      membershipId: newMembership.id,
      purpose: "programme_terms",
      granted: true,
      textVersion: termsVer,
      source: "join_web",
    });

    // Consent Record: Marketing Email (Optional)
    await tx.insert(consentRecords).values({
      tenantId: tenant.id,
      membershipId: newMembership.id,
      purpose: "marketing_email",
      granted: !!input.marketingOptIn,
      textVersion: termsVer,
      source: "join_web",
    });

    const qrToken = generateMemberQrToken(newMembership.publicId, newMembership.qrVersion);
    const qrDataUrl = await generateQrDataUrl(qrToken);

    return {
      membership: newMembership,
      balance: 0,
      qrToken,
      qrDataUrl,
      isNew: true,
    };
  });

  // Welcome bonus first (if the shop gives one), then the welcome email with their customer ID
  await grantWelcomeBonus(created.membership.tenantId, created.membership.id);
  await emitEvent(created.membership.tenantId, "membership.created", {
    membershipId: created.membership.id,
    memberNumber: created.membership.memberNumber,
    referred: Boolean(referredByMembershipId),
  });
  await emitEvent(created.membership.tenantId, "qr.issued", { membershipId: created.membership.id, kind: "member" });
  if (input.marketingOptIn) await emitEvent(created.membership.tenantId, "consent.granted", { membershipId: created.membership.id, purpose: "marketing_email", source: "join_web" });
  await notifyWelcome(created.membership.id);
  return created;
}

/**
 * Resolves a Member QR scanned by staff.
 * Validates cryptographic signature, version, tenant matching, and active status.
 */
const staffMemberSelect = {
  id: memberships.id,
  tenantId: memberships.tenantId,
  memberNumber: memberships.memberNumber,
  qrVersion: memberships.qrVersion,
  status: memberships.status,
  joinedAt: memberships.joinedAt,
  userName: users.name,
};

type StaffMemberRow = {
  id: string;
  tenantId: string;
  memberNumber: string;
  qrVersion: number;
  status: string;
  joinedAt: Date;
  userName: string | null;
};

/** Balance, rewards and stamp cards for the member a staff user has just identified. */
async function buildStaffMemberSummary(ctx: RequestContext, membership: StaffMemberRow) {
  // Section 9: A member from tenant A identified at tenant B must return "Not a member of this business"
  if (membership.tenantId !== ctx.tenantId) {
    throw new Error("Not a member of this business");
  }
  if (membership.status !== "active") {
    throw new Error(`Membership is ${membership.status}`);
  }

  const [balanceRow] = await db
    .select()
    .from(membershipBalances)
    .where(eq(membershipBalances.membershipId, membership.id))
    .limit(1);

  const currentBalance = balanceRow?.balance || 0;
  const availableRewards = await getRewards(ctx.tenantId, { memberBalance: currentBalance });
  const stampCards = await getMemberStampCards(ctx.tenantId, membership.id, { includeUnstarted: true });

  // Obfuscate customer identity per Section 9 & 14.3: First Name + Last Initial
  let displayName = "Member";
  if (membership.userName) {
    const parts = membership.userName.trim().split(" ");
    displayName = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
  }

  return {
    membershipId: membership.id,
    memberNumber: membership.memberNumber,
    displayName,
    balance: currentBalance,
    lifetimeEarned: balanceRow?.lifetimeEarned || 0,
    lifetimeRedeemed: balanceRow?.lifetimeRedeemed || 0,
    status: membership.status,
    joinedAt: membership.joinedAt,
    availableRewards,
    stampCards,
  };
}

/** Whether this business only accepts live (30-second) QR codes. */
export async function tenantUsesLiveQr(tenantId: string): Promise<boolean> {
  const [t] = await db.select({ features: tenants.features }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return Boolean((t?.features as { liveQr?: boolean } | null)?.liveQr);
}

/** Owner switches live QR codes on or off for the whole business. */
export async function setLiveQr(ctx: RequestContext, enabled: boolean) {
  assertCan(ctx, "tenant.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");
  const [t] = await db.select({ features: tenants.features }).from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
  await db
    .update(tenants)
    .set({ features: { ...((t?.features as Record<string, unknown>) ?? {}), liveQr: enabled } })
    .where(eq(tenants.id, ctx.tenantId));
  await logAuditEvent(ctx, { action: enabled ? "tenant.live_qr_enabled" : "tenant.live_qr_disabled", targetType: "tenant", targetId: ctx.tenantId });
  return { enabled };
}

export async function resolveMemberQrForStaff(
  ctx: RequestContext,
  token: string,
  locationId?: string
) {
  assertCan(ctx, "member.read", { locationId });
  if (!ctx.tenantId) throw new Error("Staff must be scoped to a tenant");

  const verifyResult = verifyAnyMemberQrToken(token);
  if (!verifyResult.valid || !verifyResult.membershipPublicId) {
    await emitEvent(ctx.tenantId, "qr.validation_failed", { reason: verifyResult.error || "invalid" });
    throw new Error(verifyResult.error || "Invalid Member QR code");
  }

  const [membership] = await db
    .select(staffMemberSelect)
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.publicId, verifyResult.membershipPublicId))
    .limit(1);

  if (!membership) {
    throw new Error("Membership not found");
  }
  if (membership.tenantId !== ctx.tenantId) {
    throw new Error("Not a member of this business");
  }

  // Revocation check
  if (membership.qrVersion !== verifyResult.qrVersion) {
    throw new Error("QR code has expired or was revoked. Please refresh your membership card.");
  }

  // A business that uses live QR codes doesn't accept a printed or screenshotted one
  if (!verifyResult.live && (await tenantUsesLiveQr(membership.tenantId))) {
    await emitEvent(ctx.tenantId, "qr.validation_failed", { reason: "static_code_not_accepted" });
    throw new Error("This business uses live QR codes. Ask the customer to open their card so the code refreshes, or type their customer ID.");
  }
  // A live code works once: scanning the same one again is refused, so a photo can't be replayed
  if (verifyResult.live) {
    const used = await db
      .insert(qrTokenUses)
      .values({ tenantId: membership.tenantId, membershipId: membership.id, windowStart: verifyResult.slot! })
      .onConflictDoNothing()
      .returning({ slot: qrTokenUses.windowStart });
    if (used.length === 0) {
      await emitEvent(ctx.tenantId, "qr.validation_failed", { reason: "code_already_used" });
      throw new Error("This QR code was already scanned. Ask the customer to hold up their card again for a fresh one.");
    }
  }

  return buildStaffMemberSummary(ctx, membership);
}

/**
 * Walk-in lookup when the customer can't show a QR code: staff type the
 * customer ID printed under it. Scoped to the staff member's own business.
 */
export async function resolveMemberByNumberForStaff(
  ctx: RequestContext,
  memberNumber: string,
  locationId?: string
) {
  assertCan(ctx, "member.read", { locationId });
  if (!ctx.tenantId) throw new Error("Staff must be scoped to a tenant");

  const normalized = memberNumber.trim().replace(/^#/, "").toUpperCase();
  if (!/^[0-9A-Z-]{4,32}$/.test(normalized)) {
    throw new Error("Customer ID should be the letters and numbers shown under the customer's QR code");
  }

  const [membership] = await db
    .select(staffMemberSelect)
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.memberNumber, normalized)))
    .limit(1);

  if (!membership) {
    throw new Error(`No customer with ID ${normalized} at this business`);
  }
  return buildStaffMemberSummary(ctx, membership);
}

/** Opens a member picked from staff search results. */
export async function getMemberForStaff(ctx: RequestContext, membershipId: string, locationId?: string) {
  assertCan(ctx, "member.read", { locationId });
  if (!ctx.tenantId) throw new Error("Staff must be scoped to a tenant");

  const [membership] = await db
    .select(staffMemberSelect)
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(and(eq(memberships.id, membershipId), eq(memberships.tenantId, ctx.tenantId)))
    .limit(1);

  if (!membership) throw new Error("Customer not found");
  return buildStaffMemberSummary(ctx, membership);
}

export async function revokeMemberQr(ctx: RequestContext, membershipId: string) {
  const [membership] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.id, membershipId))
    .limit(1);

  if (!membership) throw new Error("Membership not found");

  // The member themselves, or an owner/manager of the same business, can revoke
  const isSelf = ctx.userId === membership.userId;
  const isShopManager = (ctx.role === "owner" || ctx.role === "manager") && ctx.tenantId === membership.tenantId;
  if (!isSelf && !isShopManager) {
    throw new Error("FORBIDDEN: Cannot revoke another member's QR");
  }

  const newQrVersion = membership.qrVersion + 1;

  const [updated] = await db
    .update(memberships)
    .set({ qrVersion: newQrVersion })
    .where(eq(memberships.id, membershipId))
    .returning();

  await logAuditEvent(ctx, {
    action: "membership.qr_revoked",
    targetType: "membership",
    targetId: membershipId,
    metadata: { oldVersion: membership.qrVersion, newVersion: newQrVersion },
  });
  await emitEvent(ctx.tenantId, "qr.revoked", { membershipId, newVersion: newQrVersion });

  const newQrToken = generateMemberQrToken(updated.publicId, updated.qrVersion);
  const newQrDataUrl = await generateQrDataUrl(newQrToken);

  return {
    membership: updated,
    qrToken: newQrToken,
    qrDataUrl: newQrDataUrl,
  };
}

export async function suspendMembership(
  ctx: RequestContext,
  membershipId: string,
  reason: string
) {
  assertCan(ctx, "member.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");

  const [updated] = await db
    .update(memberships)
    .set({ status: "suspended" })
    .where(and(eq(memberships.id, membershipId), eq(memberships.tenantId, ctx.tenantId)))
    .returning();

  if (!updated) throw new Error("Membership not found for this tenant");

  await logAuditEvent(ctx, {
    action: "membership.suspended",
    targetType: "membership",
    targetId: membershipId,
    reason,
  });
  await emitEvent(ctx.tenantId, "membership.suspended", { membershipId, reason });

  return updated;
}

export async function reactivateMembership(
  ctx: RequestContext,
  membershipId: string,
  reason?: string
) {
  assertCan(ctx, "member.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");

  const [updated] = await db
    .update(memberships)
    .set({ status: "active" })
    .where(and(eq(memberships.id, membershipId), eq(memberships.tenantId, ctx.tenantId)))
    .returning();

  if (!updated) throw new Error("Membership not found for this tenant");

  await logAuditEvent(ctx, {
    action: "membership.reactivated",
    targetType: "membership",
    targetId: membershipId,
    reason: reason || "Reactivated by management",
  });
  await emitEvent(ctx.tenantId, "membership.updated", { membershipId, change: "reactivated" });

  return updated;
}

