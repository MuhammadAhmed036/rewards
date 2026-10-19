import { NextRequest, NextResponse } from "next/server";
import { deleteSession } from "@/server/auth";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("loyalty_session")?.value;
    if (token) {
      await deleteSession(token);
    }

    const response = NextResponse.json({ success: true, message: "Logged out successfully" });
    response.cookies.delete("loyalty_session");
    return response;
  } catch (error) {
    console.error("Logout error:", error);
    const response = NextResponse.json({ success: true });
    response.cookies.delete("loyalty_session");
    return response;
  }
}

