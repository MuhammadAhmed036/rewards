import crypto from "crypto";
import { db, DbExecutor } from "../db";
import { users, sessions, staffMembers, staffLocationScopes, verifications, tenants } from "../db/schema";
import { eq, and, gt } from "drizzle-orm";
import { RequestContext, UserRole } from "../security/permissions";
import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = "loyalty_session";
const STAFF_SESSION_TTL_HOURS = 12;
const CUSTOMER_SESSION_TTL_DAYS = 30;

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
export async function createSession(
  userId: string,
  isStaff: boolean = false,
  userAgent?: string,
  ipAddress?: string,
  executor: DbExecutor = db
): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date();
  if (isStaff) {
    expiresAt.setHours(expiresAt.getHours() + STAFF_SESSION_TTL_HOURS);
  } else {
    expiresAt.setDate(expiresAt.getDate() + CUSTOMER_SESSION_TTL_DAYS);
  }

  await executor.insert(sessions).values({
    userId,
    token,
    expiresAt,
    userAgent: userAgent || null,
    ipAddress: ipAddress || null,
  });

  return { token, expiresAt };
}

export async function invalidateUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, token));
}

// ==========================================
// Context Resolution
// ==========================================
export async function getSessionContext(
  token: string | null,
  tenantSlugOrId?: string,
  requestId: string = crypto.randomUUID()
): Promise<RequestContext | null> {
  if (!token) return null;

  const now = new Date();
  const sessionRows = await db
    .select({
      sessionId: sessions.id,
      userId: sessions.userId,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, now)))
    .limit(1);

  if (sessionRows.length === 0) return null;

  const session = sessionRows[0];
  const user = session.user;

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
  const staffRows = await db
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
