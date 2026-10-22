import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { users, staffMembers } from "@/server/db/schema";
import { createSession } from "@/server/auth";
import { joinProgramme } from "@/server/services/member";
import { registerOwnerAndTenant } from "@/server/services/tenant";
import { eq } from "drizzle-orm";
import crypto from "crypto";

import { getBaseUrl } from "@/lib/url";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const stateRaw = searchParams.get("state");
  const error = searchParams.get("error");

  const appUrl = getBaseUrl(request);

  let returnTo = "/dashboard";
  let targetRole: "owner" | "customer" | "staff" = "owner";
  if (stateRaw) {
    try {
      const decoded = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf-8"));
      if (decoded.returnTo) returnTo = decoded.returnTo;
      if (decoded.role) targetRole = decoded.role;
    } catch {
      // fallback to default
    }
  }

  if (targetRole === "customer" && returnTo === "/dashboard") {
    returnTo = "/me";
  }

  if (error || !code) {
    const errorMsg = error || "Google authentication was cancelled or failed.";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(errorMsg)}`, appUrl));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/v1/auth/google/callback`;

  try {
    // 1. Exchange authorization code for Google access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId || "",
        client_secret: clientSecret || "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || "Failed to exchange authorization code with Google");
    }

    // 2. Fetch Google user profile
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const googleUser = await userInfoRes.json();
    if (!userInfoRes.ok || !googleUser.email) {
      throw new Error("Failed to fetch Google user profile");
    }

    const email = googleUser.email.toLowerCase().trim();
    const name = googleUser.name || googleUser.given_name || "Google User";
    const picture = googleUser.picture || null;

    // 3. Find or create user in PostgreSQL
    let userId: string;
    const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (existingUser) {
      userId = existingUser.id;
      // Update image if available
      if (picture && !existingUser.image) {
        await db.update(users).set({ image: picture }).where(eq(users.id, userId));
      }
    } else {
      const [newUser] = await db
        .insert(users)
        .values({
          email,
          name,
          image: picture,
          emailVerifiedAt: new Date(),
        })
        .returning();
      userId = newUser.id;
    }

    // 4. If returnTo is a business hub (/b/[slug]), automatically join customer to programme
    if (returnTo.startsWith("/b/")) {
      const parts = returnTo.split("/");
      const slug = parts[2]?.split("?")[0];
      if (slug) {
        try {
          await joinProgramme({
            tenantSlug: slug,
            email,
            name,
            marketingOptIn: true,
            allowExistingUser: true,
          });
        } catch (joinErr) {
          // If already member, ignore
          console.log("Customer join on Google login notice:", joinErr);
        }
      }
    }

    // 5. Check if staff/admin, or auto-provision tenant if owner signup
    let staffRow = await db.select().from(staffMembers).where(eq(staffMembers.userId, userId)).limit(1);
    if (staffRow.length === 0 && (targetRole === "owner" || returnTo === "/dashboard")) {
      try {
        const bizName = `${name}'s Business`;
        const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "my-biz";
        const uniqueSlug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;
        await registerOwnerAndTenant({
          email,
          password: crypto.randomUUID(),
          name,
          businessName: bizName,
          slug: uniqueSlug,
          programmeType: "points",
        });
        staffRow = await db.select().from(staffMembers).where(eq(staffMembers.userId, userId)).limit(1);
      } catch (provisionErr) {
        console.error("Auto-provision business tenant on Google signup notice:", provisionErr);
      }
    }

    const isStaff = staffRow.length > 0 || existingUser?.isPlatformAdmin || false;

    // 6. Create session
    const { token, expiresAt } = await createSession(userId, isStaff);

    // 7. Set session cookie and redirect
    const response = NextResponse.redirect(new URL(returnTo, appUrl));
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Google authentication error";
    console.error("Google OAuth error:", err);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(msg)}&returnTo=${encodeURIComponent(returnTo)}`, appUrl)
    );
  }
}

