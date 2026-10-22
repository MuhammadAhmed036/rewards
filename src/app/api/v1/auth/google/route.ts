import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/url";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { joinProgramme } from "@/server/services/member";
import { createSession } from "@/server/auth";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const returnTo = searchParams.get("returnTo") || "/dashboard";
  const role = searchParams.get("role") || (returnTo === "/me" ? "customer" : "owner");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = getBaseUrl(request);
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/v1/auth/google/callback`;

  if (!clientId || clientId.startsWith("dev_mock") || clientId.startsWith("mock-")) {
    // Seamless one-click demo login for customers and owners when Google Cloud OAuth credentials are not set
    try {
      if (role === "customer" || returnTo.startsWith("/b/") || returnTo === "/me") {
        const demoEmail = "google.customer@loyalty.demo";
        let [user] = await db.select().from(users).where(eq(users.email, demoEmail)).limit(1);
        if (!user) {
          const [newUser] = await db
            .insert(users)
            .values({
              email: demoEmail,
              name: "Google Customer",
              emailVerifiedAt: new Date(),
            })
            .returning();
          user = newUser;
        }

        // Auto-join to store programme if returnTo is a business hub
        if (returnTo.startsWith("/b/")) {
          const slug = returnTo.split("/")[2]?.split("?")[0];
          if (slug) {
            try {
              await joinProgramme({
                tenantSlug: slug,
                email: demoEmail,
                name: "Google Customer",
                marketingOptIn: true,
                allowExistingUser: true,
              });
            } catch (joinErr) {
              console.log("Customer join on Google login notice:", joinErr);
            }
          }
        }

        const { token, expiresAt } = await createSession(user.id, false);
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
      } else {
        // Business owner demo login fallback
        const demoOwnerEmail = "barber-owner@platform.local";
        const [ownerUser] = await db.select().from(users).where(eq(users.email, demoOwnerEmail)).limit(1);
        if (ownerUser) {
          const { token, expiresAt } = await createSession(ownerUser.id, true);
          const response = NextResponse.redirect(new URL("/dashboard", appUrl));
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
      }
    } catch (e) {
      console.error("Mock Google auth error:", e);
    }

    return NextResponse.redirect(
      new URL(returnTo.startsWith("/b/") ? returnTo : `/login?error=Google OAuth not configured`, request.url)
    );
  }

  const stateObj = { returnTo, role, ts: Date.now() };
  const state = Buffer.from(JSON.stringify(stateObj)).toString("base64url");

  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleAuthUrl.searchParams.set("client_id", clientId);
  googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set("scope", "openid email profile");
  googleAuthUrl.searchParams.set("state", state);
  googleAuthUrl.searchParams.set("access_type", "offline");
  googleAuthUrl.searchParams.set("prompt", "select_account");

  return NextResponse.redirect(googleAuthUrl.toString());
}

