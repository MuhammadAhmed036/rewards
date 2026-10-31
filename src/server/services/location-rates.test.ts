import "dotenv/config";
import { describe, it, expect } from "vitest";
import { registerOwnerAndTenant, createLocation } from "./tenant";
import { joinProgramme } from "./member";
import { publishRuleVersion } from "./programme";
import { earn, previewEarn } from "./ledger";
import { ruleConfigSchema, ruleForLocation } from "@/lib/points";
import { RequestContext } from "../security/permissions";

describe("ruleForLocation", () => {
  const base = ruleConfigSchema.parse({ earn: { pointsPerUnit: 1, unitMinor: 100 }, caps: {}, exclusions: {}, expiry: {} });

  it("leaves a location with no override on the programme-wide rule", () => {
    expect(ruleForLocation(base, "loc-1")).toBe(base);
    expect(ruleForLocation(base, null)).toBe(base);
  });

  it("changes only the fields the location lists", () => {
    const rule = ruleConfigSchema.parse({ ...base, locationOverrides: { "loc-1": { earn: { pointsPerUnit: 3 }, caps: {} } } });
    const local = ruleForLocation(rule, "loc-1");
    expect(local.earn.pointsPerUnit).toBe(3);
    expect(local.earn.unitMinor).toBe(100);
    expect(local.caps.maxPointsPerTransaction).toBe(base.caps.maxPointsPerTransaction);
    expect(ruleForLocation(rule, "other").earn.pointsPerUnit).toBe(1);
  });
});

describe("Different earning rate at one location (FR-013)", () => {
  async function shop() {
    const stamp = `rates-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const s = await registerOwnerAndTenant({
      email: `owner-${stamp}@rates.test`,
      password: "Password123!",
      name: "Rates Owner",
      businessName: `Rates ${stamp}`,
      slug: stamp,
      emailVerified: true,
    });
    const ctx: RequestContext = { userId: s.user.id, tenantId: s.tenant.id, role: "owner", requestId: "rates" };
    return { ...s, ctx, slug: stamp };
  }

  it("awards the location's own rate, and the programme rate everywhere else", async () => {
    const s = await shop();
    const airport = await createLocation(s.ctx, { name: "Airport" });
    await publishRuleVersion(s.ctx, {
      earn: { mode: "spend", pointsPerUnit: 1, unitMinor: 100 },
      caps: { maxPointsPerMemberPerDay: 10000, minMinutesBetweenEarns: 0 },
      exclusions: {},
      expiry: {},
      locationOverrides: { [airport.id]: { earn: { pointsPerUnit: 3 }, caps: {} } },
    });
    const member = await joinProgramme({ tenantSlug: s.slug, email: `cust-${Date.now()}@rates.test` });

    const main = await earn(s.ctx, { membershipId: member.membership.id, locationId: s.location.id, amountMinor: 1000, idempotencyKey: crypto.randomUUID() });
    const preview = await previewEarn(s.ctx, { membershipId: member.membership.id, locationId: airport.id, amountMinor: 1000 });
    const away = await earn(s.ctx, { membershipId: member.membership.id, locationId: airport.id, amountMinor: 1000, idempotencyKey: crypto.randomUUID() });

    expect(main.pointsDelta).toBe(10);
    expect(away.pointsDelta).toBe(30);
    // The preview staff see matches what is then awarded
    expect(JSON.stringify(preview)).toContain("30");
  });

  it("refuses a rule that names a location from another business", async () => {
    const a = await shop();
    const b = await shop();
    await expect(
      publishRuleVersion(a.ctx, {
        earn: { mode: "spend" },
        caps: {},
        exclusions: {},
        expiry: {},
        locationOverrides: { [b.location.id]: { earn: { pointsPerUnit: 5 }, caps: {} } },
      })
    ).rejects.toThrow(/isn't part of your business/);
  });
});
