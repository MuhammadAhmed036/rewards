import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { redeemForMember } from "@/server/services/ledger";
import { z } from "zod";

const bodySchema = z.union([
  z.object({
    rewardId: z.string().uuid(),
    locationId: z.string().uuid().optional(),
  }),
  z.object({
    productId: z.string().uuid().optional(),
    title: z.string().max(200).optional(),
    costPoints: z.number().int("Points must be a whole number").min(1, "Points must be at least 1"),
    note: z.string().max(300).optional(),
    locationId: z.string().uuid().optional(),
  }),
]);

/** Staff or the owner spend a customer's points on a points-menu reward or an item they choose. */
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ membershipId: string }> }
) {
  const { membershipId } = await props.params;
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager", "staff"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  try {
    const body = bodySchema.parse(await request.json());
    const idempotencyKey = request.headers.get("idempotency-key") || crypto.randomUUID();
    const result = await redeemForMember(guard.ctx, { ...body, membershipId, idempotencyKey });
    return NextResponse.json({ data: result });
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? err.errors[0]?.message || "Check the details and try again"
        : err instanceof Error
          ? err.message.replace(/^[A-Z_]+: /, "")
          : "Couldn't use the points";
    return NextResponse.json({ error: { code: "REDEEM_FAILED", message } }, { status: 400 });
  }
}
