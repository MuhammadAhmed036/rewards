import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardApiRequest } from "@/server/auth/route-guard";
import { blockEmail, listBlockedEmails, unblockEmail } from "@/server/services/blocked-emails";

function failure(code: string, err: unknown, fallback: string) {
  const message = err instanceof z.ZodError ? err.errors[0]?.message || fallback : err instanceof Error ? err.message : fallback;
  return NextResponse.json({ error: { code, message } }, { status: 400 });
}

const guardOptions = { allowedRoles: ["owner", "manager"] as ("owner" | "manager")[], requireTenant: true };

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, guardOptions);
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await listBlockedEmails(guard.ctx) });
  } catch (err) {
    return failure("BLOCKED_LOAD_FAILED", err, "Couldn't load the blocked list");
  }
}

const blockSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  reason: z.string().trim().min(1, "Say why you are blocking this email.").max(300),
});

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, guardOptions);
  if ("response" in guard) return guard.response;
  try {
    const body = blockSchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json({ data: await blockEmail(guard.ctx, body) });
  } catch (err) {
    return failure("BLOCK_FAILED", err, "Couldn't block that email");
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await guardApiRequest(request, guardOptions);
  if ("response" in guard) return guard.response;
  try {
    const id = z.string().uuid().parse(request.nextUrl.searchParams.get("id"));
    return NextResponse.json({ data: await unblockEmail(guard.ctx, id) });
  } catch (err) {
    return failure("UNBLOCK_FAILED", err, "Couldn't remove that email from the list");
  }
}
