import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { users, tenants } from "@/server/db/schema";
import { verifyPassword, createSession, getSessionContext } from "@/server/auth";
import { checkLoginRateLimit, RateLimitError, rateLimitResponse } from "@/server/security/rate-limit";
import { eq } from "drizzle-orm";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
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

    // Determine session type (staff/owner/admin vs customer)
    const isStaff = !user.isPlatformAdmin;
    const userAgent = request.headers.get("user-agent") || undefined;
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;

    const { token, expiresAt } = await createSession(user.id, isStaff, userAgent, ipAddress);

    // Resolve context to get role and tenant
    const ctx = await getSessionContext(token);

    // If user is owner or staff, verify business approval status
    if (ctx?.tenantId && !user.isPlatformAdmin) {
      const [tenant] = await db
        .select({ id: tenants.id, status: tenants.status, name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId))
        .limit(1);

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
    response.cookies.set("loyalty_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: expiresAt,
      path: "/",
    });

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

