import { db } from "../db";
import { products } from "../db/schema";
import { RequestContext } from "../security/permissions";
import { eq, and, desc } from "drizzle-orm";
import { logAuditEvent } from "./audit";
import { z } from "zod";

export const productInputSchema = z.object({
  name: z.string().min(1, "Product name is required").max(255),
  category: z.string().default("General"),
  priceMinor: z.number().int().min(0, "Price must be non-negative (in pence)"),
  pointsAwarded: z.number().int().min(0, "Points must be non-negative").default(1),
  discountPercent: z.number().int().min(0).max(100).default(0),
  isActive: z.boolean().default(true),
});

export type ProductInput = z.infer<typeof productInputSchema>;

export async function getProducts(
  ctx: RequestContext,
  options: { activeOnly?: boolean; category?: string } = {}
) {
  if (!ctx.tenantId) throw new Error("tenantId required");

  const conditions = [eq(products.tenantId, ctx.tenantId)];

  if (options.activeOnly !== false) {
    conditions.push(eq(products.isActive, true));
  }

  if (options.category) {
    conditions.push(eq(products.category, options.category));
  }

  return await db
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(desc(products.createdAt));
}

export async function createProduct(ctx: RequestContext, input: ProductInput) {
  if (!ctx.tenantId) throw new Error("tenantId required");

  // Allowed for owner, manager, staff
  if (!["owner", "manager", "staff", "platform_admin"].includes(ctx.role)) {
    throw new Error("Unauthorized to add products");
  }

  const validated = productInputSchema.parse(input);

  const [newProduct] = await db
    .insert(products)
    .values({
      tenantId: ctx.tenantId,
      name: validated.name.trim(),
      category: validated.category.trim() || "General",
      priceMinor: validated.priceMinor,
      pointsAwarded: validated.pointsAwarded,
      discountPercent: validated.discountPercent,
      isActive: validated.isActive,
      createdBy: ctx.userId,
    })
    .returning();

  await logAuditEvent(ctx, {
    action: "product.created",
    targetType: "product",
    targetId: newProduct.id,
    metadata: { name: newProduct.name, priceMinor: newProduct.priceMinor, points: newProduct.pointsAwarded },
  });

  return newProduct;
}

export async function updateProduct(
  ctx: RequestContext,
  productId: string,
  input: Partial<ProductInput>
) {
  if (!ctx.tenantId) throw new Error("tenantId required");

  if (!["owner", "manager", "staff", "platform_admin"].includes(ctx.role)) {
    throw new Error("Unauthorized to modify products");
  }

  const [existing] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, ctx.tenantId)))
    .limit(1);

  if (!existing) {
    throw new Error("Product not found");
  }

  const [updated] = await db
    .update(products)
    .set({
      name: input.name !== undefined ? input.name.trim() : existing.name,
      category: input.category !== undefined ? input.category.trim() : existing.category,
      priceMinor: input.priceMinor !== undefined ? input.priceMinor : existing.priceMinor,
      pointsAwarded: input.pointsAwarded !== undefined ? input.pointsAwarded : existing.pointsAwarded,
      discountPercent: input.discountPercent !== undefined ? input.discountPercent : existing.discountPercent,
      isActive: input.isActive !== undefined ? input.isActive : existing.isActive,
      updatedAt: new Date(),
    })
    .where(and(eq(products.id, productId), eq(products.tenantId, ctx.tenantId)))
    .returning();

  await logAuditEvent(ctx, {
    action: "product.updated",
    targetType: "product",
    targetId: productId,
    metadata: { changes: input },
  });

  return updated;
}

export async function setStorewideDiscount(ctx: RequestContext, discountPercent: number) {
  if (!ctx.tenantId) throw new Error("tenantId required");

  if (!["owner", "manager", "staff", "platform_admin"].includes(ctx.role)) {
    throw new Error("Unauthorized to set storewide discounts");
  }

  const clampedDiscount = Math.max(0, Math.min(100, Math.round(discountPercent)));

  const updatedRows = await db
    .update(products)
    .set({
      discountPercent: clampedDiscount,
      updatedAt: new Date(),
    })
    .where(eq(products.tenantId, ctx.tenantId))
    .returning();

  await logAuditEvent(ctx, {
    action: "product.storewide_discount_set",
    targetType: "tenant",
    targetId: ctx.tenantId,
    metadata: { discountPercent: clampedDiscount, affectedCount: updatedRows.length },
  });

  return { discountPercent: clampedDiscount, count: updatedRows.length };
}

export async function deleteProduct(ctx: RequestContext, productId: string) {
  if (!ctx.tenantId) throw new Error("tenantId required");

  if (!["owner", "manager", "staff", "platform_admin"].includes(ctx.role)) {
    throw new Error("Unauthorized to delete products");
  }

  const [deleted] = await db
    .delete(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, ctx.tenantId)))
    .returning();

  if (!deleted) {
    throw new Error("Product not found");
  }

  await logAuditEvent(ctx, {
    action: "product.deleted",
    targetType: "product",
    targetId: productId,
    metadata: { name: deleted.name },
  });

  return deleted;
}

