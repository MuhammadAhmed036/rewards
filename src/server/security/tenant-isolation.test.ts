import { describe, it, expect } from "vitest";
import { registerOwnerAndTenant } from "../services/tenant";
import { getSessionContext, verifyPassword } from "../auth";
import { can } from "./permissions";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

describe("Tenant Isolation & Authentication (M1)", () => {
  it("registers owner, creates tenant, primary location, and authenticates", async () => {
    const slug = `barber-${Date.now()}`;
    const result = await registerOwnerAndTenant({
      email: `owner-${Date.now()}@example.com`,
      password: "SuperSecretPassword123!",
      name: "Jack Barber",
      businessName: "Jack's Barbershop",
      slug,
      programmeType: "points",
    });

    expect(result.tenant.id).toBeDefined();
    expect(result.tenant.slug).toBe(slug);
    expect(result.location.name).toBe("Main Location");
    expect(result.programme.type).toBe("points");
    expect(result.session.token).toBeDefined();

    // Verify session context
    const ctx = await getSessionContext(result.session.token, result.tenant.id);
    expect(ctx).not.toBeNull();
    expect(ctx?.role).toBe("owner");
    expect(ctx?.tenantId).toBe(result.tenant.id);
  });

  it("enforces cross-tenant isolation between two tenants", async () => {
    const suffix = Date.now();
    const tenantA = await registerOwnerAndTenant({
      email: `owner-a-${suffix}@test.com`,
      password: "Password123!",
      name: "Owner A",
      businessName: "Business A",
      slug: `biz-a-${suffix}`,
      programmeType: "points",
    });

    const tenantB = await registerOwnerAndTenant({
      email: `owner-b-${suffix}@test.com`,
      password: "Password123!",
      name: "Owner B",
      businessName: "Business B",
      slug: `biz-b-${suffix}`,
      programmeType: "stamps",
    });

    const ctxA = await getSessionContext(tenantA.session.token, tenantA.tenant.id);
    const ctxB = await getSessionContext(tenantB.session.token, tenantB.tenant.id);

    expect(ctxA?.tenantId).toBe(tenantA.tenant.id);
    expect(ctxB?.tenantId).toBe(tenantB.tenant.id);

    // Context A attempting action on Tenant B resource is strictly denied
    expect(can(ctxA!, "tenant.manage", { tenantId: tenantB.tenant.id })).toBe(false);
    expect(can(ctxA!, "member.read", { tenantId: tenantB.tenant.id })).toBe(false);
    expect(can(ctxA!, "ledger.earn", { tenantId: tenantB.tenant.id })).toBe(false);

    // Context B attempting action on Tenant A resource is strictly denied
    expect(can(ctxB!, "tenant.manage", { tenantId: tenantA.tenant.id })).toBe(false);
    expect(can(ctxB!, "member.read", { tenantId: tenantA.tenant.id })).toBe(false);
  });

  it("verifies password checking and rejection of invalid credentials", async () => {
    const pass = "StrongPassword456!";
    const slug = `bakery-${Date.now()}`;
    const result = await registerOwnerAndTenant({
      email: `baker-${Date.now()}@test.com`,
      password: pass,
      name: "Baker",
      businessName: "Artisan Bakery",
      slug,
    });

    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.id, result.user.id));
    expect(userRows.length).toBe(1);

    // Verify correct password
    const valid = await verifyPassword(pass, userRows[0].passwordHash!);
    expect(valid).toBe(true);

    // Verify wrong password rejects
    const invalid = await verifyPassword("WrongPassword!", userRows[0].passwordHash!);
    expect(invalid).toBe(false);
  });
});
