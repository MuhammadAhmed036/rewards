import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/server/auth";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("loyalty_session")?.value;
    if (!token) {
      return NextResponse.json({ authenticated: false, user: null });
    }

    const ctx = await getSessionContext(token);
    if (!ctx) {
      return NextResponse.json({ authenticated: false, user: null });
    }

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        isPlatformAdmin: users.isPlatformAdmin,
      })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1);

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: ctx.role,
        tenantId: ctx.tenantId || null,
        isPlatformAdmin: user.isPlatformAdmin,
      },
    });
  } catch (error) {
    console.error("Session check error:", error);
    return NextResponse.json({ authenticated: false, user: null });
  }
}

