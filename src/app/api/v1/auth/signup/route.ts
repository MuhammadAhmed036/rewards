import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { hashPassword, createSession } from "@/server/auth";
import { registerOwnerAndTenant } from "@/server/services/tenant";
import { eq } from "drizzle-orm";
import { z } from "zod";

const signupSchema = z.object({
  role: z.enum(["owner", "customer"]).default("owner"),
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  businessName: z.string().optional(),
  programmeType: z.enum(["points", "stamps"]).default("points"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = signupSchema.parse(body);
    const normalizedEmail = validated.email.toLowerCase().trim();

    // Check if user already exists
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existingUser) {
      return NextResponse.json(
        {
          error: {
            code: "EMAIL_EXISTS",
            message: "An account with this email address already exists. Please sign in.",
          },
        },
        { status: 400 }
      );
    }

    if (validated.role === "owner") {
      const bizName = validated.businessName?.trim() || `${validated.name}'s Business`;
      const slug = bizName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || `biz-${Date.now()}`;

      const result = await registerOwnerAndTenant({
        email: normalizedEmail,
        password: validated.password,
        name: validated.name.trim(),
        businessName: bizName,
        slug,
        programmeType: validated.programmeType,
      });

      // Create session
      const { token, expiresAt } = await createSession(result.user.id, true);

      const response = NextResponse.json(
        {
          data: {
            user: result.user,
            tenant: result.tenant,
            redirectUrl: "/dashboard",
          },
        },
        { status: 201 }
      );

      response.cookies.set({
        name: "loyalty_session",
        value: token,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
      });

      return response;
    } else {
      // Customer registration
      const hashedPassword = await hashPassword(validated.password);

      const [newUser] = await db
        .insert(users)
        .values({
          email: normalizedEmail,
          name: validated.name.trim(),
          passwordHash: hashedPassword,
          emailVerifiedAt: new Date(),
        })
        .returning();

      // Create session
      const { token, expiresAt } = await createSession(newUser.id, false);

      const response = NextResponse.json(
        {
          data: {
            user: newUser,
            redirectUrl: "/me",
          },
        },
        { status: 201 }
      );

      response.cookies.set({
        name: "loyalty_session",
        value: token,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
      });

      return response;
    }
  } catch (err: unknown) {
    console.error("Signup error:", err);
    return NextResponse.json(
      {
        error: {
          code: "SIGNUP_FAILED",
          message: err instanceof Error ? err.message : "Registration failed",
        },
      },
      { status: 400 }
    );
  }
}
