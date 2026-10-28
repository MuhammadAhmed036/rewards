import { NextRequest, NextResponse } from "next/server";
import { deleteSession } from "@/server/auth";
import { clearSessionCookie, readSessionCookie } from "@/server/auth/session-response";

export async function POST(request: NextRequest) {
  try {
    const token = readSessionCookie(request);
    if (token) {
      await deleteSession(token);
    }
    return clearSessionCookie(NextResponse.json({ success: true, message: "Logged out successfully" }));
  } catch (error) {
    console.error("Logout error:", error);
    return clearSessionCookie(NextResponse.json({ success: true }));
  }
}
