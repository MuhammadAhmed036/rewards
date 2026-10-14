import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { confirmRedemption } from "@/server/services/ledger";
import { z } from "zod";
import crypto from "crypto";

const confirmSchema = z.object({
  code: z.string().min(1, "Redemption code is required"),
  locationId: z.string().uuid("Location ID is required"),
});

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager", "staff"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  const idempotencyKey =
    request.headers.get("idempotency-key") ||
    request.headers.get("x-idempotency-key") ||
    crypto.randomUUID();

  try {
    const body = await request.json();
    const validated = confirmSchema.parse(body);

    const result = await confirmRedemption(guard.ctx, {
      ...validated,
      idempotencyKey,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Confirmation failed";
    let code = "CONFIRMATION_FAILED";
    if (message.includes("CODE_ALREADY_USED")) code = "CODE_ALREADY_USED";
    if (message.includes("CODE_EXPIRED")) code = "CODE_EXPIRED";
    if (message.includes("INSUFFICIENT_BALANCE")) code = "INSUFFICIENT_BALANCE";

    return NextResponse.json(
      {
        error: {
          code,
          message,
        },
      },
      { status: 400 }
    );
  }
}

