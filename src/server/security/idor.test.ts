import { describe, it, expect } from "vitest";
import { registerOwnerAndTenant } from "../services/tenant";
import { joinProgramme } from "../services/member";
import { earn } from "../services/ledger";
import { createReward, updateReward } from "../services/rewards";
import { getFeedbackMessages } from "../services/feedback";
import { getSupportReports, resolveSupportReport, submitSupportReport } from "../services/support";
import { RequestContext } from "./permissions";
import { db } from "../db";
import { ledgerEntries } from "../db/schema";
import { sql } from "drizzle-orm";
import crypto from "crypto";

describe("IDOR Prevention & Multi-Tenant Boundaries (Section D)", () => {
  it("strictly prevents Tenant A from reading, modifying, or acting upon Tenant B's resources", async () => {
    const suffix = Date.now();

    // Setup Tenant A
    const tenantA = await registerOwnerAndTenant({
      email: `owner-a-${suffix}@idor-test.com`,
      password: "Password123!",
      name: "Owner A",
      businessName: "Alpha Cafe",
      slug: `alpha-${suffix}`,
    });

    const ctxA: RequestContext = {
      userId: tenantA.user.id,
      tenantId: tenantA.tenant.id,
      role: "owner",
      requestId: "req-idor-a",
    };

    // Setup Tenant B
    const tenantB = await registerOwnerAndTenant({
      email: `owner-b-${suffix}@idor-test.com`,
      password: "Password123!",
      name: "Owner B",
      businessName: "Beta Bistro",
      slug: `beta-${suffix}`,
    });

    const ctxB: RequestContext = {
      userId: tenantB.user.id,
      tenantId: tenantB.tenant.id,
      role: "owner",
      requestId: "req-idor-b",
    };

    // Member and Reward in Tenant B
    const memberB = await joinProgramme({
      tenantSlug: tenantB.tenant.slug,
      email: `customer-b-${suffix}@test.com`,
      name: "Beta Customer",
    });

    const rewardB = await createReward(ctxB, {
      title: "Free Beta Croissant",
      costPoints: 20,
    });

    // 1. Tenant A tries to earn points on Tenant B's member -> Rejected (member belongs to Tenant B)
    await expect(
      earn(ctxA, {
        membershipId: memberB.membership.id,
        locationId: tenantA.location.id,
        amountMinor: 1000,
        idempotencyKey: crypto.randomUUID(),
      })
    ).rejects.toThrow();

    // 2. Tenant A tries to update Tenant B's reward -> Rejected
    await expect(
      updateReward(ctxA, rewardB.id, {
        title: "Hacked Reward",
        costPoints: 1,
      })
    ).rejects.toThrow(/Reward not found/);

    // 3. Tenant A tries to read Tenant B's feedback messages -> Returns only Tenant A feedback (empty)
    const feedbackA = await getFeedbackMessages(ctxA);
    expect(feedbackA).toEqual([]);

    // 4. Tenant A tries to resolve Tenant B's support dispute -> Rejected
    const supportB = await submitSupportReport({
      tenantId: tenantB.tenant.id,
      message: "Dispute for Tenant B",
    });

    await expect(
      resolveSupportReport(ctxA, supportB.id, { note: "Unauthorized resolution" })
    ).rejects.toThrow(/Support report not found/);

    // 5. Tenant A cannot see Tenant B's support disputes
    const disputesA = await getSupportReports(ctxA);
    expect(disputesA.find((d) => d.id === supportB.id)).toBeUndefined();
  });

  it("enforces Row Level Security (RLS) on ledger_entries at database level", async () => {
    const suffix = Date.now();

    const tenantA = await registerOwnerAndTenant({
      email: `rls-a-${suffix}@test.com`,
      password: "Password123!",
      name: "RLS A",
      businessName: "RLS A Cafe",
      slug: `rls-a-${suffix}`,
    });

    const tenantB = await registerOwnerAndTenant({
      email: `rls-b-${suffix}@test.com`,
      password: "Password123!",
      name: "RLS B",
      businessName: "RLS B Cafe",
      slug: `rls-b-${suffix}`,
    });

    const memberA = await joinProgramme({
      tenantSlug: tenantA.tenant.slug,
      email: `rls-member-a-${suffix}@test.com`,
    });

    const memberB = await joinProgramme({
      tenantSlug: tenantB.tenant.slug,
      email: `rls-member-b-${suffix}@test.com`,
    });

    const ctxA: RequestContext = {
      userId: tenantA.user.id,
      tenantId: tenantA.tenant.id,
      role: "owner",
      requestId: `req-rls-a`,
    };

    const ctxB: RequestContext = {
      userId: tenantB.user.id,
      tenantId: tenantB.tenant.id,
      role: "owner",
      requestId: `req-rls-b`,
    };

    await earn(ctxA, {
      membershipId: memberA.membership.id,
      locationId: tenantA.location.id,
      amountMinor: 2500,
      idempotencyKey: crypto.randomUUID(),
    });

    await earn(ctxB, {
      membershipId: memberB.membership.id,
      locationId: tenantB.location.id,
      amountMinor: 3500,
      idempotencyKey: crypto.randomUUID(),
    });

    // In a transaction with Tenant A context:
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE loyalty_rls_user`);
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantA.tenant.id}, true)`);
      await tx.execute(sql`SELECT set_config('app.is_platform_admin', 'false', true)`);

      const visible = await tx.select().from(ledgerEntries);
      // All rows visible must belong strictly to Tenant A
      expect(visible.length).toBeGreaterThanOrEqual(1);
      for (const row of visible) {
        expect(row.tenantId).toBe(tenantA.tenant.id);
      }
    });

    // In a transaction with no tenant context and not platform admin:
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE loyalty_rls_user`);
      await tx.execute(sql`SELECT set_config('app.tenant_id', '', true)`);
      await tx.execute(sql`SELECT set_config('app.is_platform_admin', 'false', true)`);

      const visible = await tx.select().from(ledgerEntries);
      // Zero rows should be visible when tenant is unassigned and not admin
      expect(visible.length).toBe(0);
    });
  });
});
