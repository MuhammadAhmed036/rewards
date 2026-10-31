import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { getCustomerPrivacyData, deleteAndAnonymiseAccount } from "@/server/services/privacy";
import { logAuditEvent } from "@/server/services/audit";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request);
  if ("response" in guard) return guard.response;

  try {
    const data = await getCustomerPrivacyData(guard.ctx.userId);
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          message: err instanceof Error ? err.message : "Profile not found",
        },
      },
      { status: 404 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await guardApiRequest(request);
  if ("response" in guard) return guard.response;

  try {
    const result = await deleteAndAnonymiseAccount(guard.ctx.userId);
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "DELETION_FAILED",
          message: err instanceof Error ? err.message : "Deletion failed",
        },
      },
      { status: 400 }
    );
  }
}


const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const profileSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name").max(80, "Use 80 characters or fewer").optional(),
    // Birthday for a birthday treat: month and day only, or both null to remove it
    birthMonth: z.number().int().min(1).max(12).nullable().optional(),
    birthDay: z.number().int().min(1).max(31).nullable().optional(),
  })
  .refine((v) => (v.birthMonth == null) === (v.birthDay == null), "Pick both the day and the month")
  .refine((v) => v.birthMonth == null || v.birthDay! <= DAYS_IN_MONTH[v.birthMonth - 1], "That date doesn't exist");

/**
 * Customers change the name shops see (FR-005). Email changes need re-verification,
 * so they go through support rather than this form.
 */
export async function PATCH(request: NextRequest) {
  const guard = await guardApiRequest(request);
  if ("response" in guard) return guard.response;

  try {
    const input = profileSchema.parse(await request.json().catch(() => ({})));
    const changes: { name?: string; birthMonth?: number | null; birthDay?: number | null } = {};
    if (input.name !== undefined) changes.name = input.name;
    if (input.birthMonth !== undefined) {
      changes.birthMonth = input.birthMonth;
      changes.birthDay = input.birthDay ?? null;
    }
    if (Object.keys(changes).length === 0) throw new z.ZodError([]);
    await db.update(users).set(changes).where(eq(users.id, guard.ctx.userId));
    await logAuditEvent(guard.ctx, { action: "customer.profile_updated", targetType: "user", targetId: guard.ctx.userId, metadata: { fields: Object.keys(changes) } });
    return NextResponse.json({ data: changes });
  } catch (err) {
    const message = err instanceof z.ZodError ? err.errors[0]?.message || "Nothing to save" : "Couldn't save your details";
    return NextResponse.json({ error: { code: "PROFILE_UPDATE_FAILED", message } }, { status: 400 });
  }
}
