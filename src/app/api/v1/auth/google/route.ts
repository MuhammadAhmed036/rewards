import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/url";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { joinProgramme } from "@/server/services/member";
import { createSession, sessionKindForUser } from "@/server/auth";
import { setSessionCookie } from "@/server/auth/session-response";
import { eq } from "drizzle-orm";
import { OAUTH_NONCE_COOKIE, createOAuthState, safeReturnTo } from "@/server/auth/oauth-state";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  // Only a path on this site is ever used as the place to land afterwards
  const returnTo = safeReturnTo(searchParams.get("returnTo"));
  const role = searchParams.get("role") || (returnTo === "/me" ? "customer" : "owner");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = getBaseUrl(request);
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/v1/auth/google/callback`;

  const notConfigured = !clientId || clientId.startsWith("dev_mock") || clientId.startsWith("mock-");
  if (notConfigured && process.env.NODE_ENV === "production") {
    // The one-click demo sign-in below signs ANYONE in with no password. It must never exist on a live site:
    // a missing or placeholder Google key there means "Google sign-in isn't set up", nothing more.
    console.error("Google sign-in requested but GOOGLE_CLIENT_ID is missing or a placeholder.");
    return NextResponse.redirect(new URL("/login?error=Google sign-in is not available", appUrl));
  }

  if (notConfigured) {
    // Development only: seamless one-click demo login for customers and owners when Google Cloud OAuth credentials are not set
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

        const session = await createSession(user.id, await sessionKindForUser(user.id));
        const response = NextResponse.redirect(new URL(returnTo, appUrl));
        setSessionCookie(response, session);
        return response;
      }
    } catch (e) {
      console.error("Mock Google auth error:", e);
    }

    return NextResponse.redirect(
      new URL(returnTo.startsWith("/b/") ? returnTo : `/login?error=Google OAuth not configured`, request.url)
    );
  }

  const { state, nonce } = createOAuthState({ returnTo, role });

  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleAuthUrl.searchParams.set("client_id", clientId);
  googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set("scope", "openid email profile");
  googleAuthUrl.searchParams.set("state", state);
  googleAuthUrl.searchParams.set("access_type", "offline");
  googleAuthUrl.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(googleAuthUrl.toString());
  // Ties this sign-in to this browser: the callback only accepts a state whose nonce matches this cookie
  response.cookies.set(OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api",
    maxAge: 600,
  });
  return response;
}

