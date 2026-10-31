import "dotenv/config";
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { tenants } from "../db/schema";
import { registerOwnerAndTenant } from "./tenant";
import { startOfTenantDay } from "./ledger";

/** What midnight is in a time zone right now, worked out independently of the database. */
function expectedMidnight(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  // Walk back from "now" in 15-minute steps until the local date changes: that instant is midnight
  let t = Date.now();
  const fmt = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  while (fmt(t - 15 * 60 * 1000) === parts) t -= 15 * 60 * 1000;
  return t;
}

describe("Daily earn cap uses the shop's own day", () => {
  it("starts 'today' at midnight in the business time zone, not the server's", async () => {
    const stamp = `tz-${Date.now()}`;
    const s = await registerOwnerAndTenant({
      email: `owner-${stamp}@tz.test`,
      password: "Password123!",
      name: "TZ Owner",
      businessName: `TZ Cafe ${stamp}`,
      slug: stamp,
    });

    for (const zone of ["Pacific/Auckland", "America/Los_Angeles", "Asia/Karachi"]) {
      await db.update(tenants).set({ timezone: zone }).where(eq(tenants.id, s.tenant.id));
      const start = await startOfTenantDay(db, s.tenant.id);
      // Within one 15-minute step of the independently computed midnight
      expect(Math.abs(start.getTime() - expectedMidnight(zone))).toBeLessThanOrEqual(15 * 60 * 1000);
      expect(start.getTime()).toBeLessThanOrEqual(Date.now());
      expect(Date.now() - start.getTime()).toBeLessThan(25 * 60 * 60 * 1000);
    }
  });
});
