import { describe, it, expect } from "vitest";
import { registerOwnerAndTenant } from "@/server/services/tenant";
import { joinProgramme } from "@/server/services/member";
import { earn, requestRedemption } from "@/server/services/ledger";
import { createReward } from "@/server/services/rewards";
import { createSession } from "@/server/auth";
import { db } from "@/server/db";
import { users, sessions, ledgerEntries, memberships } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { GET as tenantsGetRoute } from "./tenants/route";
import { GET as tenantDetailRoute, PATCH as tenantPatchRoute } from "./tenants/[tenantId]/route";
import { GET as healthRoute } from "./health/route";
import { GET as auditRoute } from "./audit/route";

describe("Platform Admin Console & Tenant Suspension (M8)", () => {
  it("allows platform admins to list, inspect, and suspend tenants; suspended tenant cannot earn or redeem; records are retained", async () => {
    // 1. Create a Platform Admin user
    const [adminUser] = await db
      .insert(users)
      .values({
        email: `platform-admin-${Date.now()}@platform.com`,
        name: "Super Admin",
        isPlatformAdmin: true,
      })
      .returning();

    const adminSession = await createSession(adminUser.id);
    const adminToken = adminSession.token;

    // 2. Register a business tenant
    const slug = `admin-test-biz-${Date.now()}`;
    const business = await registerOwnerAndTenant({
      email: `biz-owner-${Date.now()}@test.com`,
      password: "Password123!",
      name: "Owner Bob",
      businessName: "Bob's Garage",
      slug,
      programmeType: "points",
    });

    const tenantId = business.tenant.id;
    const locationId = business.location.id;
    const ownerToken = business.session.token;

    // 3. Customer joins programme
    const member = await joinProgramme({
      tenantSlug: slug,
      email: `customer-${Date.now()}@test.com`,
      name: "Alice Springs",
    });

    const staffCtx = {
      userId: business.user.id,
      tenantId,
      locationId,
      role: "owner" as const,
      requestId: "req-staff-1",
    };

    // Customer earns 50 points while active
    const earn1 = await earn(staffCtx, {
      membershipId: member.membership.id,
      locationId,
      amountMinor: 5000,
      tipMinor: 0,
      idempotencyKey: `earn-active-${Date.now()}`,
    });
    expect(earn1.pointsDelta).toBe(50);

    const reward = await createReward(staffCtx, {
      type: "free_item",
      title: "Free Oil Top-up",
      costPoints: 20,
    });

    // 4. Platform Admin tests: Listing tenants
    const listReq = new NextRequest("http://localhost:3000/api/v1/admin/tenants?q=Garage", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const listRes = await tenantsGetRoute(listReq);
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json();
    expect(listJson.data.tenants.length).toBeGreaterThanOrEqual(1);

    // Platform Admin inspects tenant detail
    const detailReq = new NextRequest(
      `http://localhost:3000/api/v1/admin/tenants/${tenantId}?reason=Audit+Inspection`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    const detailRes = await tenantDetailRoute(detailReq, {
      params: Promise.resolve({ tenantId }),
    });
    expect(detailRes.status).toBe(200);
    const detailJson = await detailRes.json();
    expect(detailJson.data.tenant.id).toBe(tenantId);
    expect(detailJson.data.stats.memberCount).toBe(1);

    // Platform Admin system health check
    const healthReq = new NextRequest("http://localhost:3000/api/v1/admin/health", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const healthRes = await healthRoute(healthReq);
    expect(healthRes.status).toBe(200);
    const healthJson = await healthRes.json();
    expect(healthJson.data.database.status).toBe("healthy");
    expect(healthJson.data.tenants.total).toBeGreaterThanOrEqual(1);

    // 5. Non-admin attempting admin endpoint is rejected (403)
    const unauthorizedReq = new NextRequest("http://localhost:3000/api/v1/admin/tenants", {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const unauthorizedRes = await tenantsGetRoute(unauthorizedReq);
    expect(unauthorizedRes.status).toBe(403);

    // 6. Suspend the Tenant with audited reason
    const suspendReq = new NextRequest(`http://localhost:3000/api/v1/admin/tenants/${tenantId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: "suspended",
        reason: "Terms of service investigation regarding fraudulent points",
      }),
    });
    const suspendRes = await tenantPatchRoute(suspendReq, {
      params: Promise.resolve({ tenantId }),
    });
    expect(suspendRes.status).toBe(200);
    const suspendJson = await suspendRes.json();
    expect(suspendJson.data.status).toBe("suspended");

    // 7. Verify session invalidation for staff of suspended tenant
    const [staffSessionAfter] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, ownerToken));
    expect(staffSessionAfter).toBeUndefined();

    // 8. Verify suspended tenant CANNOT earn points
    await expect(
      earn(staffCtx, {
        membershipId: member.membership.id,
        locationId,
        amountMinor: 2000,
        tipMinor: 0,
        idempotencyKey: `earn-suspended-${Date.now()}`,
      })
    ).rejects.toThrow(/TENANT_SUSPENDED/);

    // 9. Verify suspended tenant CANNOT redeem points
    await expect(
      requestRedemption(
        {
          userId: member.membership.userId,
          tenantId,
          role: "customer" as const,
          requestId: "req-cust-suspended",
        },
        {
          membershipId: member.membership.id,
          rewardId: reward.id,
        }
      )
    ).rejects.toThrow(/TENANT_SUSPENDED/);

    // 10. Verify historical records are retained (ledger entries & memberships intact)
    const storedLedgers = await db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.tenantId, tenantId));
    expect(storedLedgers.length).toBeGreaterThanOrEqual(1);

    const storedMemberships = await db
      .select()
      .from(memberships)
      .where(eq(memberships.tenantId, tenantId));
    expect(storedMemberships.length).toBe(1);

    // 11. Reactivate the tenant
    const reactivateReq = new NextRequest(`http://localhost:3000/api/v1/admin/tenants/${tenantId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: "active",
        reason: "Investigation completed and verified legitimate",
      }),
    });
    const reactivateRes = await tenantPatchRoute(reactivateReq, {
      params: Promise.resolve({ tenantId }),
    });
    expect(reactivateRes.status).toBe(200);

    // 12. Verify earn succeeds again after reactivation
    const earnAfterReactivation = await earn(staffCtx, {
      membershipId: member.membership.id,
      locationId,
      amountMinor: 3000,
      tipMinor: 0,
      idempotencyKey: `earn-reactivated-${Date.now()}`,
      managerOverrideReason: "Reactivation verified",
    });
    expect(earnAfterReactivation.pointsDelta).toBe(30);

    // 13. Verify global audit log shows suspension & reactivation
    const auditReq = new NextRequest(
      `http://localhost:3000/api/v1/admin/audit?tenantId=${tenantId}`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    const auditRes = await auditRoute(auditReq);
    expect(auditRes.status).toBe(200);
    const auditJson = await auditRes.json();
    const actions = auditJson.data.map((a: { action: string }) => a.action);
    expect(actions).toContain("tenant.suspended");
    expect(actions).toContain("tenant.reactivated");
  });
});
