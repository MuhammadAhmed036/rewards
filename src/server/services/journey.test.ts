import "dotenv/config";
import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { ledgerEntries, membershipBalances } from "../db/schema";
import { registerOwnerAndTenant } from "./tenant";
import { joinProgramme, resolveMemberQrForStaff } from "./member";
import { createReward } from "./rewards";
import { setProgrammeStatus } from "./programme";
import { earn, previewEarn, requestRedemption, validateRedemptionCode, confirmRedemption, reconcileBalances } from "./ledger";
import { RequestContext } from "../security/permissions";

/**
 * The whole loop the spec's MVP acceptance list describes (section 15), in one run:
 * join -> staff scans the member QR -> earn -> a retry doesn't double up -> unlock a reward
 * -> redeem with a one-time code -> history and balance agree.
 */
describe("Customer journey: join, earn, redeem, history (MVP acceptance)", () => {
  it("runs the full loop with no double credit and a ledger that reconciles", async () => {
    const stamp = `journey-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const shop = await registerOwnerAndTenant({
      email: `owner-${stamp}@journey.test`,
      password: "Password123!",
      name: "Journey Owner",
      businessName: `Journey ${stamp}`,
      slug: stamp,
      emailVerified: true,
    });
    const staff: RequestContext = { userId: shop.user.id, tenantId: shop.tenant.id, role: "owner", requestId: "journey" };
    await setProgrammeStatus(staff, "published").catch(() => undefined);
    const reward = await createReward(staff, { title: "Free coffee", type: "free_item", costPoints: 8, locationIds: [] });

    // 1. A customer joins and gets a QR
    const joined = await joinProgramme({ tenantSlug: stamp, email: `cust-${stamp}@journey.test`, name: "Jo Customer" });
    expect(joined.qrToken).toBeTruthy();
    const customer: RequestContext = { userId: joined.membership.userId, tenantId: shop.tenant.id, role: "customer", requestId: "journey-c" };

    // 2. Staff scan the QR; they see a name cue, not the full email
    const scanned = await resolveMemberQrForStaff(staff, joined.qrToken, shop.location.id);
    expect(scanned.membershipId).toBe(joined.membership.id);
    expect(scanned.displayName).toBe("Jo C.");
    expect(JSON.stringify(scanned)).not.toContain("@journey.test");

    // 3. Staff preview the award, then confirm it; retrying the same request gives no second credit
    const preview = await previewEarn(staff, { membershipId: joined.membership.id, locationId: shop.location.id, amountMinor: 1000 });
    expect(JSON.stringify(preview)).toContain("10");
    const key = crypto.randomUUID();
    const first = await earn(staff, { membershipId: joined.membership.id, locationId: shop.location.id, amountMinor: 1000, idempotencyKey: key });
    const retry = await earn(staff, { membershipId: joined.membership.id, locationId: shop.location.id, amountMinor: 1000, idempotencyKey: key });
    expect(first.pointsDelta).toBe(10);
    expect(retry.isDuplicate).toBe(true);
    expect(retry.newBalance).toBe(10);

    // 4. The customer asks for the reward; the staff validate and confirm the one-time code
    const request = await requestRedemption(customer, { membershipId: joined.membership.id, rewardId: reward.id });
    const checked = await validateRedemptionCode(staff, request.code);
    expect(JSON.stringify(checked)).toContain("Free coffee");
    const done = await confirmRedemption(staff, { code: request.code, locationId: shop.location.id, idempotencyKey: crypto.randomUUID() });
    expect(done.pointsDeducted).toBe(8);

    // 5. Using the same code again fails clearly
    await expect(
      confirmRedemption(staff, { code: request.code, locationId: shop.location.id, idempotencyKey: crypto.randomUUID() })
    ).rejects.toThrow();

    // 6. History and balance agree, and the reconcile job finds nothing to fix
    const entries = await db
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.tenantId, shop.tenant.id), eq(ledgerEntries.membershipId, joined.membership.id)));
    expect(entries.filter((e) => e.type === "earn")).toHaveLength(1);
    const total = entries.reduce((sum, e) => sum + e.pointsDelta, 0);
    const [balance] = await db.select().from(membershipBalances).where(eq(membershipBalances.membershipId, joined.membership.id));
    expect(balance.balance).toBe(2);
    expect(total).toBe(balance.balance);
    const report = await reconcileBalances(shop.tenant.id);
    expect(report.isConsistent).toBe(true);
    expect(report.reconciledCount).toBeGreaterThan(0);
  });
});
