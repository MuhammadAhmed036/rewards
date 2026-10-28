import "dotenv/config";
import { describe, it, expect } from "vitest";
import { registerOwnerAndTenant } from "./tenant";
import { joinProgramme } from "./member";
import { addStaffMember } from "./staff";
import { createProduct } from "./products";
import { createReward, getRewards } from "./rewards";
import { adjustBalance, redeemForMember } from "./ledger";
import { RequestContext } from "../security/permissions";
import { db } from "../db";
import { ledgerEntries, rewards } from "../db/schema";
import { eq } from "drizzle-orm";

async function setupShop(tag: string) {
  const stamp = `${tag}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const shop = await registerOwnerAndTenant({
    email: `owner-${stamp}@menu.test`,
    password: "Password123!",
    name: "Menu Owner",
    businessName: `Menu Cafe ${stamp}`,
    slug: stamp,
  });
  const ownerCtx: RequestContext = { userId: shop.user.id, tenantId: shop.tenant.id, role: "owner", requestId: "menu" };
  const staff = await addStaffMember(ownerCtx, { email: `staff-${stamp}@menu.test`, name: "Sam Staff", role: "staff", temporaryPassword: "Password123!" });
  const staffCtx: RequestContext = { userId: staff.userId, tenantId: shop.tenant.id, role: "staff", requestId: "menu-staff" };
  const customer = await joinProgramme({ tenantSlug: stamp, email: `cust-${stamp}@menu.test`, name: "Cara Customer" });
  const tea = await createProduct(ownerCtx, { name: "Tea", category: "Drinks", priceMinor: 250, pointsAwarded: 1, discountPercent: 0, isActive: true });
  const cookie = await createProduct(staffCtx, { name: "Cookie", category: "Food", priceMinor: 150, pointsAwarded: 1, discountPercent: 0, isActive: true });
  return { shop, ownerCtx, staffCtx, membershipId: customer.membership.id, tea, cookie, stamp };
}

async function givePoints(ctx: RequestContext, membershipId: string, points: number) {
  await adjustBalance(ctx, { membershipId, pointsDelta: points, reasonCode: "goodwill", note: "test", idempotencyKey: crypto.randomUUID() });
}

describe("Points menu", () => {
  it("lets staff put a menu item on the points menu, and customers see their progress towards it", async () => {
    const { shop, staffCtx, tea, cookie } = await setupShop("menu-list");
    await createReward(staffCtx, { title: "Free Tea", costPoints: 100, productId: tea.id });
    await createReward(staffCtx, { title: "Free Cookie", costPoints: 40, productId: cookie.id });

    const list = await getRewards(shop.tenant.id, { memberBalance: 60 });
    expect(list.map((r) => r.title)).toEqual(["Free Cookie", "Free Tea"]); // cheapest first
    expect(list[1].productName).toBe("Tea");
    expect(list[0].eligible).toBe(true);
    expect(list[1].eligible).toBe(false);
    expect(list[1].pointsShortfall).toBe(40);
  });

  it("spends points on a points-menu reward once, even if the request is sent twice", async () => {
    const { ownerCtx, staffCtx, membershipId, tea } = await setupShop("menu-redeem");
    const reward = await createReward(ownerCtx, { title: "Free Tea", costPoints: 100, productId: tea.id });
    await givePoints(ownerCtx, membershipId, 120);

    const key = crypto.randomUUID();
    const first = await redeemForMember(staffCtx, { membershipId, rewardId: reward.id, idempotencyKey: key });
    expect(first).toMatchObject({ title: "Free Tea", pointsDeducted: 100, newBalance: 20, isDuplicate: false });

    const again = await redeemForMember(staffCtx, { membershipId, rewardId: reward.id, idempotencyKey: key });
    expect(again).toMatchObject({ newBalance: 20, isDuplicate: true });

    const [row] = await db.select().from(rewards).where(eq(rewards.id, reward.id));
    expect(row.quantityRedeemed).toBe(1);
    const [entry] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.id, first.entryId));
    expect(entry).toMatchObject({ type: "redeem", pointsDelta: -100, note: "Free Tea" });

    await expect(
      redeemForMember(staffCtx, { membershipId, rewardId: reward.id, idempotencyKey: crypto.randomUUID() })
    ).rejects.toThrow(/has 20\. They need 80 more/);
  });

  it("lets staff give any menu item for points they choose when it isn't on the points menu", async () => {
    const { ownerCtx, staffCtx, membershipId, cookie } = await setupShop("menu-custom");
    await givePoints(ownerCtx, membershipId, 30);

    const result = await redeemForMember(staffCtx, {
      membershipId,
      productId: cookie.id,
      costPoints: 25,
      note: "Birthday",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(result).toMatchObject({ title: "Free Cookie", pointsDeducted: 25, newBalance: 5 });

    const [entry] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.id, result.entryId));
    expect(entry.note).toBe("Free Cookie — Birthday");
    expect(entry.reasonCode).toBe("staff_choice");

    await expect(
      redeemForMember(staffCtx, { membershipId, costPoints: 1, idempotencyKey: crypto.randomUUID() })
    ).rejects.toThrow(/Pick an item/);
  });

  it("keeps each shop's customers, products and rewards to itself", async () => {
    const a = await setupShop("menu-iso-a");
    const b = await setupShop("menu-iso-b");
    await givePoints(a.ownerCtx, a.membershipId, 50);

    await expect(
      redeemForMember(b.staffCtx, { membershipId: a.membershipId, costPoints: 10, title: "Coffee", idempotencyKey: crypto.randomUUID() })
    ).rejects.toThrow(/Customer not found/);
    await expect(createReward(b.staffCtx, { title: "Free Tea", costPoints: 10, productId: a.tea.id })).rejects.toThrow(/menu item/);

    const customerCtx: RequestContext = { userId: a.ownerCtx.userId, tenantId: a.shop.tenant.id, role: "customer", requestId: "c" };
    await expect(
      redeemForMember(customerCtx, { membershipId: a.membershipId, costPoints: 10, title: "Coffee", idempotencyKey: crypto.randomUUID() })
    ).rejects.toThrow(/FORBIDDEN/);
  });
});
