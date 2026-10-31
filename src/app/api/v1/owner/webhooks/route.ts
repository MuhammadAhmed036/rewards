import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardApiRequest } from "@/server/auth/route-guard";
import { requireRecentAuth } from "@/server/auth/reauth";
import { createWebhook, deleteWebhook, listWebhooks, rotateWebhookSecret, sendTestEvent, setWebhookActive } from "@/server/services/webhooks";

const guardOptions = { allowedRoles: ["owner" as const], requireTenant: true };

function failure(code: string, err: unknown, fallback: string) {
  const message = err instanceof z.ZodError ? err.errors[0]?.message || fallback : err instanceof Error ? err.message : fallback;
  return NextResponse.json({ error: { code, message } }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, guardOptions);
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await listWebhooks(guard.ctx) });
  } catch (err) {
    return failure("WEBHOOKS_LOAD_FAILED", err, "Couldn't load your webhooks");
  }
}

const createSchema = z.object({ url: z.string().min(1), events: z.array(z.string()).optional() });

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, guardOptions);
  if ("response" in guard) return guard.response;
  const denied = await requireRecentAuth(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ data: await createWebhook(guard.ctx, createSchema.parse(await request.json())) }, { status: 201 });
  } catch (err) {
    return failure("WEBHOOK_CREATE_FAILED", err, "Couldn't add that webhook");
  }
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("test") }),
  z.object({ action: z.literal("rotate"), id: z.string().uuid() }),
  z.object({ action: z.literal("active"), id: z.string().uuid(), active: z.boolean() }),
]);

export async function PATCH(request: NextRequest) {
  const guard = await guardApiRequest(request, guardOptions);
  if ("response" in guard) return guard.response;
  try {
    const body = patchSchema.parse(await request.json());
    if (body.action === "test") return NextResponse.json({ data: await sendTestEvent(guard.ctx) });
    if (body.action === "active") return NextResponse.json({ data: await setWebhookActive(guard.ctx, body.id, body.active) });
    const denied = await requireRecentAuth(request);
    if (denied) return denied;
    return NextResponse.json({ data: await rotateWebhookSecret(guard.ctx, body.id) });
  } catch (err) {
    return failure("WEBHOOK_UPDATE_FAILED", err, "Couldn't change that webhook");
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await guardApiRequest(request, guardOptions);
  if ("response" in guard) return guard.response;
  const denied = await requireRecentAuth(request);
  if (denied) return denied;
  try {
    const id = z.string().uuid().parse(request.nextUrl.searchParams.get("id"));
    return NextResponse.json({ data: await deleteWebhook(guard.ctx, id) });
  } catch (err) {
    return failure("WEBHOOK_DELETE_FAILED", err, "Couldn't remove that webhook");
  }
}
