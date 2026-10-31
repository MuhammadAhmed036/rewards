import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { listTenants } from "@/server/services/admin";
import { registerOwnerAndTenant } from "@/server/services/tenant";
import { z } from "zod";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["platform_admin"],
  });
  if ("response" in guard) return guard.response;

  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q") || undefined;
  const status = searchParams.get("status") || undefined;
  const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : undefined;
  const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!, 10) : undefined;

  const result = await listTenants(guard.ctx, { q, status, limit, offset });
  return NextResponse.json({ data: result });
}

const createTenantSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(2).max(64),
  ownerEmail: z.string().email(),
  ownerName: z.string().min(1),
  password: z.string().min(8),
  plan: z.enum(["free", "pro"]).default("free"),
  programmeType: z.enum(["points", "stamps"]).default("points"),
  industry: z.string().optional(),
  locationName: z.string().optional(),
  brandPrimaryHex: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["platform_admin"],
  });
  if ("response" in guard) return guard.response;

  try {
    const body = await request.json().catch(() => ({}));
    const validated = createTenantSchema.parse(body);

    const result = await registerOwnerAndTenant({
      email: validated.ownerEmail,
      password: validated.password,
      name: validated.ownerName,
      businessName: validated.name,
      slug: validated.slug,
      programmeType: validated.programmeType,
      industry: validated.industry,
      plan: validated.plan,
      locationName: validated.locationName,
      brandPrimaryHex: validated.brandPrimaryHex,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "CREATE_TENANT_FAILED",
          message: err instanceof Error ? err.message : "Failed to create business tenant",
        },
      },
      { status: 400 }
    );
  }
}

