import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiKeyError, authenticateApiKey, earnFromExternalSale } from "@/server/services/api-keys";
import { RateLimitError, rateLimitResponse } from "@/server/security/rate-limit";

const bodySchema = z
  .object({
    memberNumber: z.string().min(4).max(16).optional(),
    qrToken: z.string().min(10).max(300).optional(),
    locationId: z.string().uuid(),
    amountMinor: z.number().int().min(1).max(100_000_000),
    tipMinor: z.number().int().min(0).max(100_000_000).optional(),
    // The sale's own number in the till, so the same sale never earns twice
    externalRef: z.string().min(1).max(120),
  })
  .refine((b) => b.memberNumber || b.qrToken, { message: "Send memberNumber or qrToken." });

/** A till or POS reports a sale. Needs an API key with the earn:write scope. */
export async function POST(request: NextRequest) {
  try {
    const key = await authenticateApiKey(request, "earn:write");
    const body = bodySchema.parse(await request.json());
    const result = await earnFromExternalSale(key, body);
    return NextResponse.json({ data: { pointsAwarded: result.pointsDelta, newBalance: result.newBalance, duplicate: result.isDuplicate } });
  } catch (err) {
    if (err instanceof RateLimitError) return rateLimitResponse(err);
    if (err instanceof ApiKeyError) return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: { code: "BAD_REQUEST", message: err.errors[0]?.message ?? "Check the request." } }, { status: 400 });
    const message = err instanceof Error ? err.message.replace(/^[A-Z_]+:\s*/, "") : "Could not record the sale.";
    return NextResponse.json({ error: { code: "EARN_FAILED", message } }, { status: 422 });
  }
}
