import { db } from "../db";
import {
  memberships,
  membershipBalances,
  consentRecords,
  users,
  tenants,
  locations,
} from "../db/schema";
import {
  generateCrockfordCode,
  generateMemberQrToken,
  verifyMemberQrToken,
  generateQrDataUrl,
} from "../qr";
import { getRewards } from "./rewards";
import { RequestContext, assertCan } from "../security/permissions";
import { logAuditEvent } from "./audit";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

export interface JoinProgrammeInput {
  tenantSlug: string;
  email: string;
  name?: string;
  marketingOptIn?: boolean;
  termsVersion?: string;
  locationPublicId?: string;
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

  let locationId: string | null = null;
  if (input.locationPublicId) {
    const [loc] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.tenantId, tenant.id), eq(locations.publicId, input.locationPublicId)))
      .limit(1);
    if (loc) locationId = loc.id;
  }

  // 1. Ensure user exists
  let userId: string;
  const existingUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existingUsers.length > 0) {
    userId = existingUsers[0].id;
  } else {
    const [newUser] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        name: input.name || null,
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

  // 3. Create new membership
  return await db.transaction(async (tx) => {
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
}

/**
 * Resolves a Member QR scanned by staff.
 * Validates cryptographic signature, version, tenant matching, and active status.
 */
export async function resolveMemberQrForStaff(
  ctx: RequestContext,
  token: string,
  locationId?: string
) {
  assertCan(ctx, "member.read", { locationId });
  if (!ctx.tenantId) throw new Error("Staff must be scoped to a tenant");

  const verifyResult = verifyMemberQrToken(token);
  if (!verifyResult.valid || !verifyResult.membershipPublicId) {
    throw new Error(verifyResult.error || "Invalid Member QR code");
  }

  // Find membership
  const [membership] = await db
    .select({
      id: memberships.id,
      tenantId: memberships.tenantId,
      userId: memberships.userId,
      memberNumber: memberships.memberNumber,
      publicId: memberships.publicId,
      qrVersion: memberships.qrVersion,
      status: memberships.status,
      joinedAt: memberships.joinedAt,
      user: {
        name: users.name,
        email: users.email,
      },
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.publicId, verifyResult.membershipPublicId))
    .limit(1);

  if (!membership) {
    throw new Error("Membership not found");
  }

  // Section 9: A Member QR from tenant A scanned at tenant B must return "Not a member of this business"
  if (membership.tenantId !== ctx.tenantId) {
    throw new Error("Not a member of this business");
  }

  // Revocation check
  if (membership.qrVersion !== verifyResult.qrVersion) {
    throw new Error("QR code has expired or was revoked. Please refresh your membership card.");
  }

  if (membership.status !== "active") {
    throw new Error(`Membership is ${membership.status}`);
  }

  // Get balance
  const [balanceRow] = await db
    .select()
    .from(membershipBalances)
    .where(eq(membershipBalances.membershipId, membership.id))
    .limit(1);

  const currentBalance = balanceRow?.balance || 0;

  // Available rewards with eligibility
  const availableRewards = await getRewards(ctx.tenantId, {
    memberBalance: currentBalance,
  });

  // Obfuscate customer identity per Section 9 & 14.3: First Name + Last Initial
  let displayName = "Member";
  if (membership.user.name) {
    const parts = membership.user.name.trim().split(" ");
    if (parts.length > 1) {
      displayName = `${parts[0]} ${parts[parts.length - 1][0]}.`;
    } else {
      displayName = parts[0];
    }
  }

  return {
    membershipId: membership.id,
    memberNumber: membership.memberNumber,
    displayName,
    balance: currentBalance,
    lifetimeEarned: balanceRow?.lifetimeEarned || 0,
    status: membership.status,
    joinedAt: membership.joinedAt,
    availableRewards,
  };
}

export async function revokeMemberQr(ctx: RequestContext, membershipId: string) {
  const [membership] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.id, membershipId))
    .limit(1);

  if (!membership) throw new Error("Membership not found");

  // Owner, manager, or the member themselves can revoke
  if (ctx.userId !== membership.userId && ctx.role !== "owner" && ctx.role !== "manager") {
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

  const newQrToken = generateMemberQrToken(updated.publicId, updated.qrVersion);
  const newQrDataUrl = await generateQrDataUrl(newQrToken);

  return {
    membership: updated,
    qrToken: newQrToken,
    qrDataUrl: newQrDataUrl,
  };
}
