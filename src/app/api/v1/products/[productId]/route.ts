import { NextRequest, NextResponse } from "next/server";
import { guardApiRequest } from "@/server/auth/route-guard";
import { updateProduct, deleteProduct, productInputSchema } from "@/server/services/products";

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ productId: string }> }
) {
  const params = await props.params;
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager", "staff", "platform_admin"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  try {
    const body = await request.json().catch(() => ({}));
    const partialSchema = productInputSchema.partial();
    const validated = partialSchema.parse(body);

    const updated = await updateProduct(guard.ctx, params.productId, validated);
    return NextResponse.json({ data: updated });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "UPDATE_PRODUCT_FAILED",
          message: err instanceof Error ? err.message : "Failed to update product",
        },
      },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ productId: string }> }
) {
  const params = await props.params;
  const guard = await guardApiRequest(request, {
    allowedRoles: ["owner", "manager", "staff", "platform_admin"],
    requireTenant: true,
  });
  if ("response" in guard) return guard.response;

  try {
    const deleted = await deleteProduct(guard.ctx, params.productId);
    return NextResponse.json({ data: deleted });
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: "DELETE_PRODUCT_FAILED",
          message: err instanceof Error ? err.message : "Failed to delete product",
        },
      },
      { status: 400 }
    );
  }
}

