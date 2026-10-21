import { describe, it, expect } from "vitest";
import { registerOwnerAndTenant } from "./tenant";
import { joinProgramme } from "./member";
import { earn } from "./ledger";
import { submitSupportReport, getSupportReports, resolveSupportReport } from "./support";
import { RequestContext } from "../security/permissions";
import crypto from "crypto";

describe("Support / Dispute Reports Service (A15)", () => {
  it("submits a support report for an earn transaction and resolves it with goodwill points", async () => {
    const slug = `support-tenant-${Date.now()}`;
    const reg = await registerOwnerAndTenant({
      email: `owner-${Date.now()}@support-test.com`,
      password: "Password123!",
      name: "Owner Support",
      businessName: "Dispute Cafe",
      slug,
      programmeType: "points",
    });

    const ctx: RequestContext = {
      userId: reg.user.id,
      tenantId: reg.tenant.id,
      role: "owner",
      requestId: "req-support-1",
    };

    // Join member
    const member = await joinProgramme({
      tenantSlug: slug,
      email: `customer-${Date.now()}@support-test.com`,
      name: "Disputed Customer",
    });

    // Make an earn transaction
    const earnRes = await earn(ctx, {
      membershipId: member.membership.id,
      locationId: reg.location.id,
      amountMinor: 2000,
      idempotencyKey: crypto.randomUUID(),
    });

    expect(earnRes.newBalance).toBe(20);

    // Customer submits support report referencing the ledger entry
    const report = await submitSupportReport({
      tenantId: reg.tenant.id,
      membershipId: member.membership.id,
      ledgerEntryId: earnRes.entryId,
      message: "I spent £25 but only got 20 points recorded. Please check receipt.",
      contactInfo: "customer@support-test.com",
    });

    expect(report.id).toBeDefined();
    expect(report.status).toBe("open");
    expect(report.message).toContain("I spent £25");

    // Owner fetches support reports
    const openReports = await getSupportReports(ctx, { status: "open" });
    expect(openReports.length).toBeGreaterThanOrEqual(1);
    const found = openReports.find((r) => r.id === report.id);
    expect(found).toBeDefined();

    // Owner resolves with 5 goodwill points
    const resolved = await resolveSupportReport(ctx, report.id, {
      issueManualPoints: 5,
      reasonCode: "goodwill",
      note: "Granted missing 5 points from receipt",
    });

    expect(resolved.status).toBe("resolved");
    expect(resolved.resolvedBy).toBe(ctx.userId);
    expect(resolved.resolvedAt).toBeDefined();

    // Verify member balance is now 25 points
    const openAfter = await getSupportReports(ctx, { status: "open" });
    expect(openAfter.find((r) => r.id === report.id)).toBeUndefined();
  });

  it("rejects invalid support report submissions", async () => {
    const slug = `support-invalid-${Date.now()}`;
    const reg = await registerOwnerAndTenant({
      email: `owner-${Date.now()}@support-invalid.com`,
      password: "Password123!",
      name: "Owner Support Invalid",
      businessName: "Invalid Cafe",
      slug,
      programmeType: "points",
    });

    // Empty message
    await expect(
      submitSupportReport({
        tenantId: reg.tenant.id,
        message: "   ",
      })
    ).rejects.toThrow("Support message cannot be empty");

    // Fake ledger entry
    await expect(
      submitSupportReport({
        tenantId: reg.tenant.id,
        ledgerEntryId: crypto.randomUUID(),
        message: "Where are my points?",
      })
    ).rejects.toThrow("Referenced transaction not found for this tenant");
  });

  it("enforces tenant isolation on support reports", async () => {
    const slugA = `tenant-a-${Date.now()}`;
    const tenantA = await registerOwnerAndTenant({
      email: `ownerA-${Date.now()}@tenant-a.com`,
      password: "Password123!",
      name: "Owner A",
      businessName: "Tenant A Cafe",
      slug: slugA,
    });

    const slugB = `tenant-b-${Date.now()}`;
    const tenantB = await registerOwnerAndTenant({
      email: `ownerB-${Date.now()}@tenant-b.com`,
      password: "Password123!",
      name: "Owner B",
      businessName: "Tenant B Cafe",
      slug: slugB,
    });

    const ctxA: RequestContext = {
      userId: tenantA.user.id,
      tenantId: tenantA.tenant.id,
      role: "owner",
      requestId: "req-support-a",
    };

    const ctxB: RequestContext = {
      userId: tenantB.user.id,
      tenantId: tenantB.tenant.id,
      role: "owner",
      requestId: "req-support-b",
    };

    const reportA = await submitSupportReport({
      tenantId: tenantA.tenant.id,
      message: "Secret dispute for Tenant A",
    });

    // Tenant A sees own report
    const reportsA = await getSupportReports(ctxA);
    expect(reportsA.find((r) => r.id === reportA.id)).toBeDefined();

    // Tenant B cannot see Tenant A's reports
    const reportsB = await getSupportReports(ctxB);
    expect(reportsB.find((r) => r.id === reportA.id)).toBeUndefined();

    // Tenant B cannot resolve Tenant A's report
    await expect(resolveSupportReport(ctxB, reportA.id)).rejects.toThrow(
      "Support report not found"
    );
  });
});
