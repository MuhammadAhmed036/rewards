import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import {
  resolveMemberQrForStaff,
  resolveMemberByNumberForStaff,
  getMemberForStaff,
} from "@/server/services/member";
import { checkScanResolveRateLimit, RateLimitError, rateLimitResponse } from "@/server/security/rate-limit";
import { z } from "zod";

// Staff identify a customer by scanned QR token, typed customer ID, or a pick from search.
const resolveSchema = z
  .object({
    token: z.string().min(1).optional(),
    memberNumber: z.string().min(1).optional(),
    membershipId: z.string().uuid().optional(),
    locationId: z.string().optional(),
  })
  .refine((v) => v.token || v.memberNumber || v.membershipId, {
    message: "Scan a QR code or enter a customer ID",
  });

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager", "staff"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  try {
    await checkScanResolveRateLimit(guard.ctx.userId);

    const body = await request.json().catch(() => ({}));
    const validated = resolveSchema.parse(body);

    const summary = validated.token
      ? await resolveMemberQrForStaff(guard.ctx, validated.token, validated.locationId)
      : validated.memberNumber
      ? await resolveMemberByNumberForStaff(guard.ctx, validated.memberNumber, validated.locationId)
      : await getMemberForStaff(guard.ctx, validated.membershipId!, validated.locationId);

    return NextResponse.json({ data: summary });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return rateLimitResponse(err);
    }
    return NextResponse.json(
      {
        error: {
          code: "SCAN_RESOLVE_FAILED",
          message: err instanceof Error ? err.message : "Failed to resolve QR",
        },
      },
      { status: 400 }
    );
  }
}

