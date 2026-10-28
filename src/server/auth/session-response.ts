import type { NextRequest, NextResponse } from "next/server";
import {
  LEGACY_SESSION_COOKIE_NAMES,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/session-cookie";

/** Every route that signs someone in sets the cookie through here, so the security flags never drift. */
export function setSessionCookie(response: NextResponse, session: { token: string; expiresAt: Date }) {
  response.cookies.set(SESSION_COOKIE_NAME, session.token, sessionCookieOptions(session.expiresAt));
  for (const legacy of LEGACY_SESSION_COOKIE_NAMES) {
    response.cookies.set(legacy, "", { ...sessionCookieOptions(new Date(0)), secure: false });
  }
  return response;
}

/** Clears the session cookie (same flags as when it was set, or browsers ignore the deletion). */
export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, "", sessionCookieOptions(new Date(0)));
  for (const legacy of LEGACY_SESSION_COOKIE_NAMES) {
    response.cookies.set(legacy, "", { ...sessionCookieOptions(new Date(0)), secure: false });
  }
  return response;
}

export function readSessionCookie(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE_NAME)?.value || null;
}
