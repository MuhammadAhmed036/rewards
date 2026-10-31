import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardApiRequest } from "@/server/auth/route-guard";
import { getProgramme, publishRuleVersion, setProgrammeStatus } from "@/server/services/programme";

function failure(code: string, err: unknown, fallback: string) {
  const message =
    err instanceof z.ZodError
      ? err.errors[0]?.message || fallback
      : err instanceof Error
        ? err.message.replace(/ \(FR-\d+\)$/, "")
        : fallback;
  return NextResponse.json({ error: { code, message } }, { status: 400 });
}

/** The programme, its current earning rule and recent rule versions. */
export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, { allowedRoles: ["owner", "manager"], requireTenant: true });
  if ("response" in guard) return guard.response;
  try {
    return NextResponse.json({ data: await getProgramme(guard.ctx) });
  } catch (err) {
    return failure("PROGRAMME_LOAD_FAILED", err, "Couldn't load your programme");
  }
}

/** Publishes a new rule version; earlier transactions keep the version they were awarded under. */
export async function PUT(request: NextRequest) {
  const guard = await guardApiRequest(request, { allowedRoles: ["owner"], requireTenant: true });
  if ("response" in guard) return guard.response;
  try {
    const version = await publishRuleVersion(guard.ctx, await request.json().catch(() => ({})));
    return NextResponse.json({ data: version });
  } catch (err) {
    return failure("RULE_PUBLISH_FAILED", err, "Couldn't save the new rules");
  }
}

const statusSchema = z.object({ status: z.enum(["published", "paused"]) });

/** Pause (staff can't add points) or make the programme live again. */
export async function PATCH(request: NextRequest) {
  const guard = await guardApiRequest(request, { allowedRoles: ["owner"], requireTenant: true });
  if ("response" in guard) return guard.response;
  try {
    const { status } = statusSchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json({ data: await setProgrammeStatus(guard.ctx, status) });
  } catch (err) {
    return failure("PROGRAMME_STATUS_FAILED", err, "Couldn't change the programme status");
  }
}
