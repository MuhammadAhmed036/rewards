import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { tenants } from "@/server/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { logoRefSql, resolveLogoUrl } from "@/server/services/business-logo";

export async function GET(request: NextRequest) {
  try {
    const list = await db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        status: tenants.status,
        industry: tenants.industry,
        brandPrimaryHex: tenants.brandPrimaryHex,
        logoRef: logoRefSql,
      })
      .from(tenants)
      // Only businesses that are open to the public, and not ones marked as unlisted (demo or test shops).
      // Pending, suspended and closed businesses never appear, and neither does anything about a plan.
      .where(and(eq(tenants.status, "active"), sql`coalesce(${tenants.features}->>'unlisted', 'false') <> 'true'`))
      .orderBy(desc(tenants.createdAt))
      .limit(50);

    return NextResponse.json({
      data: list.map(({ logoRef, ...t }) => ({ ...t, logoUrl: resolveLogoUrl(t.id, logoRef) })),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "FETCH_FAILED",
          message: err instanceof Error ? err.message : "Failed to load businesses",
        },
      },
      { status: 500 }
    );
  }
}

