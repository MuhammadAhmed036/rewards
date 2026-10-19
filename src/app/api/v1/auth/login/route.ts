import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { verifyPassword, createSession, getSessionContext } from "@/server/auth";
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
    console.error("Login error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Authentication failed. Please try again." } },
      { status: 500 }
    );
  }
}
