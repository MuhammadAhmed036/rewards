import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { users, tenants } from "@/server/db/schema";
import { verifyPassword, createSession, getSessionContext, deleteSession, sessionKindForUser } from "@/server/auth";
import { setSessionCookie } from "@/server/auth/session-response";
import { checkPortalAccess } from "@/server/auth/portal-access";
import { checkLoginRateLimit, RateLimitError, rateLimitResponse } from "@/server/security/rate-limit";
import { eq } from "drizzle-orm";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
  // Which sign-in form was used; each one only lets in the matching kind of account
  portal: z.enum(["customer", "staff", "owner", "admin"]).optional(),
  tenantSlug: z.string().min(1).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = loginSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: validated.error.errors[0]?.message || "Invalid input" } },
        { status: 400 }
      );
    }

    const email = validated.data.email.toLowerCase().trim();
    await checkLoginRateLimit(email);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(validated.data.password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } },
        { status: 401 }
      );
    }

    if (validated.data.portal) {
      const access = await checkPortalAccess(user.id, validated.data.portal, validated.data.tenantSlug);
      if (!access.ok) {
        // Correct password, wrong door: no session is created.
        return NextResponse.json({ error: { code: access.code, message: access.message } }, { status: 403 });
      }
    }

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
              message:
                "Your business account has been suspended. Please contact platform support.",
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
  } catch (error) {
    if (error instanceof RateLimitError) {
      return rateLimitResponse(error);
    }
    console.error("Login error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Authentication failed. Please try again." } },
      { status: 500 }
    );
  }
}

