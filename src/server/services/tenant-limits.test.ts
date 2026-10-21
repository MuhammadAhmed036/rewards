import { describe, it, expect } from "vitest";
import { registerOwnerAndTenant, createLocation } from "./tenant";
import { addStaffMember } from "./staff";
import { createReward } from "./rewards";
import { db } from "../db";
import { tenants } from "../db/schema";
import { eq } from "drizzle-orm";
import { RequestContext } from "../security/permissions";

describe("Tenant Tier Limits (A18 / FR-011)", () => {
  it("enforces maxLocations limit", async () => {
    const slug = `limit-loc-${Date.now()}`;
    const result = await registerOwnerAndTenant({
      email: `owner-${Date.now()}@limits-loc.com`,
      password: "Password123!",
      name: "Owner Limiter",
      businessName: "Location Limited Cafe",
      slug,
    });

    const ctx: RequestContext = {
      userId: result.user.id,
      tenantId: result.tenant.id,
      role: "owner",
      requestId: "req-limit-1",
    };

    // Set maxLocations: 1 (initial registration already creates 1 location)
    await db
      .update(tenants)
      .set({ limits: { maxLocations: 1 } })
      .where(eq(tenants.id, result.tenant.id));

    // Creating second location should fail
    await expect(
      createLocation(ctx, { name: "Second Location" })
    ).rejects.toThrow(/Location limit reached for your plan/);

    // Increase limit to 2
    await db
      .update(tenants)
      .set({ limits: { maxLocations: 2 } })
      .where(eq(tenants.id, result.tenant.id));

    // Creating second location now succeeds
    const loc2 = await createLocation(ctx, { name: "Second Location" });
    expect(loc2.name).toBe("Second Location");

    // Creating third location fails
    await expect(
      createLocation(ctx, { name: "Third Location" })
    ).rejects.toThrow(/Location limit reached for your plan/);
  });

  it("enforces maxStaff limit", async () => {
    const slug = `limit-staff-${Date.now()}`;
    const result = await registerOwnerAndTenant({
      email: `owner-${Date.now()}@limits-staff.com`,
      password: "Password123!",
      name: "Owner Staff Limiter",
      businessName: "Staff Limited Cafe",
      slug,
    });

    const ctx: RequestContext = {
      userId: result.user.id,
      tenantId: result.tenant.id,
      role: "owner",
      requestId: "req-limit-2",
    };

    // Owner is already 1 active staff member. Set maxStaff: 2
    await db
      .update(tenants)
      .set({ limits: { maxStaff: 2 } })
      .where(eq(tenants.id, result.tenant.id));

    // Adding 1 staff member reaches 2 total -> succeeds
    const staff1 = await addStaffMember(ctx, {
      name: "Barista 1",
      email: `barista1-${Date.now()}@test.com`,
      role: "staff",
    });
    expect(staff1.id).toBeDefined();

    // Adding another staff member exceeds 2 -> fails
    await expect(
      addStaffMember(ctx, {
        name: "Barista 2",
        email: `barista2-${Date.now()}@test.com`,
        role: "staff",
      })
    ).rejects.toThrow(/Staff limit reached for your plan/);
  });

  it("enforces maxActiveRewards limit", async () => {
    const slug = `limit-rewards-${Date.now()}`;
    const result = await registerOwnerAndTenant({
      email: `owner-${Date.now()}@limits-rewards.com`,
      password: "Password123!",
      name: "Owner Reward Limiter",
      businessName: "Reward Limited Cafe",
      slug,
    });

    const ctx: RequestContext = {
      userId: result.user.id,
      tenantId: result.tenant.id,
      role: "owner",
      requestId: "req-limit-3",
    };

    // Set maxActiveRewards: 1
    await db
      .update(tenants)
      .set({ limits: { maxActiveRewards: 1 } })
      .where(eq(tenants.id, result.tenant.id));

    // First reward succeeds
    const r1 = await createReward(ctx, {
      title: "Free Espresso",
      costPoints: 10,
    });
    expect(r1.id).toBeDefined();

    // Second active reward fails
    await expect(
      createReward(ctx, {
        title: "Free Cake",
        costPoints: 20,
      })
    ).rejects.toThrow(/Active reward limit reached for your plan/);
  });
});

