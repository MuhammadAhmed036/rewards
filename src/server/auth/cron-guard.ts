import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

export function guardCronRequest(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid or missing cron secret" } },
      { status: 401 }
    );
  }
  return null;
}

