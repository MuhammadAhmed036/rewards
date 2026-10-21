import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import {
  listStaffMembers,
  addStaffMember,
  updateStaffMember,
} from "@/server/services/staff";
import { z } from "zod";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  try {
    const list = await listStaffMembers(guard.ctx);
    return NextResponse.json({ data: list });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "LIST_STAFF_FAILED",
          message: err instanceof Error ? err.message : "Failed to list team members",
        },
      },
      { status: 400 }
    );
  }
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

    const newStaff = await addStaffMember(guard.ctx, validated);
    return NextResponse.json({ data: newStaff });
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

    const updated = await updateStaffMember(guard.ctx, validated.staffMemberId, validated);
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
