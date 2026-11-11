import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardApiRequest } from "@/server/auth/route-guard";
import { assertRateLimit, RateLimitError, rateLimitResponse } from "@/server/security/rate-limit";
import { createGroup, disbandGroup, getGroup, joinGroup, leaveGroup, newGroupCode, removeBrand } from "@/server/services/organisations";

/** A group of brands (FR-015). Only a business's owner can start, join, leave or change a group. */

function failure(err: unknown) {
  if (err instanceof RateLimitError) return rateLimitResponse(err);
  const message = err instanceof z.ZodError ? err.errors[0]?.message || "Check what you entered" : err instanceof Error ? err.message : "Couldn't do that";
  return NextResponse.json({ error: { code: "GROUP_FAILED", message } }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, { allowedRoles: ["owner"], requireTenant: true });
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await getGroup(guard.ctx) });
  } catch (err) {
    return failure(err);
  }
}

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), name: z.string().min(2, "Give the group a name").max(120) }),
  z.object({ action: z.literal("join"), code: z.string().min(4, "Enter the group's code").max(32) }),
  z.object({ action: z.literal("leave") }),
  z.object({ action: z.literal("remove"), tenantId: z.string().uuid() }),
  z.object({ action: z.literal("disband") }),
  z.object({ action: z.literal("new_code") }),
]);

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, { allowedRoles: ["owner"], requireTenant: true });
  if ("response" in guard) return guard.response;
  try {
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    switch (body.action) {
      case "create":
        return NextResponse.json({ data: await createGroup(guard.ctx, body.name) }, { status: 201 });
      case "join":
        // Codes are guessable only by trying many, so slow that down
        await assertRateLimit(`group-join:${guard.ctx.userId}`, 10, 3600, "RATE_LIMITED: Too many tries. Wait a while and try again.");
        return NextResponse.json({ data: await joinGroup(guard.ctx, body.code) });
      case "leave":
        return NextResponse.json({ data: await leaveGroup(guard.ctx) });
      case "remove":
        return NextResponse.json({ data: await removeBrand(guard.ctx, body.tenantId) });
      case "disband":
        return NextResponse.json({ data: await disbandGroup(guard.ctx) });
      case "new_code":
        return NextResponse.json({ data: await newGroupCode(guard.ctx) });
    }
  } catch (err) {
    return failure(err);
  }
}
