import { describe, it, expect } from "vitest";
import { registerOwnerAndTenant } from "@/server/services/tenant";
import { joinProgramme } from "@/server/services/member";
import { createReward } from "@/server/services/rewards";
import { requestRedemption } from "@/server/services/ledger";
import { POST as resolveRoute } from "./scan/resolve/route";
import { POST as previewRoute } from "./earn/preview/route";
import { POST as earnRoute } from "./earn/route";
import { POST as validateRoute } from "./redemptions/validate/route";
import { POST as confirmRoute } from "./redemptions/confirm/route";
import { GET as transactionsRoute } from "./transactions/route";
import { NextRequest } from "next/server";
import crypto from "crypto";

describe("Staff Terminal API Endpoints (M5)", () => {
  it("resolves member QR, previews earn, awards points, and validates redemptions", async () => {
    const slug = `staff-biz-${Date.now()}`;
    const business = await registerOwnerAndTenant({
      email: `staff-owner-${Date.now()}@test.com`,
      password: "Password123!",
      name: "Owner Tim",
      businessName: "Tim's Bistro",
      slug,
      programmeType: "points",
    });

    const member = await joinProgramme({
      tenantSlug: slug,
      email: `staff-member-${Date.now()}@test.com`,
      name: "Daisy Johnson",
    });

    const staffToken = business.session.token;

    // 1. Resolve QR Route
    const resolveReq = new NextRequest("http://localhost:3000/api/v1/staff/scan/resolve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
        "x-tenant-id": business.tenant.id,
      },
      body: JSON.stringify({
        token: member.qrToken,
        locationId: business.location.id,
      }),
    });

    const resolveRes = await resolveRoute(resolveReq);
    expect(resolveRes.status).toBe(200);
    const resolveJson = await resolveRes.json();
    expect(resolveJson.data.displayName).toBe("Daisy J.");
    expect(resolveJson.data.balance).toBe(0);

    // 2. Preview Earn Route
    const previewReq = new NextRequest("http://localhost:3000/api/v1/staff/earn/preview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
        "x-tenant-id": business.tenant.id,
      },
      body: JSON.stringify({
        membershipId: member.membership.id,
        locationId: business.location.id,
        amountMinor: 3500, // £35 -> 35 points
      }),
    });

    const previewRes = await previewRoute(previewReq);
    expect(previewRes.status).toBe(200);
    const previewJson = await previewRes.json();
    expect(previewJson.data.pointsToAward).toBe(35);
    expect(previewJson.data.projectedBalance).toBe(35);

    // 3. Earn Points Route
    const earnIdempotencyKey = crypto.randomUUID();
    const earnReq = new NextRequest("http://localhost:3000/api/v1/staff/earn", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
        "x-tenant-id": business.tenant.id,
        "Idempotency-Key": earnIdempotencyKey,
      },
      body: JSON.stringify({
        membershipId: member.membership.id,
        locationId: business.location.id,
        amountMinor: 3500,
      }),
    });

    const earnRes = await earnRoute(earnReq);
    expect(earnRes.status).toBe(200);
    const earnJson = await earnRes.json();
    expect(earnJson.data.pointsDelta).toBe(35);
    expect(earnJson.data.newBalance).toBe(35);

    // 4. Create Reward & Customer Requests Redemption
    const reward = await createReward(
      {
        userId: business.user.id,
        tenantId: business.tenant.id,
        role: "owner",
        requestId: "req-r",
      },
      {
        title: "Free Dessert",
        costPoints: 25,
        type: "free_item",
      }
    );

    const redemptionReq = await requestRedemption(
      {
        userId: member.membership.userId,
        tenantId: business.tenant.id,
        role: "customer",
        requestId: "req-cust",
      },
      {
        membershipId: member.membership.id,
        rewardId: reward.id,
      }
    );

    // 5. Staff Validates Redemption Code Route
    const validateReq = new NextRequest("http://localhost:3000/api/v1/staff/redemptions/validate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
        "x-tenant-id": business.tenant.id,
      },
      body: JSON.stringify({ code: redemptionReq.code }),
    });

    const validateRes = await validateRoute(validateReq);
    expect(validateRes.status).toBe(200);
    const validateJson = await validateRes.json();
    expect(validateJson.data.hasSufficientBalance).toBe(true);
    expect(validateJson.data.reward.title).toBe("Free Dessert");

    // 6. Staff Confirms Redemption Route
    const confirmReq = new NextRequest("http://localhost:3000/api/v1/staff/redemptions/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staffToken}`,
        "x-tenant-id": business.tenant.id,
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        code: redemptionReq.code,
        locationId: business.location.id,
      }),
    });

    const confirmRes = await confirmRoute(confirmReq);
    expect(confirmRes.status).toBe(200);
    const confirmJson = await confirmRes.json();
    expect(confirmJson.data.pointsDeducted).toBe(25);
    expect(confirmJson.data.newBalance).toBe(10); // 35 - 25 = 10

    // 7. Recent Transactions Route
    const txReq = new NextRequest("http://localhost:3000/api/v1/staff/transactions", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${staffToken}`,
        "x-tenant-id": business.tenant.id,
      },
    });

    const txRes = await transactionsRoute(txReq);
    expect(txRes.status).toBe(200);
    const txJson = await txRes.json();
    expect(txJson.data.length).toBeGreaterThanOrEqual(2); // earn + redeem
  });
});
