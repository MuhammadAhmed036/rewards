import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { tenants } from "@/server/db/schema";
import { desc } from "drizzle-orm";
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
        plan: tenants.plan,
        createdAt: tenants.createdAt,
      })
      .from(tenants)
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

