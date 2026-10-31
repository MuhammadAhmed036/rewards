import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardApiRequest } from "@/server/auth/route-guard";
import { getProgrammeTerms, updateProgrammeTerms } from "@/server/services/programme";

const guardOptions = { allowedRoles: ["owner" as const], requireTenant: true };

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, guardOptions);
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await getProgrammeTerms(guard.ctx) });
  } catch (err) {
    return NextResponse.json({ error: { code: "TERMS_LOAD_FAILED", message: err instanceof Error ? err.message : "Couldn't load your terms" } }, { status: 400 });
  }
}

const bodySchema = z.object({ text: z.string(), translations: z.record(z.string(), z.string()).default({}) });

export async function PUT(request: NextRequest) {
  const guard = await guardApiRequest(request, guardOptions);
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await updateProgrammeTerms(guard.ctx, bodySchema.parse(await request.json().catch(() => ({})))) });
  } catch (err) {
    const message = err instanceof z.ZodError ? err.errors[0]?.message ?? "Check the text." : err instanceof Error ? err.message : "Couldn't save your terms";
    return NextResponse.json({ error: { code: "TERMS_SAVE_FAILED", message } }, { status: 400 });
  }
}
