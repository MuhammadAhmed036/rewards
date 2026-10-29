import { db } from "../db";
import { staffMembers, users, staffLocationScopes, locations, tenants, staffInvitations } from "../db/schema";
import { RequestContext, assertCan } from "../security/permissions";
import { invalidateUserSessions, hashPassword } from "../auth";
import { eq, and, count, inArray, gt, isNull } from "drizzle-orm";
import crypto from "crypto";
import { env } from "@/lib/env";
import { sendEmailNow } from "./email";
import { hashLinkToken } from "./verification";
import { logAuditEvent } from "./audit";

export interface AddStaffParams {
  email: string;
  name: string;
  role: "manager" | "staff" | "marketing";
  locationIds?: string[];
  temporaryPassword?: string;
}

export async function addStaffMember(ctx: RequestContext, params: AddStaffParams) {
  assertCan(ctx, "staff.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");

  const normalizedEmail = params.email.toLowerCase().trim();

  const created = await db.transaction(async (tx) => {
    // Check tier limit: maxStaff (A18 / FR-011)
    const [tenant] = await tx
      .select({ limits: tenants.limits })
      .from(tenants)
      .where(eq(tenants.id, ctx.tenantId!))
      .limit(1);

    const maxStaff = (tenant?.limits as Record<string, unknown> | null)?.maxStaff;
    if (typeof maxStaff === "number" && maxStaff > 0) {
      const [staffCount] = await tx
        .select({ count: count() })
        .from(staffMembers)
        .where(
          and(
            eq(staffMembers.tenantId, ctx.tenantId!),
            inArray(staffMembers.status, ["active", "invited"])
          )
        );

      if (Number(staffCount?.count ?? 0) >= maxStaff) {
        throw new Error(
          `Staff limit reached for your plan (maximum: ${maxStaff}). Upgrade your plan to add more team members.`
        );
      }
    }

    // Find or create user
    let userId: string;
    let needsInvite = false;
    const [existingUser] = await tx
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existingUser) {
      userId = existingUser.id;
      // Someone with an account but no password yet (e.g. an earlier unanswered invite) still needs a link
      needsInvite = !existingUser.passwordHash && !params.temporaryPassword;
    } else {
      // With no temporary password, the person chooses their own from the invite email (FR-007)
      const [newUser] = await tx
        .insert(users)
        .values({
          email: normalizedEmail,
          name: params.name,
          passwordHash: params.temporaryPassword ? await hashPassword(params.temporaryPassword) : null,
          emailVerifiedAt: params.temporaryPassword ? new Date() : null,
        })
        .returning({ id: users.id });
      userId = newUser.id;
      needsInvite = !params.temporaryPassword;
    }

    // Check if already staff
    const [existingStaff] = await tx
      .select()
      .from(staffMembers)
      .where(
        and(
          eq(staffMembers.tenantId, ctx.tenantId!),
          eq(staffMembers.userId, userId)
        )
      )
      .limit(1);

    if (existingStaff) {
      throw new Error("User is already a team member of this business");
    }

    const [newStaff] = await tx
      .insert(staffMembers)
      .values({
        tenantId: ctx.tenantId!,
        userId,
        role: params.role,
        status: needsInvite ? "invited" : "active",
        invitedBy: ctx.userId,
        acceptedAt: needsInvite ? null : new Date(),
      })
      .returning();

    if (params.locationIds && params.locationIds.length > 0) {
      await tx.insert(staffLocationScopes).values(
        params.locationIds.map((locId) => ({
          staffMemberId: newStaff.id,
          locationId: locId,
        }))
      );
    }

    await logAuditEvent(
      ctx,
      {
        action: "staff.added",
        targetType: "staff_member",
        targetId: newStaff.id,
        metadata: { email: normalizedEmail, role: params.role },
      },
      tx
    );

    return { staff: newStaff, needsInvite };
  });

  const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
  if (created.needsInvite) {
    await sendStaffInvite(ctx.tenantId, normalizedEmail, params.role, tenant?.name ?? "your business");
  } else {
    // They already have a password: just let them know where to sign in
    await sendEmailNow({
      toEmail: normalizedEmail,
      template: "staff_invitation",
      tenantId: ctx.tenantId,
      payload: { businessName: tenant?.name, role: params.role, isNewAccount: false, url: `${env.APP_URL}/login` },
    }).catch(() => undefined);
  }
  return created.staff;
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Creates a fresh 7-day invite link (replacing older ones) and emails it. */
async function sendStaffInvite(tenantId: string, email: string, role: string, businessName: string) {
  const token = crypto.randomBytes(32).toString("hex");
  await db.delete(staffInvitations).where(and(eq(staffInvitations.tenantId, tenantId), eq(staffInvitations.email, email)));
  await db.insert(staffInvitations).values({
    tenantId,
    email,
    role,
    tokenHash: hashLinkToken(token),
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });
  await sendEmailNow({
    toEmail: email,
    template: "staff_invitation",
    tenantId,
    payload: { businessName, role, isNewAccount: true, url: `${env.APP_URL}/accept-invite?token=${token}` },
  }).catch(() => undefined);
  return token;
}

