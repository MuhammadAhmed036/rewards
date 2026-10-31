import crypto from "crypto";
// Loads and validates .env (AUTH_SECRET is required to encrypt session cookies)
import "@/lib/env";
import { db, DbExecutor } from "../db";
import { users, sessions, staffMembers, staffLocationScopes, verifications, tenants, memberships } from "../db/schema";
import { eq, and, gt, lt, or, inArray, sql, desc } from "drizzle-orm";
import {
  SESSION_COOKIE_NAME,
  SESSION_POLICY,
  SessionKind,
  decryptSessionCookie,
  encryptSessionCookie,
  generateSessionToken,
  hashSessionToken,
  initialCookieExpiry,
} from "@/lib/session-cookie";
import { RequestContext, UserRole } from "../security/permissions";
import { cookies } from "next/headers";

// ==========================================
// Password Hashing (Crypto Scrypt)
// ==========================================
export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(":");
    if (!salt || !key) return resolve(false);
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(crypto.timingSafeEqual(Buffer.from(key, "hex"), derivedKey));
    });
  });
}

// ==========================================
// Session Management
// ==========================================
// The cookie value is an encrypted payload (see src/lib/session-cookie.ts);
// the sessions table stores only SHA-256 of the token inside it.

export type { SessionKind };

/** Session kind for a user: platform admins and active staff get short sessions, everyone else is a customer. */
export async function sessionKindForUser(userId: string, executor: DbExecutor = db): Promise<SessionKind> {
  const [user] = await executor
    .select({ isPlatformAdmin: users.isPlatformAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (user?.isPlatformAdmin) return "admin";

  const [staff] = await executor
    .select({ id: staffMembers.id })
    .from(staffMembers)
    .where(and(eq(staffMembers.userId, userId), eq(staffMembers.status, "active")))
    .limit(1);
  return staff ? "staff" : "customer";
}

/**
 * Starts a session. `token` is the encrypted cookie value to send to the browser and
 * `expiresAt` is when that cookie expires.
 */
export async function createSession(
  userId: string,
  kind: SessionKind = "customer",
  userAgent?: string,
  ipAddress?: string,
  executor: DbExecutor = db
): Promise<{ token: string; expiresAt: Date; kind: SessionKind }> {
  const now = Date.now();
  const rawToken = generateSessionToken();
  const policy = SESSION_POLICY[kind];
  const cookieExpiry = initialCookieExpiry(kind, now);

  await executor.insert(sessions).values({
    userId,
    token: await hashSessionToken(rawToken),
    expiresAt: new Date(now + policy.idleMs),
    userAgent: userAgent ? userAgent.slice(0, 512) : null,
    ipAddress: ipAddress || null,
  });

  const token = await encryptSessionCookie({ t: rawToken, k: kind, iat: now, exp: cookieExpiry });
  return { token, expiresAt: new Date(cookieExpiry), kind };
}

/** Database key for a cookie value, or null if the cookie is invalid. */
export async function sessionLookupKey(cookieValue: string | null | undefined): Promise<string | null> {
  const payload = await decryptSessionCookie(cookieValue);
  return payload ? hashSessionToken(payload.t) : null;
}

export async function invalidateUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * The store page a person should land on after signing out: the store they were just using
 * (`hintSlug`, when it is really theirs), otherwise their own business or loyalty card.
 * Null for platform admins and people with no store, who go to the general sign-in page.
 */
export async function storeSlugForSession(cookieValue: string, hintSlug?: string | null): Promise<string | null> {
  const key = await sessionLookupKey(cookieValue);
  if (!key) return null;
  const [row] = await db
    .select({ userId: sessions.userId, isPlatformAdmin: users.isPlatformAdmin })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.token, key))
    .limit(1);
  if (!row || row.isPlatformAdmin) return null;

  const mine = [
    ...(await db
      .select({ slug: tenants.slug })
      .from(staffMembers)
      .innerJoin(tenants, eq(tenants.id, staffMembers.tenantId))
      .where(and(eq(staffMembers.userId, row.userId), inArray(staffMembers.status, ["active", "invited"])))
      .orderBy(desc(staffMembers.createdAt))),
    ...(await db
      .select({ slug: tenants.slug })
      .from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .where(eq(memberships.userId, row.userId))
      .orderBy(desc(memberships.joinedAt))),
  ].map((r) => r.slug);

  if (hintSlug && mine.includes(hintSlug)) return hintSlug;
  return mine[0] ?? null;
}

export async function deleteSession(cookieValue: string): Promise<void> {
  const key = await sessionLookupKey(cookieValue);
  if (key) await db.delete(sessions).where(eq(sessions.token, key));
}

/** Removes sessions past their idle expiry, plus staff/admin sessions past their absolute limit. */
export async function purgeExpiredSessions(executor: DbExecutor = db): Promise<number> {
  const now = Date.now();
  const staffCutoff = new Date(now - (SESSION_POLICY.staff.absoluteMs ?? 0));
  const elevatedUsers = sql`(SELECT user_id FROM staff_members WHERE status = 'active' UNION SELECT id FROM users WHERE is_platform_admin)`;
  const deleted = await executor
    .delete(sessions)
    .where(
      or(
        lt(sessions.expiresAt, new Date(now)),
        // Staff/admin sessions older than the longest absolute limit can never be valid again.
        and(lt(sessions.createdAt, staffCutoff), inArray(sessions.userId, elevatedUsers))
      )
    )
    .returning({ id: sessions.id });
  return deleted.length;
}

