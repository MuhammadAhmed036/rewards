import { NextRequest, NextResponse } from "next/server";
import { deleteSession, storeSlugForSession } from "@/server/auth";
import { clearSessionCookie, readSessionCookie } from "@/server/auth/session-response";

export async function POST(request: NextRequest) {
  let redirectTo = "/login";
  try {
    const token = readSessionCookie(request);
    if (token) {
      // Work out the store first: the session is gone once it is deleted
      const slug = await storeSlugForSession(token, request.nextUrl.searchParams.get("store"));
      if (slug) redirectTo = `/b/${slug}`;
      await deleteSession(token);
    }
    return clearSessionCookie(NextResponse.json({ success: true, message: "Logged out successfully", redirectTo }));
  } catch (error) {
    console.error("Logout error:", error);
    return clearSessionCookie(NextResponse.json({ success: true, redirectTo }));
  }
}
