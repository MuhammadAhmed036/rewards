import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { getAllTenantLinks, updateBusinessLinks } from "@/server/services/links";
import { z } from "zod";

const linksUpdateSchema = z.array(
  z.object({
    type: z.enum(["google_review", "instagram", "facebook", "website", "other"]),
    label: z.string().min(1).max(128),
    url: z.string().min(1),
    enabled: z.boolean(),
    sortOrder: z.number().int(),
    locationId: z.string().optional(),
  })
);

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  const links = await getAllTenantLinks(guard.ctx.tenantId!);
  return NextResponse.json({ data: links });
}

export async function PUT(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  try {
    const body = await request.json();
    const validated = linksUpdateSchema.parse(body);

    const updated = await updateBusinessLinks(guard.ctx, validated);
    return NextResponse.json({ data: updated });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "LINKS_UPDATE_FAILED",
          message: err instanceof Error ? err.message : "Failed to update links",
        },
      },
      { status: 400 }
    );
  }
}

