import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { sessions } from "../db/schema";
import { sessionLookupKey } from "./index";
import { readSessionCookie } from "./session-response";

/** How long a password or code confirmation covers sensitive actions. */
export const RECENT_AUTH_MS = 10 * 60 * 1000;

/** The session the request is signed in with: the same sources the API guard accepts. */
function sessionTokenOf(request: NextRequest) {
  const auth = request.headers.get("authorization");
  return (auth?.startsWith("Bearer ") ? auth.slice(7) : null) || readSessionCookie(request);
}

export async function hasRecentAuth(request: NextRequest): Promise<boolean> {
  const key = await sessionLookupKey(sessionTokenOf(request));
  if (!key) return false;
  const [row] = await db.select({ reauthedAt: sessions.reauthedAt }).from(sessions).where(eq(sessions.token, key)).limit(1);
  return Boolean(row?.reauthedAt && Date.now() - row.reauthedAt.getTime() < RECENT_AUTH_MS);
}

export async function markReauthed(request: NextRequest): Promise<void> {
  const key = await sessionLookupKey(sessionTokenOf(request));
  if (key) await db.update(sessions).set({ reauthedAt: new Date() }).where(eq(sessions.token, key));
}

/**
 * For routes that export data, change points or change who can do what: lets the request through
 * only if this session confirmed its password (or an emailed code) in the last 10 minutes.
 * Returns the response to send back when it hasn't, or null when all is well.
 */
export async function requireRecentAuth(request: NextRequest): Promise<NextResponse | null> {
  if (await hasRecentAuth(request)) return null;
  return NextResponse.json(
    { error: { code: "REAUTH_REQUIRED", message: "For your security, confirm it is you before doing this." } },
    { status: 403 }
  );
}
