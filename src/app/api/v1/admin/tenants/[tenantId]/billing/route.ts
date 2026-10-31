import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardApiRequest } from "@/server/auth/route-guard";
import { adminBillingView, cancelPlan, createInvoice, markInvoicePaid, PLANS, setTenantPlan, voidInvoice } from "@/server/services/billing";

export async function GET(request: NextRequest, props: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await props.params;
  const guard = await guardApiRequest(request, { allowedRoles: ["platform_admin"] });
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: { ...(await adminBillingView(guard.ctx, tenantId)), plans: PLANS } });
  } catch (err) {
    return NextResponse.json({ error: { code: "BILLING_LOAD_FAILED", message: err instanceof Error ? err.message : "Couldn't load billing" } }, { status: 400 });
  }
}

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("plan"), plan: z.enum(["free", "pro"]), trialDays: z.number().int().min(0).max(90).optional(), reason: z.string() }),
  z.object({ action: z.literal("invoice"), description: z.string(), amountMinor: z.number().int(), dueInDays: z.number().int().min(0).max(90) }),
  z.object({ action: z.literal("paid"), invoiceId: z.string().uuid() }),
  z.object({ action: z.literal("void"), invoiceId: z.string().uuid() }),
  z.object({ action: z.literal("cancel"), reason: z.string() }),
]);

export async function POST(request: NextRequest, props: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await props.params;
  const guard = await guardApiRequest(request, { allowedRoles: ["platform_admin"] });
  if ("response" in guard) return guard.response;
  try {
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const { ctx } = guard;
    switch (body.action) {
      case "plan":
        return NextResponse.json({ data: await setTenantPlan(ctx, tenantId, body) });
      case "invoice":
        return NextResponse.json({ data: await createInvoice(ctx, tenantId, body) }, { status: 201 });
      case "paid":
        return NextResponse.json({ data: await markInvoicePaid(ctx, body.invoiceId) });
      case "void":
        return NextResponse.json({ data: await voidInvoice(ctx, body.invoiceId) });
      case "cancel":
        return NextResponse.json({ data: await cancelPlan(ctx, tenantId, body.reason) });
    }
  } catch (err) {
    const message = err instanceof z.ZodError ? err.errors[0]?.message ?? "Check what you entered." : err instanceof Error ? err.message : "Couldn't do that.";
    return NextResponse.json({ error: { code: "BILLING_FAILED", message } }, { status: 400 });
  }
}
