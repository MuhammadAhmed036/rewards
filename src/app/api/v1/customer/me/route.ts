import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { getCustomerPrivacyData, deleteAndAnonymiseAccount } from "@/server/services/privacy";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request);
  if ("response" in guard) return guard.response;

  try {
    const data = await getCustomerPrivacyData(guard.ctx.userId);
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          message: err instanceof Error ? err.message : "Profile not found",
        },
      },
      { status: 404 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await guardApiRequest(request);
  if ("response" in guard) return guard.response;

  try {
    const result = await deleteAndAnonymiseAccount(guard.ctx.userId);
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "DELETION_FAILED",
          message: err instanceof Error ? err.message : "Deletion failed",
        },
      },
      { status: 400 }
    );
  }
}

