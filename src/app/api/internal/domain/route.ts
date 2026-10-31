import { NextRequest, NextResponse } from "next/server";
import { slugForVerifiedDomain } from "@/server/services/custom-domain";

/** Which shop a verified domain belongs to. Called by the middleware; the answer (a public shop address) is not secret. */
export async function GET(request: NextRequest) {
  const host = request.nextUrl.searchParams.get("host") ?? "";
  const slug = host.length <= 253 ? await slugForVerifiedDomain(host) : null;
  return NextResponse.json({ slug }, { headers: { "Cache-Control": "public, max-age=60" } });
}
