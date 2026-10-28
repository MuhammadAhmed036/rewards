import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { tenants } from "@/server/db/schema";
import { decodeLogoDataUrl } from "@/server/services/business-logo";
import { eq } from "drizzle-orm";
import { z } from "zod";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const { tenantId } = await params;
  if (!z.string().uuid().safeParse(tenantId).success) {
    return new NextResponse(null, { status: 404 });
  }

  const [tenant] = await db
    .select({ logoUrl: tenants.logoUrl })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant?.logoUrl) {
    return new NextResponse(null, { status: 404 });
  }

  if (/^https?:\/\//i.test(tenant.logoUrl)) {
    return NextResponse.redirect(tenant.logoUrl, 302);
  }

  const decoded = decodeLogoDataUrl(tenant.logoUrl);
  if (!decoded) {
    return new NextResponse(null, { status: 404 });
  }

  // A ?v= hash is present whenever the URL came from our API, so the response can be cached forever.
  const versioned = request.nextUrl.searchParams.has("v");

  return new NextResponse(new Uint8Array(decoded.body), {
    status: 200,
    headers: {
      "Content-Type": decoded.contentType,
      "Content-Length": String(decoded.body.length),
      "Cache-Control": versioned
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
