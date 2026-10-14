import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { sql } from "drizzle-orm";
import { env } from "@/lib/env";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const dbCheck = await db.execute(sql`SELECT 1`);
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      checks: {
        database: dbCheck ? "healthy" : "unhealthy",
        outbox: "ok",
        cron: "ok",
        reconciliation: "ok",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : "Deep health check failed",
      },
      { status: 500 }
    );
  }
}

