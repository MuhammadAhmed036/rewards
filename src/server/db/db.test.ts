import { describe, it, expect } from "vitest";
import { db, withTenant, withMember } from "./index";
import { sql } from "drizzle-orm";

describe("Database Foundation (M0)", () => {
  it("connects to PostgreSQL and executes queries", async () => {
    const result = await db.execute(sql`SELECT 1 as num`);
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });

  it("sets app.tenant_id inside withTenant", async () => {
    const testTenantId = "00000000-0000-0000-0000-000000000001";
    await withTenant(testTenantId, async (tx) => {
      const result = await tx.execute(
        sql`SELECT current_setting('app.tenant_id', true) as tenant_id`
      );
      expect((result[0] as unknown as { tenant_id: string }).tenant_id).toBe(testTenantId);
    });
  });

  it("sets app.user_id inside withMember", async () => {
    const testUserId = "00000000-0000-0000-0000-000000000002";
    await withMember(testUserId, null, async (tx) => {
      const result = await tx.execute(
        sql`SELECT current_setting('app.user_id', true) as user_id`
      );
      expect((result[0] as unknown as { user_id: string }).user_id).toBe(testUserId);
    });
  });
});

