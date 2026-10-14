import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { db } from "@/server/db";
import { ledgerEntries, memberships, users } from "@/server/db/schema";
import { reverseTransaction } from "@/server/services/ledger";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  const { ctx } = guard;

  const rows = await db
    .select({
      id: ledgerEntries.id,
      type: ledgerEntries.type,
      pointsDelta: ledgerEntries.pointsDelta,
      basisAmountMinor: ledgerEntries.basisAmountMinor,
      reasonCode: ledgerEntries.reasonCode,
      note: ledgerEntries.note,
      occurredAt: ledgerEntries.occurredAt,
      idempotencyKey: ledgerEntries.idempotencyKey,
      memberNumber: memberships.memberNumber,
      memberName: users.name,
      actorName: users.name,
    })
    .from(ledgerEntries)
    .innerJoin(memberships, eq(ledgerEntries.membershipId, memberships.id))
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(ledgerEntries.tenantId, ctx.tenantId!))
    .orderBy(desc(ledgerEntries.occurredAt))
    .limit(100);

  return NextResponse.json({ data: rows });
}

const reverseSchema = z.object({
  ledgerEntryId: z.string().uuid(),
  reasonCode: z.enum(["correction", "goodwill", "fraud_removal", "other"]),
  note: z.string().min(1, "Note is required for reversals"),
});

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  try {
    const body = await request.json();
    const validated = reverseSchema.parse(body);

    const idempotencyKey =
      request.headers.get("idempotency-key") || crypto.randomUUID();

    const result = await reverseTransaction(guard.ctx, {
      ...validated,
      idempotencyKey,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "REVERSAL_FAILED",
          message: err instanceof Error ? err.message : "Reversal failed",
        },
      },
      { status: 400 }
    );
  }
}