/** Owner asks for another invite email for someone who hasn't accepted yet. */
export async function resendStaffInvitation(ctx: RequestContext, staffMemberId: string) {
  assertCan(ctx, "staff.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");
  const [row] = await db
    .select({ status: staffMembers.status, role: staffMembers.role, email: users.email, businessName: tenants.name })
    .from(staffMembers)
    .innerJoin(users, eq(users.id, staffMembers.userId))
    .innerJoin(tenants, eq(tenants.id, staffMembers.tenantId))
    .where(and(eq(staffMembers.id, staffMemberId), eq(staffMembers.tenantId, ctx.tenantId)))
    .limit(1);
  if (!row) throw new Error("Staff member not found");
  if (row.status !== "invited") throw new Error("They've already accepted. They can sign in, or use Forgot password.");
  await sendStaffInvite(ctx.tenantId, row.email, row.role, row.businessName);
  await logAuditEvent(ctx, { action: "staff.invite_resent", targetType: "staff_member", targetId: staffMemberId });
  return { sent: true };
}

async function findInvitation(token: string) {
  const [invite] = await db
    .select({
      id: staffInvitations.id,
      tenantId: staffInvitations.tenantId,
      email: staffInvitations.email,
      role: staffInvitations.role,
      businessName: tenants.name,
    })
    .from(staffInvitations)
    .innerJoin(tenants, eq(tenants.id, staffInvitations.tenantId))
    .where(
      and(
        eq(staffInvitations.tokenHash, hashLinkToken(token)),
        gt(staffInvitations.expiresAt, new Date()),
        isNull(staffInvitations.acceptedAt)
      )
    )
    .limit(1);
  if (!invite) throw new Error("This invite has expired or was already used. Ask the owner to send a new one.");
  return invite;
}

/** What the accept-invite page shows before the person sets their password. */
export async function describeInvitation(token: string) {
  const invite = await findInvitation(token);
  const [user] = await db.select({ name: users.name }).from(users).where(eq(users.email, invite.email)).limit(1);
  return { businessName: invite.businessName, email: invite.email, role: invite.role, name: user?.name ?? "" };
}

