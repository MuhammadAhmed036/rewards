import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { getTenantDetail, updateTenantByAdmin } from "@/server/services/admin";
import { z } from "zod";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ tenantId: string }> }
) {
  const params = await props.params;
  const guard = await guardApiRequest(request, {
    allowedRoles: ["platform_admin"],
  });
  if ("response" in guard) return guard.response;

  try {
    const reason = request.nextUrl.searchParams.get("reason") || undefined;
    const detail = await getTenantDetail(guard.ctx, params.tenantId, reason);
    return NextResponse.json({ data: detail });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          message: err instanceof Error ? err.message : "Tenant not found",
        },
      },
      { status: 404 }
    );
  }
}

const updateSchema = z.object({
  status: z.enum(["active", "suspended", "closed"]).optional(),
  plan: z.enum(["free", "pro"]).optional(),
  features: z.record(z.unknown()).optional(),
  limits: z.record(z.unknown()).optional(),
  reason: z.string().min(1, "Reason is required for platform admin modifications"),
});

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ tenantId: string }> }
) {
  const params = await props.params;
  const guard = await guardApiRequest(request, {
    allowedRoles: ["platform_admin"],
  });
  if ("response" in guard) return guard.response;

  try {
    const body = await request.json();
    const validated = updateSchema.parse(body);

    const updated = await updateTenantByAdmin(guard.ctx, params.tenantId, validated);
    return NextResponse.json({ data: updated });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "UPDATE_FAILED",
          message: err instanceof Error ? err.message : "Failed to update tenant",
        },
      },
      { status: 400 }
    );
  }
}
