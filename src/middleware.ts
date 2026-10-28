import { NextRequest, NextResponse } from "next/server";
import {
  MAX_COOKIE_AGE_MS,
  SESSION_COOKIE_NAME,
  SESSION_POLICY,
  decryptSessionCookie,
  encryptSessionCookie,
  sessionCookieOptions,
} from "@/lib/session-cookie";

/**
 * Keeps customers signed in: when a customer visits, their cookie is re-issued with a
 * fresh 400-day expiry (at most once a day). The server slides the matching database
 * session the same way, so an active customer is never signed out.
 * Staff and admin cookies are never extended here — their limits are enforced server-side.
 */
export async function middleware(request: NextRequest) {
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
