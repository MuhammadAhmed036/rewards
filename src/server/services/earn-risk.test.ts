import "dotenv/config";
import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { auditEvents } from "../db/schema";
import { registerOwnerAndTenant } from "./tenant";
import { joinProgramme } from "./member";
import { publishRuleVersion } from "./programme";
import { adjustBalance, earn } from "./ledger";
import { RequestContext } from "../security/permissions";

async function shop() {
  const stamp = `risk-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const s = await registerOwnerAndTenant({
    email: `owner-${stamp}@risk.test`,
    password: "Password123!",
    name: "Risk Owner",
    businessName: `Risk ${stamp}`,
    slug: stamp,
    emailVerified: true,
  });
  const ctx: RequestContext = { userId: s.user.id, tenantId: s.tenant.id, role: "owner", requestId: "risk" };
  return { ...s, ctx, slug: stamp, ownerEmail: `owner-${stamp}@risk.test` };
}

const flagsFor = (tenantId: string) =>
  db.select().from(auditEvents).where(and(eq(auditEvents.tenantId, tenantId), eq(auditEvents.action, "ledger.flagged")));

describe("Self-awards and unusual activity (FR-042)", () => {
  it("won't let anyone add or change points on their own card", async () => {
    const s = await shop();
    // The owner holds a loyalty card at their own shop
    const own = await joinProgramme({ tenantSlug: s.slug, email: s.ownerEmail, allowExistingUser: true });
    await expect(
      earn(s.ctx, { membershipId: own.membership.id, locationId: s.location.id, amountMinor: 500, idempotencyKey: crypto.randomUUID() })
    ).rejects.toThrow(/SELF_AWARD/);
    await expect(
      adjustBalance(s.ctx, { membershipId: own.membership.id, pointsDelta: 50, reasonCode: "goodwill", note: "me", idempotencyKey: crypto.randomUUID() })
    ).rejects.toThrow(/SELF_AWARD/);

    // Someone else's card is fine
    const other = await joinProgramme({ tenantSlug: s.slug, email: `cust-${Date.now()}@risk.test` });
    await expect(
      earn(s.ctx, { membershipId: other.membership.id, locationId: s.location.id, amountMinor: 500, idempotencyKey: crypto.randomUUID() })
    ).resolves.toMatchObject({ pointsDelta: 5 });
  });

  it("flags a very large award but still gives the points", async () => {
    const s = await shop();
    await publishRuleVersion(s.ctx, {
      earn: { mode: "spend", pointsPerUnit: 1, unitMinor: 100 },
      caps: { maxPointsPerTransaction: 100, maxPointsPerMemberPerDay: 10000, minMinutesBetweenEarns: 0 },
      exclusions: {},
      expiry: {},
    });
    const member = await joinProgramme({ tenantSlug: s.slug, email: `big-${Date.now()}@risk.test` });

    await earn(s.ctx, { membershipId: member.membership.id, locationId: s.location.id, amountMinor: 500, idempotencyKey: crypto.randomUUID() });
    expect(await flagsFor(s.tenant.id)).toHaveLength(0);

    const big = await earn(s.ctx, { membershipId: member.membership.id, locationId: s.location.id, amountMinor: 9500, idempotencyKey: crypto.randomUUID() });
    expect(big.pointsDelta).toBe(95); // 95 is above 90% of the limit of 100
    const flags = await flagsFor(s.tenant.id);
    expect(flags).toHaveLength(1);
    expect(flags[0].reason).toMatch(/Large award/);
  });

  it("flags one person making many awards in a few minutes", async () => {
    const s = await shop();
    await publishRuleVersion(s.ctx, {
      earn: { mode: "spend", pointsPerUnit: 1, unitMinor: 100 },
      caps: { maxPointsPerTransaction: 500, maxPointsPerMemberPerDay: 100000, minMinutesBetweenEarns: 0 },
      exclusions: {},
      expiry: {},
    });
    for (let i = 0; i < 17; i++) {
      const member = await joinProgramme({ tenantSlug: s.slug, email: `fast-${i}-${Date.now()}@risk.test` });
      await earn(s.ctx, { membershipId: member.membership.id, locationId: s.location.id, amountMinor: 300, idempotencyKey: crypto.randomUUID() });
    }
    const flags = await flagsFor(s.tenant.id);
    // The 16th and 17th awards go past 15 in the window
    expect(flags.length).toBe(2);
    expect(flags[0].reason).toMatch(/Fast/);
  });
});
