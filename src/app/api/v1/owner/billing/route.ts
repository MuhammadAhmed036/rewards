import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { getBillingOverview } from "@/server/services/billing";

/** The owner's plan, payment status, usage against the plan, and invoices. */
export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, { allowedRoles: ["owner"], requireTenant: true });
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await getBillingOverview(guard.ctx) });
  } catch (err) {
    return NextResponse.json({ error: { code: "BILLING_LOAD_FAILED", message: err instanceof Error ? err.message : "Couldn't load billing" } }, { status: 400 });
  }
}
