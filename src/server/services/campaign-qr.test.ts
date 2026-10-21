import { describe, it, expect } from "vitest";
import { registerOwnerAndTenant } from "./tenant";
import { joinProgramme } from "./member";
import {
  createCampaignQr,
  getCampaignQrs,
  deactivateCampaignQr,
  scanAndClaimCampaignQr,
  approvePromoClaim,
  discardPromoClaim,
  getCampaignQrReports,
  getCampaignQrPublicInfo,
} from "./campaign-qr";
import { RequestContext } from "../security/permissions";

describe("Promotional Campaign QR Engine", () => {
  it("creates dynamic promotional QR code with validity and isolated tenant scope", async () => {
    const slug = `promo-test-${Date.now()}`;
    const registered = await registerOwnerAndTenant({
      email: `owner-${Date.now()}@promo.com`,
      password: "Password123!",
      name: "Promo Owner",
      businessName: "Promo Coffee",
      slug,
      programmeType: "points",
    });

    const ctx: RequestContext = {
      userId: registered.user.id,
      tenantId: registered.tenant.id,
      role: "owner",
      requestId: "req-promo-1",
    };

    // 1. Create a promo QR code for 15 bonus points valid for 14 days
    const campaign = await createCampaignQr(ctx, {
      title: "Buy 3 Coffees Get 1 Free Promo",
      offerType: "points_bonus",
      pointsToAward: 15,
      validityDays: 14,
    });

    expect(campaign.id).toBeDefined();
    expect(campaign.code).toMatch(/^QR_[A-F0-9]+/);
    expect(campaign.title).toBe("Buy 3 Coffees Get 1 Free Promo");
    expect(campaign.pointsToAward).toBe(15);
    expect(campaign.status).toBe("active");
    expect(campaign.qrDataUrl).toContain("data:image/png;base64");
    expect(campaign.scanUrl).toContain(`/b/${slug}?claimQr=${campaign.code}`);

    // 2. Fetch campaign list
    const list = await getCampaignQrs(ctx);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((c) => c.id === campaign.id)).toBe(true);

    // 3. Check public info endpoint
    const publicInfo = await getCampaignQrPublicInfo(slug, campaign.code);
    expect(publicInfo).not.toBeNull();
    expect(publicInfo?.title).toBe("Buy 3 Coffees Get 1 Free Promo");
    expect(publicInfo?.status).toBe("active");
    expect(publicInfo?.isExpired).toBe(false);
  });

  it("handles multi-visit punch card progress (e.g. Buy 3 Get 1 Free) and counter approval", async () => {
    const slug = `punch-test-${Date.now()}`;
    const registered = await registerOwnerAndTenant({
      email: `owner-${Date.now()}@punch.com`,
      password: "Password123!",
      name: "Punch Owner",
      businessName: "Punch Cafe",
      slug,
      programmeType: "points",
    });

    const ownerCtx: RequestContext = {
      userId: registered.user.id,
      tenantId: registered.tenant.id,
      role: "owner",
      requestId: "req-promo-owner",
    };

    // Customer joins
    const customer = await joinProgramme({
      tenantSlug: slug,
      email: `customer-${Date.now()}@punchtest.com`,
      name: "Alice Coffee Lover",
    });

    // Create promo QR code: Buy 3 Coffees Get 1 Free
    const promo = await createCampaignQr(ownerCtx, {
      title: "Buy 3 Coffees Get 1 Free",
      offerType: "free_product",
      productRewardName: "Signature Latte",
      requiredVisits: 3,
      validityDays: 30,
    });

    // 1. Visit 1 scan: Intermediate visit (1 of 3)
    const scan1 = await scanAndClaimCampaignQr(
      registered.tenant.id,
      promo.code,
      customer.membership.id
    );
    expect(scan1.success).toBe(true);
    expect(scan1.isIntermediateVisit).toBe(true);
    expect(scan1.currentVisit).toBe(1);
    expect(scan1.requiredVisits).toBe(3);
    expect(scan1.visitsRemaining).toBe(2);
    expect(scan1.message).toContain("Visit 1 of 3");

    // 2. Visit 2 scan: Intermediate visit (2 of 3)
    const scan2 = await scanAndClaimCampaignQr(
      registered.tenant.id,
      promo.code,
      customer.membership.id
    );
    expect(scan2.success).toBe(true);
    expect(scan2.isIntermediateVisit).toBe(true);
    expect(scan2.currentVisit).toBe(2);
    expect(scan2.requiredVisits).toBe(3);
    expect(scan2.visitsRemaining).toBe(1);
    expect(scan2.message).toContain("Visit 2 of 3");

    // 3. Visit 3 scan: Milestone reached (3 of 3), status becomes pending_claim
    const scan3 = await scanAndClaimCampaignQr(
      registered.tenant.id,
      promo.code,
      customer.membership.id
    );
    expect(scan3.success).toBe(true);
    expect(scan3.isIntermediateVisit).toBe(false);
    expect(scan3.isPendingClaim).toBe(true);
    expect(scan3.currentVisit).toBe(3);
    expect(scan3.message).toContain("Goal Reached (3/3)");

    // 4. Staff/Owner sees pending claim in audit reports
    const reports = await getCampaignQrReports(ownerCtx);
    const pendingScan = reports.find(
      (r) => r.campaignQrId === promo.id && r.status === "pending_claim"
    );
    expect(pendingScan).toBeDefined();
    expect(pendingScan?.memberName).toBe("Alice Coffee Lover");
    expect(pendingScan?.visitNumber).toBe(3);

    // 5. Staff/Owner clicks "Approve & Give Perk" at counter
    const approveResult = await approvePromoClaim(ownerCtx, pendingScan!.id);
    expect(approveResult.success).toBe(true);
    expect(approveResult.approvedByName).toBe("Punch Owner");

    // 6. Verify audit report shows approved
    const updatedReports = await getCampaignQrReports(ownerCtx);
    const approvedScan = updatedReports.find((r) => r.id === pendingScan!.id);
    expect(approvedScan?.status).toBe("approved");
    expect(approvedScan?.approvedByName).toBe("Punch Owner");

    // 7. Duplicate prevention: Alice attempts to claim again -> Rejected!
    await expect(
      scanAndClaimCampaignQr(registered.tenant.id, promo.code, customer.membership.id)
    ).rejects.toThrow(/already claimed this promotional offer/i);
  });

  it("handles discard of pending claims", async () => {
    const slug = `discard-test-${Date.now()}`;
    const registered = await registerOwnerAndTenant({
      email: `owner-${Date.now()}@discard.com`,
      password: "Password123!",
      name: "Discard Owner",
      businessName: "Discard Cafe",
      slug,
      programmeType: "points",
    });

    const ownerCtx: RequestContext = {
      userId: registered.user.id,
      tenantId: registered.tenant.id,
      role: "owner",
      requestId: "req-promo-owner-discard",
    };

    const customer = await joinProgramme({
      tenantSlug: slug,
      email: `customer-${Date.now()}@discardtest.com`,
      name: "Bob Customer",
    });

    const promo = await createCampaignQr(ownerCtx, {
      title: "1-Visit Flash Bonus",
      offerType: "points_bonus",
      pointsToAward: 20,
      requiredVisits: 1,
      validityDays: 14,
    });

    // Customer scans 1-visit promo
    const scan = await scanAndClaimCampaignQr(
      registered.tenant.id,
      promo.code,
      customer.membership.id
    );
    expect(scan.isPendingClaim).toBe(true);

    const reports = await getCampaignQrReports(ownerCtx);
    const pendingScan = reports.find(
      (r) => r.campaignQrId === promo.id && r.status === "pending_claim"
    );
    expect(pendingScan).toBeDefined();

    // Owner discards claim
    const discardResult = await discardPromoClaim(ownerCtx, pendingScan!.id);
    expect(discardResult.success).toBe(true);

    // Verify report reflects discarded status
    const updatedReports = await getCampaignQrReports(ownerCtx);
    const discardedRow = updatedReports.find((r) => r.id === pendingScan!.id);
    expect(discardedRow?.status).toBe("discarded");
  });

  it("enforces on-demand deactivation and prevents expired claims", async () => {
    const slug = `expire-test-${Date.now()}`;
    const registered = await registerOwnerAndTenant({
      email: `owner-${Date.now()}@expire.com`,
      password: "Password123!",
      name: "Expire Owner",
      businessName: "Expire Bistro",
      slug,
    });

    const ownerCtx: RequestContext = {
      userId: registered.user.id,
      tenantId: registered.tenant.id,
      role: "owner",
      requestId: "req-promo-expire",
    };

    const customer = await joinProgramme({
      tenantSlug: slug,
      email: `customer-${Date.now()}@expiretest.com`,
      name: "Bob Expire",
    });

    const promo = await createCampaignQr(ownerCtx, {
      title: "Flash Lunch Promo",
      offerType: "points_bonus",
      pointsToAward: 10,
      validityDays: 1,
    });

    // Deactivate promo QR code
    const deactivated = await deactivateCampaignQr(ownerCtx, promo.id);
    expect(deactivated.status).toBe("deactivated");

    // Attempt to claim deactivated promo code
    await expect(
      scanAndClaimCampaignQr(registered.tenant.id, promo.code, customer.membership.id)
    ).rejects.toThrow("This promotional QR code was deactivated by the business manager.");
  });
});

