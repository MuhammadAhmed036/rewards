import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const returnTo = searchParams.get("returnTo") || "/dashboard";
  const role = searchParams.get("role") || (returnTo === "/me" ? "customer" : "owner");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/v1/auth/google/callback`;

  if (!clientId || clientId.startsWith("dev_mock") || clientId.startsWith("mock-")) {
    // If running in development with mock client, provide one-click mock login
    return NextResponse.redirect(
      new URL(`/login?error=Google OAuth client ID not configured. Please use demo logins.`, request.url)
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

