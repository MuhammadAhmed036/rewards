import { NextRequest, NextResponse } from "next/server";
import { requireRecentAuth } from "@/server/auth/reauth";
import { suspendMembership, reactivateMembership } from "@/server/services/member";
import { guardApiRequest } from "@/server/auth/route-guard";
import { db } from "@/server/db";
import {
  memberships,
  users,
  membershipBalances,
  ledgerEntries,
} from "@/server/db/schema";
import { adjustBalance } from "@/server/services/ledger";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ membershipId: string }> }
) {
  const params = await props.params;
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  const { ctx } = guard;

  const [member] = await db
    .select({
      id: memberships.id,
      memberNumber: memberships.memberNumber,
      status: memberships.status,
      joinedAt: memberships.joinedAt,
      marketingOptIn: memberships.marketingOptIn,
      balance: membershipBalances.balance,
      lifetimeEarned: membershipBalances.lifetimeEarned,
      lifetimeRedeemed: membershipBalances.lifetimeRedeemed,
      name: users.name,
      email: users.email,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .leftJoin(membershipBalances, eq(memberships.id, membershipBalances.membershipId))
    .where(
      and(
        eq(memberships.id, params.membershipId),
        eq(memberships.tenantId, ctx.tenantId!)
      )
    )
    .limit(1);

  if (!member) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Member not found" } },
      { status: 404 }
    );
  }

  // Fetch recent ledger
  const history = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.membershipId, member.id))
    .orderBy(desc(ledgerEntries.occurredAt))
    .limit(20);

  return NextResponse.json({ data: { member, history } });
}

const adjustSchema = z.object({
  pointsDelta: z.number().int(),
  reasonCode: z.enum(["goodwill", "correction", "fraud_removal", "other"]),
  note: z.string().min(1, "Note is required for adjustments"),
});

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ membershipId: string }> }
) {
  const params = await props.params;
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;
  const denied = await requireRecentAuth(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const validated = adjustSchema.parse(body);

    const idempotencyKey =
      request.headers.get("idempotency-key") || crypto.randomUUID();

    const result = await adjustBalance(guard.ctx, {
      membershipId: params.membershipId,
      pointsDelta: validated.pointsDelta,
      reasonCode: validated.reasonCode,
      note: validated.note,
      idempotencyKey,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "ADJUSTMENT_FAILED",
          message: err instanceof Error ? err.message : "Adjustment failed",
        },
      },
      { status: 400 }
    );
  }
}

const statusUpdateSchema = z.object({
  status: z.enum(["active", "suspended"]),
  reason: z.string().trim().max(300).optional(),
});

/** Suspend a misused card or reactivate it, with a reason kept in the audit log (FR-083). */
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ membershipId: string }> }
) {
  const params = await props.params;
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  try {
    const { status, reason } = statusUpdateSchema.parse(await request.json());
    if (status === "suspended" && !reason) throw new Error("Say why you're suspending this card");
    const updated =
      status === "suspended"
        ? await suspendMembership(guard.ctx, params.membershipId, reason!)
        : await reactivateMembership(guard.ctx, params.membershipId, reason);
    return NextResponse.json({ data: updated });
  } catch (err) {
    const message =
      err instanceof z.ZodError ? err.errors[0]?.message : err instanceof Error ? err.message : "Status update failed";
    return NextResponse.json({ error: { code: "UPDATE_FAILED", message } }, { status: 400 });
  }
}