/** The invited person sets their password; their staff access starts straight away. */
export async function acceptStaffInvitation(token: string, input: { password: string; name?: string }) {
  if (input.password.length < 8) throw new Error("Use at least 8 characters for your password.");
  const invite = await findInvitation(token);

  return await db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.email, invite.email)).limit(1);
    if (!user) throw new Error("This invite has expired or was already used. Ask the owner to send a new one.");
    await tx
      .update(users)
      .set({
        passwordHash: await hashPassword(input.password),
        name: input.name?.trim() || user.name,
        // Opening the emailed link proves they own the address
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      })
      .where(eq(users.id, user.id));
    const [staff] = await tx
      .update(staffMembers)
      .set({ status: "active", acceptedAt: new Date() })
      .where(and(eq(staffMembers.tenantId, invite.tenantId), eq(staffMembers.userId, user.id), eq(staffMembers.status, "invited")))
      .returning({ id: staffMembers.id });
    if (!staff) throw new Error("This invite was cancelled. Ask the owner to add you again.");
    await tx.update(staffInvitations).set({ acceptedAt: new Date() }).where(eq(staffInvitations.id, invite.id));
    return { email: invite.email, businessName: invite.businessName };
  });
}

export async function updateStaffMember(
  ctx: RequestContext,
  staffMemberId: string,
  params: {
    role?: "owner" | "manager" | "staff" | "marketing";
    status?: "active" | "revoked";
    /** Locations this person may work at; an empty list means every location. */
    locationIds?: string[];
  }
) {
  assertCan(ctx, "staff.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");

  const [existing] = await db
    .select()
    .from(staffMembers)
    .where(
      and(
        eq(staffMembers.id, staffMemberId),
        eq(staffMembers.tenantId, ctx.tenantId)
      )
    )
    .limit(1);

  if (!existing) throw new Error("Staff member not found");

  const [updated] = await db
    .update(staffMembers)
    .set({
      role: params.role ?? existing.role,
      status: params.status ?? existing.status,
    })
    .where(eq(staffMembers.id, existing.id))
    .returning();

  if (params.locationIds) {
    const wanted = [...new Set(params.locationIds)];
    if (wanted.length > 0) {
      const own = await db
        .select({ id: locations.id })
        .from(locations)
        .where(and(eq(locations.tenantId, ctx.tenantId), inArray(locations.id, wanted)));
      if (own.length !== wanted.length) throw new Error("One of those locations isn't part of your business");
    }
    // Scopes are read on every request, so the change applies straight away
    await db.transaction(async (tx) => {
      await tx.delete(staffLocationScopes).where(eq(staffLocationScopes.staffMemberId, existing.id));
      if (wanted.length > 0) {
        await tx.insert(staffLocationScopes).values(wanted.map((locationId) => ({ staffMemberId: existing.id, locationId })));
      }
    });
  }

  // Invalidate sessions immediately on revoke or role change per Section 10 & 12
  if (params.status === "revoked" || (params.role && params.role !== existing.role)) {
    await invalidateUserSessions(existing.userId);
  }

  await logAuditEvent(ctx, {
    action: params.status === "revoked" ? "staff.revoked" : "staff.role_updated",
    targetType: "staff_member",
    targetId: existing.id,
    metadata: { changes: params },
  });

  return updated;
}

export async function listStaffMembers(ctx: RequestContext) {
  assertCan(ctx, "staff.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");

  const staffRows = await db
    .select({
      id: staffMembers.id,
      userId: staffMembers.userId,
      role: staffMembers.role,
      status: staffMembers.status,
      createdAt: staffMembers.createdAt,
      name: users.name,
      email: users.email,
    })
    .from(staffMembers)
    .innerJoin(users, eq(staffMembers.userId, users.id))
    .where(eq(staffMembers.tenantId, ctx.tenantId));

  const scopes = await db
    .select({
      staffMemberId: staffLocationScopes.staffMemberId,
      locationId: staffLocationScopes.locationId,
      locationName: locations.name,
    })
    .from(staffLocationScopes)
    .innerJoin(locations, eq(staffLocationScopes.locationId, locations.id));

  return staffRows.map((s) => ({
    ...s,
    locations: scopes
      .filter((sc) => sc.staffMemberId === s.id)
      .map((sc) => ({ id: sc.locationId, name: sc.locationName })),
  }));
}

