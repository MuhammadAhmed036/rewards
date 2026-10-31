import { NextRequest, NextResponse } from "next/server";
import {
  MAX_COOKIE_AGE_MS,
  SESSION_COOKIE_NAME,
  SESSION_POLICY,
  decryptSessionCookie,
  encryptSessionCookie,
  sessionCookieOptions,
} from "@/lib/session-cookie";
import { cleanHost, hostOf, isPlatformHost, slugFromSubdomain } from "@/lib/branded-host";

/**
 * A shop's own address (ahmed-coffee.example.com, or a domain it owns and has verified) opens that shop's page.
 * Only the front page is rewritten; everything else on the address works as normal.
 */
async function brandedHomeRewrite(request: NextRequest): Promise<NextResponse | null> {
  if (request.nextUrl.pathname !== "/") return null;
  const host = cleanHost(request.headers.get("x-forwarded-host") || request.headers.get("host"));
  const root = process.env.ROOT_DOMAIN;

  let slug = slugFromSubdomain(host, root);
  if (!slug) {
    const platform = [hostOf(process.env.APP_URL), hostOf(process.env.NEXT_PUBLIC_APP_URL), process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL];
    if (isPlatformHost(host, platform, root)) return null;
    try {
      // Ask the platform which shop this domain belongs to (cached for a minute)
      const origin = new URL(process.env.APP_URL || request.nextUrl.origin).origin;
      const res = await fetch(`${origin}/api/internal/domain?host=${encodeURIComponent(host)}`, { next: { revalidate: 60 } });
      slug = res.ok ? ((await res.json()) as { slug: string | null }).slug : null;
    } catch {
      slug = null;
    }
  }
  if (!slug) return null;
  const url = request.nextUrl.clone();
  url.pathname = `/b/${slug}`;
  return NextResponse.rewrite(url);
}

/**
 * Keeps customers signed in: when a customer visits, their cookie is re-issued with a
 * fresh 400-day expiry (at most once a day). The server slides the matching database
 * session the same way, so an active customer is never signed out.
 * Staff and admin cookies are never extended here — their limits are enforced server-side.
 */
export async function middleware(request: NextRequest) {
  const branded = await brandedHomeRewrite(request);
  if (branded) return branded;

  const value = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!value) return NextResponse.next();

  const payload = await decryptSessionCookie(value);
  if (!payload || payload.k !== "customer") return NextResponse.next();

  const now = Date.now();
  if (payload.exp - now > MAX_COOKIE_AGE_MS - SESSION_POLICY.customer.refreshMs) {
    return NextResponse.next();
  }

  const exp = now + MAX_COOKIE_AGE_MS;
  const response = NextResponse.next();
  response.cookies.set(
    SESSION_COOKIE_NAME,
    await encryptSessionCookie({ ...payload, exp }),
    sessionCookieOptions(new Date(exp))
  );
  return response;
}

export const config = {
  // Skip static files and images; everything else (pages and API calls) can refresh the cookie.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml)$).*)"],
};
