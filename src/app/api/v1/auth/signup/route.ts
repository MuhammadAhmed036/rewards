import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { hashPassword, createSession } from "@/server/auth";
import { setSessionCookie } from "@/server/auth/session-response";
import { registerOwnerAndTenant } from "@/server/services/tenant";
import { validateLogoDataUrl } from "@/server/services/business-logo";
import { queueEmail, processOutbox } from "@/server/services/email";
import { createEmailVerificationToken } from "@/server/services/verification";
import { env } from "@/lib/env";
import { getBaseUrl } from "@/lib/url";
import { eq } from "drizzle-orm";
import { z } from "zod";

const signupSchema = z.object({
  role: z.enum(["owner", "customer"]).default("owner"),
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  businessName: z.string().optional(),
  category: z.string().optional(),
  requestedStaffCount: z.number().int().min(1).max(100).optional(),
  requestedManagerCount: z.number().int().min(0).max(50).optional(),
  programmeType: z.enum(["points", "stamps"]).default("points"),
  logoDataUrl: z.string().optional(),
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

      const totalRequestedStaff = (validated.requestedStaffCount || 5) + (validated.requestedManagerCount || 2);

      const logoUrl = validated.logoDataUrl ? validateLogoDataUrl(validated.logoDataUrl) : null;

      const result = await registerOwnerAndTenant({
        email: normalizedEmail,
        password: validated.password,
        name: validated.name.trim(),
        businessName: bizName,
        slug,
        programmeType: validated.programmeType,
        industry: validated.category || "Coffee Shop & Cafe",
        status: "pending", // Requires SuperAdmin approval before owner can log in
        emailVerified: false,
        maxStaff: totalRequestedStaff,
        logoUrl,
      });

      try {
        await createEmailVerificationToken(result.user.id, normalizedEmail, result.tenant.id);
      } catch (err) {
        console.error("Failed to send verification email:", err);
      }

      const baseUrl = getBaseUrl(request);
      const storeUrl = `${baseUrl}/b/${result.tenant.slug}`;

      // Send owner welcome email with dedicated store path per client request
      try {
        await queueEmail({
          toEmail: normalizedEmail,
          template: "owner_business_registered",
          payload: {
            ownerName: validated.name.trim(),
            businessName: bizName,
            category: validated.category || "Coffee Shop & Cafe",
            storeUrl,
            slug: result.tenant.slug,
          },
          kind: "transactional",
          tenantId: result.tenant.id,
        });
        await processOutbox(5);
      } catch (err) {
        console.error("Failed to queue/process welcome email for owner:", err);
      }

      return NextResponse.json(
        {
          data: {
            user: result.user,
            tenant: {
              ...result.tenant,
              storeUrl,
            },
            storeUrl,
            pendingApproval: true,
            message:
              "🎉 Your business registration has been submitted! A welcome email with your store URL has been dispatched to your email address. It is currently pending approval by the Super Admin.",
          },
        },
        { status: 201 }
      );
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
      const session = await createSession(newUser.id, "customer");

      const response = NextResponse.json(
        {
          data: {
            user: newUser,
            redirectUrl: "/me",
          },
        },
        { status: 201 }
      );

      setSessionCookie(response, session);

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

