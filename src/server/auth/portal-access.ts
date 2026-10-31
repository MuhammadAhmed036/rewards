import { db } from "../db";
import { users, staffMembers, tenants, memberships } from "../db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Which door a person is signing in through.
 *   customer — the "I'm a customer" tab on a shop page
 *   staff    — the "I work here" tab on a shop page
 *   owner    — the "I own this shop" tab on a shop page
 *   admin    — the platform admin form on /login
 *
 * One email is one kind of account: a business email (owner, staff or admin) is never a
 * customer card, and customers must register at a shop before they can sign in there.
 */
export type Portal = "customer" | "staff" | "owner" | "admin";

export type PortalDenial = {
  ok: false;
  code: "BUSINESS_ACCOUNT" | "NOT_A_MEMBER" | "CARD_SUSPENDED" | "WRONG_PORTAL" | "NOT_THIS_BUSINESS" | "UNKNOWN_BUSINESS";
  message: string;
};

export async function checkPortalAccess(
  userId: string,
  portal: Portal,
  tenantSlug?: string
): Promise<{ ok: true } | PortalDenial> {
  const [user] = await db
    .select({ isPlatformAdmin: users.isPlatformAdmin, isSupportAgent: users.isSupportAgent })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const isAdmin = Boolean(user?.isPlatformAdmin);

  if (portal === "admin") {
    // The platform team signs in here, support agents included
    return isAdmin || user?.isSupportAgent
      ? { ok: true }
      : {
          ok: false,
          code: "WRONG_PORTAL",
          message: "This sign-in is for the platform team only. Owners, staff and customers sign in on their shop's page.",
        };
  }

  const [tenant] = tenantSlug
    ? await db.select({ id: tenants.id, name: tenants.name }).from(tenants).where(eq(tenants.slug, tenantSlug)).limit(1)
    : [];
  if (!tenant) {
    return { ok: false, code: "UNKNOWN_BUSINESS", message: "This shop couldn't be found." };
  }

  const staffRows = await db
    .select({ tenantId: staffMembers.tenantId, role: staffMembers.role })
    .from(staffMembers)
    .where(and(eq(staffMembers.userId, userId), eq(staffMembers.status, "active")));
  const here = staffRows.find((s) => s.tenantId === tenant.id);

  if (portal === "customer") {
    if (isAdmin || staffRows.length > 0) {
      return {
        ok: false,
        code: "BUSINESS_ACCOUNT",
        message:
          here?.role === "owner"
            ? "This email is the owner's account, so it can't be used as a customer card. Use “I own this shop” to sign in, or join as a customer with a different email."
            : here
            ? "This email is a staff login, so it can't be used as a customer card. Use “I work here” to sign in, or join as a customer with a different email."
            : "This email belongs to a business account, so it can't be used as a customer card. Join with a different email.",
      };
    }

    const [membership] = await db
      .select({ status: memberships.status })
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.tenantId, tenant.id)))
      .limit(1);

    if (!membership) {
      return {
        ok: false,
        code: "NOT_A_MEMBER",
        message: `You don't have a card at ${tenant.name} yet. Tap “New here” to create one.`,
      };
    }
    if (membership.status !== "active") {
      return {
        ok: false,
        code: "CARD_SUSPENDED",
        message: `Your card at ${tenant.name} is ${membership.status}. Please speak to the shop.`,
      };
    }
    return { ok: true };
  }

  if (portal === "owner") {
    if (here?.role === "owner") return { ok: true };
    if (here) {
      return { ok: false, code: "WRONG_PORTAL", message: "This is a staff login. Use “I work here” to sign in." };
    }
    return { ok: false, code: "NOT_THIS_BUSINESS", message: `This account isn't the owner of ${tenant.name}.` };
  }

  // staff
  if (here && here.role !== "owner") return { ok: true };
  if (here?.role === "owner") {
    return { ok: false, code: "WRONG_PORTAL", message: "This is the owner's account. Use “I own this shop” to sign in." };
  }
  return { ok: false, code: "NOT_THIS_BUSINESS", message: `This account isn't a staff login for ${tenant.name}.` };
}

/** True for owners, staff and platform admins — accounts that can never be customer cards. */
export async function isBusinessAccount(userId: string): Promise<boolean> {
  const [user] = await db
    .select({ isPlatformAdmin: users.isPlatformAdmin, isSupportAgent: users.isSupportAgent })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (user?.isPlatformAdmin || user?.isSupportAgent) return true;
  const [staff] = await db
    .select({ id: staffMembers.id })
    .from(staffMembers)
    .where(and(eq(staffMembers.userId, userId), eq(staffMembers.status, "active")))
    .limit(1);
  return Boolean(staff);
}
