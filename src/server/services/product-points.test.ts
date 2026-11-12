import "dotenv/config";
import { describe, it, expect } from "vitest";
import { db } from "../db";
import { ledgerEntries } from "../db/schema";
import { eq } from "drizzle-orm";
import { registerOwnerAndTenant } from "./tenant";
import { joinProgramme } from "./member";
import { publishRuleVersion } from "./programme";
import { createProduct } from "./products";
import { earn, previewEarn } from "./ledger";
import { RequestContext } from "../security/permissions";

async function shop() {
  const stamp = `prod-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const s = await registerOwnerAndTenant({ email: `owner-${stamp}@prod.test`, password: "Password123!", name: "Prod Owner", businessName: `Prod ${stamp}`, slug: stamp, emailVerified: true });
  const ctx: RequestContext = { userId: s.user.id, tenantId: s.tenant.id, role: "owner", requestId: "prod" };
  await publishRuleVersion(ctx, { earn: { mode: "spend", pointsPerUnit: 1, unitMinor: 100 }, caps: { minMinutesBetweenEarns: 0, maxPointsPerMemberPerDay: 100000 }, exclusions: {}, expiry: {} });
  return { ...s, ctx, slug: stamp };
}

describe("Points from the products a customer bought", () => {
  it("gives each product's own points times the quantity, and records what was bought", async () => {
    const s = await shop();
    const coffee = await createProduct(s.ctx, { name: "Coffee", category: "Drinks", priceMinor: 450, pointsAwarded: 5, discountPercent: 0, isActive: true });
    const cake = await createProduct(s.ctx, { name: "Cake", category: "Food", priceMinor: 300, pointsAwarded: 3, discountPercent: 0, isActive: true });
    const m = await joinProgramme({ tenantSlug: s.slug, email: `buyer-${s.slug}@prod.test` });
    const items = [{ productId: coffee.id, quantity: 2 }, { productId: cake.id, quantity: 1 }];

    const preview = await previewEarn(s.ctx, { membershipId: m.membership.id, locationId: s.location.id, items });
    expect(preview.pointsToAward).toBe(13); // 2 x 5 + 1 x 3, not 1 point per pound

    const res = await earn(s.ctx, { membershipId: m.membership.id, locationId: s.location.id, items, idempotencyKey: crypto.randomUUID() });
    expect(res.pointsDelta).toBe(13);
    const [entry] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.id, res.entryId));
    expect(entry.basisAmountMinor).toBe(1200); // 2 x 4.50 + 3.00
    expect(entry.note).toContain("2 × Coffee");
    expect(entry.note).toContain("1 × Cake");
  });

  it("refuses products from another shop, removed products and silly quantities", async () => {
    const s = await shop();
    const other = await shop();
    const theirs = await createProduct(other.ctx, { name: "Theirs", category: "x", priceMinor: 100, pointsAwarded: 50, discountPercent: 0, isActive: true });
    const m = await joinProgramme({ tenantSlug: s.slug, email: `buyer2-${s.slug}@prod.test` });
    const go = (items: { productId: string; quantity: number }[]) =>
      earn(s.ctx, { membershipId: m.membership.id, locationId: s.location.id, items, idempotencyKey: crypto.randomUUID() });

    await expect(go([{ productId: theirs.id, quantity: 1 }])).rejects.toThrow(/BAD_BASKET/);
    await expect(go([{ productId: crypto.randomUUID(), quantity: 1 }])).rejects.toThrow(/BAD_BASKET/);
    const mine = await createProduct(s.ctx, { name: "Mine", category: "x", priceMinor: 100, pointsAwarded: 1, discountPercent: 0, isActive: true });
    await expect(go([{ productId: mine.id, quantity: 0 }])).rejects.toThrow(/BAD_BASKET/);
    await expect(go([{ productId: mine.id, quantity: 1000 }])).rejects.toThrow(/BAD_BASKET/);
  });
});