// ==========================================
// Context Resolution
// ==========================================
export async function getSessionContext(
  cookieValue: string | null,
  tenantSlugOrId?: string,
  requestId: string = crypto.randomUUID()
): Promise<RequestContext | null> {
  const payload = await decryptSessionCookie(cookieValue);
  if (!payload) return null;
  const tokenHash = await hashSessionToken(payload.t);

  const now = new Date();
  const sessionRows = await db
    .select({
      sessionId: sessions.id,
      userId: sessions.userId,
      expiresAt: sessions.expiresAt,
      createdAt: sessions.createdAt,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.token, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);

  if (sessionRows.length === 0) return null;

  const session = sessionRows[0];
  const user = session.user;

  // The staff lookup also decides which session policy applies to this user right now.
  const staffRows = user.isPlatformAdmin
    ? []
    : await db
        .select({
          staff: staffMembers,
          tenantSlug: tenants.slug,
        })
        .from(staffMembers)
        .innerJoin(tenants, eq(staffMembers.tenantId, tenants.id))
        .where(
          and(
            eq(staffMembers.userId, user.id),
            eq(staffMembers.status, "active")
          )
        );

  const kind: SessionKind = user.isPlatformAdmin ? "admin" : staffRows.length > 0 ? "staff" : "customer";
  const policy = SESSION_POLICY[kind];

  // Absolute limit: staff and admin sessions end a fixed time after sign-in, however active.
  if (policy.absoluteMs !== null && now.getTime() - session.createdAt.getTime() > policy.absoluteMs) {
    await db.delete(sessions).where(eq(sessions.id, session.sessionId));
    return null;
  }

  // Idle timeout: push expiry forward while the session is in use (throttled to limit writes).
  const remaining = session.expiresAt.getTime() - now.getTime();
  if (remaining > policy.idleMs) {
    // A customer session now used by someone who became staff: shrink it to the stricter policy.
    await db
      .update(sessions)
      .set({ expiresAt: new Date(now.getTime() + policy.idleMs) })
      .where(eq(sessions.id, session.sessionId));
  } else if (policy.idleMs - remaining > policy.refreshMs) {
    let next = now.getTime() + policy.idleMs;
    if (policy.absoluteMs !== null) next = Math.min(next, session.createdAt.getTime() + policy.absoluteMs);
    await db.update(sessions).set({ expiresAt: new Date(next) }).where(eq(sessions.id, session.sessionId));
  }

  // 1. Platform Admin check
  if (user.isPlatformAdmin) {
    return {
      userId: user.id,
      tenantId: tenantSlugOrId || undefined,
      role: "platform_admin",
      requestId,
      isPlatformAdmin: true,
    };
  }

  // 2. Tenant Staff check
  let matchingStaff = null;
  if (tenantSlugOrId) {
    matchingStaff = staffRows.find(
      (s) => s.staff.tenantId === tenantSlugOrId || s.tenantSlug === tenantSlugOrId
    );
  } else if (staffRows.length > 0) {
    // Default to their primary assigned tenant
    matchingStaff = staffRows[0];
  }

  if (matchingStaff) {
    // Find assigned location scopes
    const scopes = await db
      .select({ locationId: staffLocationScopes.locationId })
      .from(staffLocationScopes)
      .where(eq(staffLocationScopes.staffMemberId, matchingStaff.staff.id));

    const locationIds = scopes.map((s) => s.locationId);

    return {
      userId: user.id,
      tenantId: matchingStaff.staff.tenantId,
      role: matchingStaff.staff.role as UserRole,
      locationIds: locationIds.length > 0 ? locationIds : undefined,
      requestId,
      isPlatformAdmin: false,
    };
  }

  // 3. Customer role (default for members across platforms)
  return {
    userId: user.id,
    tenantId: tenantSlugOrId,
    role: "customer",
    requestId,
    isPlatformAdmin: false,
  };
}

export async function getCurrentContext(tenantId?: string): Promise<RequestContext | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value || null;
    return getSessionContext(token, tenantId);
  } catch {
    return null;
  }
}

// ==========================================
// Magic Link & OTP Verification
// ==========================================
export async function createMagicLinkToken(email: string): Promise<string> {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes TTL

  await db.insert(verifications).values({
    identifier: email.toLowerCase().trim(),
    value: token,
    expiresAt,
  });

  return token;
}

export async function verifyMagicLinkToken(
  email: string,
  token: string
): Promise<boolean> {
  const normalizedEmail = email.toLowerCase().trim();
  const now = new Date();

  const rows = await db
    .select()
    .from(verifications)
    .where(
      and(
        eq(verifications.identifier, normalizedEmail),
        eq(verifications.value, token),
        gt(verifications.expiresAt, now)
      )
    );

  if (rows.length === 0) return false;

  // Clean up used token
  await db.delete(verifications).where(eq(verifications.id, rows[0].id));
  return true;
}
