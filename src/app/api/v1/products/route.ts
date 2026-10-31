import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import {
  getProducts,
  createProduct,
  setStorewideDiscount,
  productInputSchema,
} from "@/server/services/products";
import { z } from "zod";

export async function GET(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager", "staff", "platform_admin"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  try {
    const category = request.nextUrl.searchParams.get("category") || undefined;
    const activeOnly = request.nextUrl.searchParams.get("activeOnly") !== "false";

    const list = await getProducts(guard.ctx, { category, activeOnly });
    return NextResponse.json({ data: list });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "GET_PRODUCTS_FAILED",
          message: err instanceof Error ? err.message : "Failed to load products",
        },
      },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest) {
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager", "staff", "platform_admin"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  try {
    const body = await request.json().catch(() => ({}));

    // Check if storewide discount payload
    if (body.action === "storewide_discount") {
      const discountSchema = z.object({ discountPercent: z.number().min(0).max(100) });
      const parsed = discountSchema.parse(body);
      const res = await setStorewideDiscount(guard.ctx, parsed.discountPercent);
      return NextResponse.json({ data: res });
    }

    const validated = productInputSchema.parse(body);
    const newProduct = await createProduct(guard.ctx, validated);

    return NextResponse.json({ data: newProduct }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "CREATE_PRODUCT_FAILED",
          message: err instanceof Error ? err.message : "Failed to create product",
        },
      },
      { status: 400 }
    );
  }
}

