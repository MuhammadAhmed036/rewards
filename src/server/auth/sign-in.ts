import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { tenants, users } from "../db/schema";
import { createSession, deleteSession, getSessionContext, sessionKindForUser } from "./index";
import { setSessionCookie } from "./session-response";

type UserRow = typeof users.$inferSelect;

/**
 * The last step of every sign-in, once the person has proved who they are (password, and an emailed
 * code if they use one): start the session, refuse a business that isn't approved or is suspended,
 * and set the cookie.
 */
export async function completeSignIn(request: NextRequest, user: UserRow): Promise<NextResponse> {
  // Session length depends on who is signing in: admins and staff get short sessions, customers long ones.
  const kind = await sessionKindForUser(user.id);
  const userAgent = request.headers.get("user-agent") || undefined;
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;

  const session = await createSession(user.id, kind, userAgent, ipAddress);

  // Resolve context to get role and tenant
  const ctx = await getSessionContext(session.token);

  // If user is owner or staff, verify business approval status
  if (ctx?.tenantId && !user.isPlatformAdmin) {
    const [tenant] = await db
      .select({ id: tenants.id, status: tenants.status, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, ctx.tenantId))
      .limit(1);

    if (tenant?.status === "pending" || tenant?.status === "suspended") {
      // Don't leave a usable session behind for an account that can't sign in yet.
      await deleteSession(session.token);
    }

    if (tenant?.status === "pending") {
      return NextResponse.json(
        {
          error: {
            code: "PENDING_APPROVAL",
            message:
              "Your business registration is pending approval by the Super Admin. You will be able to log in once approved.",
          },
        },
        { status: 403 }
      );
    }

    if (tenant?.status === "suspended") {
      return NextResponse.json(
        {
          error: {
            code: "TENANT_SUSPENDED",
            message: "Your business account has been suspended. Please contact platform support.",
          },
        },
        { status: 403 }
      );
    }
  }

  const response = NextResponse.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isPlatformAdmin: user.isPlatformAdmin,
        role: ctx?.role || "customer",
        tenantId: ctx?.tenantId || null,
      },
    },
  });

  // Set HTTP-only session cookie
  setSessionCookie(response, session);
  return response;
}
