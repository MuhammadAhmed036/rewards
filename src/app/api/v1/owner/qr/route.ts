import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { db } from "@/server/db";
import { locations, tenants } from "@/server/db/schema";
import { generateQrDataUrl } from "@/server/qr";
import { env } from "@/lib/env";
import { getBaseUrl } from "@/lib/url";
import { eq, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  const { ctx } = guard;
  const locationId = request.nextUrl.searchParams.get("locationId");

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, ctx.tenantId!))
    .limit(1);

  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  let locationPublicId = "";
  let locationName = "All Locations";

  if (locationId) {
    const [loc] = await db
      .select()
      .from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.tenantId, ctx.tenantId!)))
      .limit(1);
    if (loc) {
      locationPublicId = loc.publicId;
      locationName = loc.name;
    }
  } else {
    const [firstLoc] = await db
      .select()
      .from(locations)
      .where(eq(locations.tenantId, ctx.tenantId!))
      .limit(1);
    if (firstLoc) {
      locationPublicId = firstLoc.publicId;
      locationName = firstLoc.name;
    }
  }

  const baseUrl = getBaseUrl(request);
  const joinUrl = `${baseUrl}/b/${tenant.slug}?loc=${locationPublicId}&src=qr`;
  const qrPng = await generateQrDataUrl(joinUrl, "png");
  const qrSvg = await generateQrDataUrl(joinUrl, "svg");

  return NextResponse.json({
    data: {
      tenantName: tenant.name,
      locationName,
      joinUrl,
      qrPng,
      qrSvg,
      instructions: "Scan to join our loyalty programme and earn rewards!",
    },
  });
}

