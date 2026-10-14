import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { db } from "@/server/db";
import {
  staffMembers,
  users,
  staffLocationScopes,
  locations,
} from "@/server/db/schema";
import { invalidateUserSessions, hashPassword } from "@/server/auth";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { logAuditEvent } from "@/server/services/audit";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  const { ctx } = guard;

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
    .where(eq(staffMembers.tenantId, ctx.tenantId!));

  const scopes = await db
    .select({
      staffMemberId: staffLocationScopes.staffMemberId,
      locationId: staffLocationScopes.locationId,
      locationName: locations.name,
    })
    .from(staffLocationScopes)
    .innerJoin(locations, eq(staffLocationScopes.locationId, locations.id));

  const list = staffRows.map((s) => ({
    ...s,
    locations: scopes
      .filter((sc) => sc.staffMemberId === s.id)
      .map((sc) => ({ id: sc.locationId, name: sc.locationName })),
  }));

  return NextResponse.json({ data: list });
}

const addStaffSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["manager", "staff", "marketing"]),
  locationIds: z.array(z.string().uuid()).optional(),
  temporaryPassword: z.string().min(8).optional(),
});

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  try {
    const body = await request.json();
    const validated = addStaffSchema.parse(body);
    const normalizedEmail = validated.email.toLowerCase().trim();

    return await db.transaction(async (tx) => {
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
        const tempPass = validated.temporaryPassword || "TempPassword123!";
        const hashed = await hashPassword(tempPass);
        const [newUser] = await tx
          .insert(users)
          .values({
            email: normalizedEmail,
            name: validated.name,
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
            eq(staffMembers.tenantId, guard.ctx.tenantId!),
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
          tenantId: guard.ctx.tenantId!,
          userId,
          role: validated.role,
          status: "active",
          invitedBy: guard.ctx.userId,
          acceptedAt: new Date(),
        })
        .returning();

      if (validated.locationIds && validated.locationIds.length > 0) {
        await tx.insert(staffLocationScopes).values(
          validated.locationIds.map((locId) => ({
            staffMemberId: newStaff.id,
            locationId: locId,
          }))
        );
      }

      await logAuditEvent(
        guard.ctx,
        {
          action: "staff.added",
          targetType: "staff_member",
          targetId: newStaff.id,
          metadata: { email: normalizedEmail, role: validated.role },
        },
        tx
      );

      return NextResponse.json({ data: newStaff });
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "ADD_STAFF_FAILED",
          message: err instanceof Error ? err.message : "Failed to add team member",
        },
      },
      { status: 400 }
    );
  }
}

const updateStaffSchema = z.object({
  staffMemberId: z.string().uuid(),
  role: z.enum(["owner", "manager", "staff", "marketing"]).optional(),
  status: z.enum(["active", "revoked"]).optional(),
});

export async function PATCH(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  try {
    const body = await request.json();
    const validated = updateStaffSchema.parse(body);

    const [existing] = await db
      .select()
      .from(staffMembers)
      .where(
        and(
          eq(staffMembers.id, validated.staffMemberId),
          eq(staffMembers.tenantId, guard.ctx.tenantId!)
        )
      )
      .limit(1);

    if (!existing) throw new Error("Staff member not found");

    const [updated] = await db
      .update(staffMembers)
      .set({
        role: validated.role ?? existing.role,
        status: validated.status ?? existing.status,
      })
      .where(eq(staffMembers.id, existing.id))
      .returning();

    // Section 10 & 12: Invalidate sessions immediately on revoke or role change!
    if (validated.status === "revoked" || (validated.role && validated.role !== existing.role)) {
      await invalidateUserSessions(existing.userId);
    }

    await logAuditEvent(guard.ctx, {
      action: validated.status === "revoked" ? "staff.revoked" : "staff.role_updated",
      targetType: "staff_member",
      targetId: existing.id,
      metadata: { changes: validated },
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "UPDATE_STAFF_FAILED",
          message: err instanceof Error ? err.message : "Failed to update staff member",
        },
      },
      { status: 400 }
    );
  }
}

