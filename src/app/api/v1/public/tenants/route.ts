import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { tenants } from "@/server/db/schema";
import { desc } from "drizzle-orm";

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
        logoUrl: tenants.logoUrl,
        plan: tenants.plan,
        createdAt: tenants.createdAt,
      })
      .from(tenants)
      .orderBy(desc(tenants.createdAt))
      .limit(50);

    return NextResponse.json({ data: list });
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

