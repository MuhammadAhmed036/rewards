import { describe, it, expect } from "vitest";
import { registerOwnerAndTenant } from "./tenant";
import { joinProgramme, resolveMemberQrForStaff, revokeMemberQr } from "./member";
import { RequestContext } from "../security/permissions";
import { db } from "../db";
import { consentRecords } from "../db/schema";
import { eq } from "drizzle-orm";

describe("Customer Membership & Staff QR Scan (M3)", () => {
  it("allows customer to join programme, generates QR token and consent records", async () => {
    const slug = `coffee-club-${Date.now()}`;
    const business = await registerOwnerAndTenant({
      email: `coffee-${Date.now()}@test.com`,
      password: "Password123!",
      name: "Barista Dave",
      businessName: "Dave's Artisan Coffee",
      slug,
      programmeType: "stamps",
    });

    const custEmail = `alice-${Date.now()}@example.com`;
    const joinResult = await joinProgramme({
      tenantSlug: slug,
      email: custEmail,
      name: "Alice Smith",
      marketingOptIn: true,
      termsVersion: "1.0",
    });

    expect(joinResult.membership.id).toBeDefined();
    expect(joinResult.membership.memberNumber.length).toBe(8);
    expect(joinResult.balance).toBe(0);
    expect(joinResult.qrToken).toMatch(/^LP1\.mem_/);
    expect(joinResult.qrDataUrl).toMatch(/^data:image\/png;base64,/);

    // Verify Consent Records
    const consents = await db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.membershipId, joinResult.membership.id));

    expect(consents.length).toBe(2);
    const termsConsent = consents.find((c) => c.purpose === "programme_terms");
    const mktConsent = consents.find((c) => c.purpose === "marketing_email");
    expect(termsConsent?.granted).toBe(true);
    expect(mktConsent?.granted).toBe(true);

    // Staff resolves customer QR
    const staffCtx: RequestContext = {
      userId: business.user.id,
      tenantId: business.tenant.id,
      role: "owner",
      requestId: "req-scan-1",
    };

    const scanSummary = await resolveMemberQrForStaff(staffCtx, joinResult.qrToken);
    expect(scanSummary.membershipId).toBe(joinResult.membership.id);
    expect(scanSummary.displayName).toBe("Alice S.");
    expect(scanSummary.balance).toBe(0);
  });

  it("strictly rejects Member QR from Tenant A scanned at Tenant B", async () => {
    const suffix = Date.now();
    const tenantA = await registerOwnerAndTenant({
      email: `tenant-a-${suffix}@test.com`,
      password: "Password123!",
      name: "Owner A",
      businessName: "Salon A",
      slug: `salon-a-${suffix}`,
    });

    const tenantB = await registerOwnerAndTenant({
      email: `tenant-b-${suffix}@test.com`,
      password: "Password123!",
      name: "Owner B",
      businessName: "Salon B",
      slug: `salon-b-${suffix}`,
    });

    // Customer joins Tenant A
    const joinA = await joinProgramme({
      tenantSlug: tenantA.tenant.slug,
      email: `customer-${suffix}@example.com`,
      name: "Bob Roberts",
    });

    // Staff from Tenant B tries to scan Tenant A's customer QR
    const staffBCtx: RequestContext = {
      userId: tenantB.user.id,
      tenantId: tenantB.tenant.id,
      role: "owner",
      requestId: "req-cross-scan",
    };

    await expect(
      resolveMemberQrForStaff(staffBCtx, joinA.qrToken)
    ).rejects.toThrow("Not a member of this business");
  });

  it("revoking QR code increments version and renders old QR invalid", async () => {
    const slug = `fitness-${Date.now()}`;
    const business = await registerOwnerAndTenant({
      email: `gym-${Date.now()}@test.com`,
      password: "Password123!",
      name: "Gym Owner",
      businessName: "Prime Fitness",
      slug,
    });

    const member = await joinProgramme({
      tenantSlug: slug,
      email: `gym-member-${Date.now()}@example.com`,
      name: "Charlie Brown",
    });

    const initialToken = member.qrToken;

    const staffCtx: RequestContext = {
      userId: business.user.id,
      tenantId: business.tenant.id,
      role: "owner",
      requestId: "req-revoke-test",
    };

    // Valid initially
    const initialResolve = await resolveMemberQrForStaff(staffCtx, initialToken);
    expect(initialResolve.displayName).toBe("Charlie B.");

    // Revoke QR
    const revoked = await revokeMemberQr(staffCtx, member.membership.id);
    expect(revoked.membership.qrVersion).toBe(2);

    // Old token must fail
    await expect(
      resolveMemberQrForStaff(staffCtx, initialToken)
    ).rejects.toThrow(/revoked/i);

    // New token must succeed
    const newResolve = await resolveMemberQrForStaff(staffCtx, revoked.qrToken);
    expect(newResolve.displayName).toBe("Charlie B.");
  });

  it("rejects duplicate email during customer join if account already exists", async () => {
    const slug = `dup-email-${Date.now()}`;
    const ownerEmail = `owner-${Date.now()}@coffee.com`;
    await registerOwnerAndTenant({
      email: ownerEmail,
      password: "Password123!",
      name: "Owner John",
      businessName: "Duplicate Test Coffee",
      slug,
    });

    // Attempting to join as customer with owner's email must fail
    await expect(
      joinProgramme({
        tenantSlug: slug,
        email: ownerEmail,
        name: "Impersonator",
      })
    ).rejects.toThrow(/already exists/i);
  });
});

