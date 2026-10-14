import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "./index";
import { RequestContext, UserRole } from "../security/permissions";
import crypto from "crypto";

export interface GuardOptions {
  allowedRoles?: UserRole[];
  requireTenant?: boolean;
}

export async function guardApiRequest(
  request: NextRequest,
  options: GuardOptions = {}
): Promise<{ ctx: RequestContext } | { response: NextResponse }> {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();

  // Read session token from cookie or Authorization header
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  const cookieToken = request.cookies.get("loyalty_session")?.value || null;
  const token = bearerToken || cookieToken;

  const tenantSlugOrId =
    request.headers.get("x-tenant-id") ||
    request.headers.get("x-tenant-slug") ||
    request.nextUrl.searchParams.get("tenantId") ||
    undefined;

  const ctx = await getSessionContext(token, tenantSlugOrId, requestId);

  if (!ctx) {
    return {
      response: NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      ),
    };
  }

  if (options.requireTenant && !ctx.tenantId && !ctx.isPlatformAdmin) {
    return {
      response: NextResponse.json(
        { error: { code: "TENANT_REQUIRED", message: "Tenant context is required" } },
        { status: 400 }
      ),
    };
  }

  if (options.allowedRoles && options.allowedRoles.length > 0) {
    if (!ctx.isPlatformAdmin && !options.allowedRoles.includes(ctx.role)) {
      return {
        response: NextResponse.json(
          {
            error: {
              code: "FORBIDDEN",
              message: `Role ${ctx.role} is not permitted to access this resource`,
            },
          },
          { status: 403 }
        ),
      };
    }
  }

  return { ctx };
}

