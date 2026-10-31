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
      industry: tenants.industry,
      timezone: tenants.timezone,
      currency: tenants.currency,
      locale: tenants.locale,
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

// Currencies and languages the app can show today; add more here as they're supported
const CURRENCIES = ["GBP", "EUR", "USD", "PKR", "AED", "SAR", "INR", "CAD", "AUD"] as const;
const LOCALES = ["en-GB", "en-US", "en-IE", "en-AU", "en-CA", "en-PK", "en-IN", "en-AE", "es-ES", "es-MX", "ur-PK"] as const;

const updateSchema = z
  .object({
    logoDataUrl: z.string().nullable().optional(),
    name: z.string().trim().min(2, "Business name is too short").max(120).optional(),
    brandPrimaryHex: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour like #495e57")
      .optional(),
    industry: z.string().trim().max(80).optional(),
    timezone: z
      .string()
      .refine((tz) => {
        try {
          new Intl.DateTimeFormat("en-GB", { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      }, "That time zone isn't recognised")
      .optional(),
    currency: z.enum(CURRENCIES).optional(),
    locale: z.enum(LOCALES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to change");

/** Owners change their logo, name, brand colour, time zone, currency and language. */
export async function PATCH(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  try {
    const { logoDataUrl, ...settings } = updateSchema.parse(await request.json());
    const changes: Partial<typeof tenants.$inferInsert> = { ...settings };
    if (logoDataUrl !== undefined) {
      changes.logoUrl = logoDataUrl === null ? null : validateLogoDataUrl(logoDataUrl);
    }

    await db.update(tenants).set(changes).where(eq(tenants.id, guard.ctx.tenantId!));

    await logAuditEvent(guard.ctx, {
      action:
        logoDataUrl !== undefined && Object.keys(settings).length === 0
          ? changes.logoUrl
            ? "tenant.logo_updated"
            : "tenant.logo_removed"
          : "tenant.settings_updated",
      targetType: "tenant",
      targetId: guard.ctx.tenantId!,
      metadata: { fields: Object.keys(changes) },
    });

    return NextResponse.json({ data: await loadBusiness(guard.ctx.tenantId!) });
  } catch (err) {
    const message =
      err instanceof z.ZodError ? err.errors[0]?.message : err instanceof Error ? err.message : "Couldn't save your settings";
    return NextResponse.json({ error: { code: "BUSINESS_UPDATE_FAILED", message } }, { status: 400 });
  }
}
