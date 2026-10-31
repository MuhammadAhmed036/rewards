import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { memberships, tenants } from "@/server/db/schema";
import { getSessionContext } from "@/server/auth";
import { readSessionCookie } from "@/server/auth/session-response";
import { generateLiveQrToken, generateMemberQrToken, generateQrDataUrl, LIVE_QR_WINDOW_SECONDS } from "@/server/qr";
import { tenantUsesLiveQr } from "@/server/services/member";

/** A fresh copy of the signed-in customer's own QR code, for a card that shows a live (30-second) one. */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");
  const ctx = await getSessionContext(readSessionCookie(request));
  if (!slug || !ctx) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in to see your card." } }, { status: 401 });

  const [row] = await db
    .select({ publicId: memberships.publicId, qrVersion: memberships.qrVersion, status: memberships.status, tenantId: memberships.tenantId })
    .from(memberships)
    .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
    .where(and(eq(tenants.slug, slug), eq(memberships.userId, ctx.userId)))
    .limit(1);
  if (!row || row.status !== "active") return NextResponse.json({ error: { code: "NOT_FOUND", message: "No card here." } }, { status: 404 });

  const rotatingQr = await tenantUsesLiveQr(row.tenantId);
  const qrToken = rotatingQr ? generateLiveQrToken(row.publicId, row.qrVersion) : generateMemberQrToken(row.publicId, row.qrVersion);
  return NextResponse.json({
    data: { qrToken, qrDataUrl: await generateQrDataUrl(qrToken), rotatingQr, refreshInSeconds: rotatingQr ? LIVE_QR_WINDOW_SECONDS - 5 : null },
  });
}
