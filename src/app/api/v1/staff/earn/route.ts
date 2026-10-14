import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { earn } from "@/server/services/ledger";
import { z } from "zod";
import crypto from "crypto";

const earnSchema = z.object({
  membershipId: z.string().uuid(),
  locationId: z.string().uuid(),
  amountMinor: z.number().int().min(0).optional(),
  tipMinor: z.number().int().min(0).optional(),
  managerOverrideReason: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager", "staff"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  // Read Idempotency-Key header or body fallback
  const idempotencyKey =
    request.headers.get("idempotency-key") ||
    request.headers.get("x-idempotency-key") ||
    crypto.randomUUID();

  try {
    const body = await request.json();
    const validated = earnSchema.parse(body);

    const result = await earn(guard.ctx, {
      ...validated,
      idempotencyKey,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Earn failed";
    const status = message.includes("DUPLICATE_VISIT") ? 429 : 400;

    return NextResponse.json(
      {
        error: {
          code: message.includes("DUPLICATE_VISIT") ? "DUPLICATE_VISIT" : "EARN_FAILED",
          message,
        },
      },
      { status }
    );
  }
}

