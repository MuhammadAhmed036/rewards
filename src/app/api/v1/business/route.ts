import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { db } from "@/server/db";
import { tenants, programmes } from "@/server/db/schema";
import { logoRefSql, resolveLogoUrl, validateLogoDataUrl } from "@/server/services/business-logo";
import { logAuditEvent } from "@/server/services/audit";
import { eq } from "drizzle-orm";
import { z } from "zod";

async function loadBusiness(tenantId: string) {
  const [tenant] = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      brandPrimaryHex: tenants.brandPrimaryHex,
      logoRef: logoRefSql,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenant) return null;

  const [prog] = await db
    .select({ type: programmes.type, name: programmes.name })
    .from(programmes)
    .where(eq(programmes.tenantId, tenantId))
    .limit(1);

  const { logoRef, ...rest } = tenant;
  return {
    ...rest,
    logoUrl: resolveLogoUrl(tenant.id, logoRef),
    programmeType: (prog?.type as "points" | "stamps") || "points",
    programmeName: prog?.name || `${tenant.name} Rewards`,
  };
}

/** The signed-in owner's or staff member's own business: name, brand colour and logo. */
export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager", "staff", "marketing"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  const business = await loadBusiness(guard.ctx.tenantId!);
  if (!business) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Business not found" } },
      { status: 404 }
    );
  }
  return NextResponse.json({ data: business });
}

const updateSchema = z.object({
  logoDataUrl: z.string().nullable(),
});

/** Owners upload, replace or remove their business logo. */
export async function PATCH(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  try {
    const body = updateSchema.parse(await request.json());
    const logoUrl = body.logoDataUrl === null ? null : validateLogoDataUrl(body.logoDataUrl);

    await db.update(tenants).set({ logoUrl }).where(eq(tenants.id, guard.ctx.tenantId!));

    await logAuditEvent(guard.ctx, {
      action: logoUrl ? "tenant.logo_updated" : "tenant.logo_removed",
      targetType: "tenant",
      targetId: guard.ctx.tenantId!,
    });

    return NextResponse.json({ data: await loadBusiness(guard.ctx.tenantId!) });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "LOGO_UPDATE_FAILED",
          message: err instanceof Error ? err.message : "Failed to update logo",
        },
      },
      { status: 400 }
    );
  }
}
