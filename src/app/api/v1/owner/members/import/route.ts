import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardApiRequest } from "@/server/auth/route-guard";
import { requireRecentAuth } from "@/server/auth/reauth";
import { IMPORT_TEMPLATE, previewImport, runImport } from "@/server/services/member-import";

const guardOptions = { allowedRoles: ["owner" as const, "manager" as const], requireTenant: true };

/** The CSV template, so the owner knows the layout. */
export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, guardOptions);
  if ("response" in guard) return guard.response;
  return new NextResponse(IMPORT_TEMPLATE, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="customer-import-template.csv"' },
  });
}

const bodySchema = z.object({
  csv: z.string().min(1, "Choose a file first.").max(1_100_000),
  // false = only check the file; true = add the customers
  commit: z.boolean().default(false),
  // The owner confirms they hold the consent for the rows marked "yes" to marketing
  consentAttested: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, guardOptions);
  if ("response" in guard) return guard.response;
  try {
    const body = bodySchema.parse(await request.json());
    if (!body.commit) return NextResponse.json({ data: await previewImport(guard.ctx, body.csv) });
    // Adding many customers at once is a sensitive step
    const denied = await requireRecentAuth(request);
    if (denied) return denied;
    return NextResponse.json({ data: await runImport(guard.ctx, body.csv, { consentAttested: body.consentAttested }) }, { status: 201 });
  } catch (err) {
    const message = err instanceof z.ZodError ? err.errors[0]?.message ?? "Check the file." : err instanceof Error ? err.message : "Couldn't read that file.";
    return NextResponse.json({ error: { code: "IMPORT_FAILED", message } }, { status: 400 });
  }
}
