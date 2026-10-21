import { db } from "../db";
import { staffMembers, users, staffLocationScopes, locations, tenants } from "../db/schema";
import { RequestContext, assertCan } from "../security/permissions";
import { invalidateUserSessions, hashPassword } from "../auth";
import { eq, and, count } from "drizzle-orm";
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

  return await db.transaction(async (tx) => {
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
            eq(staffMembers.status, "active")
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
    const [existingUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existingUser) {
      userId = existingUser.id;
    } else {
      const tempPass = params.temporaryPassword || "TempPassword123!";
      const hashed = await hashPassword(tempPass);
      const [newUser] = await tx
        .insert(users)
        .values({
          email: normalizedEmail,
          name: params.name,
          passwordHash: hashed,
          emailVerifiedAt: new Date(),
        })
        .returning({ id: users.id });
      userId = newUser.id;
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
        status: "active",
        invitedBy: ctx.userId,
        acceptedAt: new Date(),
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

    return newStaff;
  });
}

export async function updateStaffMember(
  ctx: RequestContext,
  staffMemberId: string,
  params: {
    role?: "owner" | "manager" | "staff" | "marketing";
    status?: "active" | "revoked";
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

