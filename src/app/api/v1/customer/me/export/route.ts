import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { exportUserDataJson } from "@/server/services/privacy";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request);
  if ("response" in guard) return guard.response;

  try {
    const data = await exportUserDataJson(guard.ctx.userId);
    const jsonString = JSON.stringify(data, null, 2);

    return new NextResponse(jsonString, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="loyalty-data-export-${Date.now()}.json"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "EXPORT_FAILED",
          message: err instanceof Error ? err.message : "Failed to export data",
        },
      },
      { status: 500 }
    );
  }
}

