import "dotenv/config";
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { tenants } from "../db/schema";
import { registerOwnerAndTenant } from "./tenant";
import { joinProgramme } from "./member";
import { publishRuleVersion } from "./programme";
import { earn } from "./ledger";
import { createGroup, disbandGroup, getGroup, joinGroup, leaveGroup, newGroupCode, removeBrand } from "./organisations";
import { RequestContext } from "../security/permissions";

async function brand(tag: string) {
  const stamp = `grp-${tag}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const s = await registerOwnerAndTenant({
    email: `owner-${stamp}@grp.test`,
    password: "Password123!",
    name: `Owner ${tag}`,
    businessName: `Brand ${stamp}`,
    slug: stamp,
    emailVerified: true,
  });
  const ctx: RequestContext = { userId: s.user.id, tenantId: s.tenant.id, role: "owner", requestId: "grp" };
  await publishRuleVersion(ctx, {
    earn: { mode: "spend", pointsPerUnit: 1, unitMinor: 100 },
    caps: { maxPointsPerTransaction: 5000, maxPointsPerMemberPerDay: 100000, minMinutesBetweenEarns: 0 },
    exclusions: {},
    expiry: {},
    bonuses: { welcomePoints: 0 },
  });
  return { ...s, ctx, slug: stamp };
}

/** `n` customers who each buy once, so the brand has members, purchases and points to report. */
async function trade(b: Awaited<ReturnType<typeof brand>>, n: number, tag: string) {
  const emails: string[] = [];
  for (let i = 0; i < n; i++) {
    const email = `${tag}${i}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@grp.test`;
    emails.push(email);
    const m = await joinProgramme({ tenantSlug: b.slug, email });
    await earn(b.ctx, { membershipId: m.membership.id, locationId: b.location.id, amountMinor: 2000, idempotencyKey: crypto.randomUUID() });
  }
  return emails;
}

describe("Groups of brands (FR-015)", () => {
  it("gives the group's owner combined counts per brand, and nobody else's customers' details", async () => {
    const [hq, second, outsider] = [await brand("hq"), await brand("two"), await brand("out")];
    const emailsHq = await trade(hq, 2, "h");
    const emailsTwo = await trade(second, 3, "s");
    await trade(outsider, 4, "o");

    const group = await createGroup(hq.ctx, "Rappio Cafes");
    const code = (await getGroup(hq.ctx)) as { joinCode: string };
    await joinGroup(second.ctx, code.joinCode.toLowerCase());

    const seen = await getGroup(hq.ctx);
    expect(seen).toMatchObject({ inGroup: true, name: "Rappio Cafes", isOwner: true, brandCount: 2 });
    if (!seen.inGroup || !seen.report) throw new Error("expected a report");
    const [mine, theirs] = [seen.report.brands.find((b) => b.id === hq.tenant.id)!, seen.report.brands.find((b) => b.id === second.tenant.id)!];
    expect(mine).toMatchObject({ isYours: true, members: 2, purchases: 2, buyers: 2, pointsAwarded: 40, outstandingPoints: 40 });
    expect(theirs).toMatchObject({ isYours: false, members: 3, purchases: 3, buyers: 3, pointsAwarded: 60, outstandingPoints: 60 });
    expect(seen.report.totals).toMatchObject({ members: 5, purchases: 5, pointsAwarded: 100 });
    // A brand outside the group is never in the report
    expect(seen.report.brands.find((b) => b.id === outsider.tenant.id)).toBeUndefined();

    // Counts only: no customer's email or name, and no other brand's id
    const text = JSON.stringify(seen);
    for (const email of [...emailsHq, ...emailsTwo]) expect(text).not.toContain(email);
    expect(text).not.toContain(outsider.tenant.id);
    expect(group.name).toBe("Rappio Cafes");

    // A brand in the group sees who is in it, but not the report or the code
    const asMember = await getGroup(second.ctx);
    expect(asMember).toMatchObject({ inGroup: true, isOwner: false, joinCode: null, report: null });
  });

  it("lets a brand leave, the owner remove a brand or end the group, and keeps each brand's own data", async () => {
    const [hq, a, b] = [await brand("hq2"), await brand("a"), await brand("b")];
    await trade(a, 1, "a");
    await createGroup(hq.ctx, "Group Two");
    const code = ((await getGroup(hq.ctx)) as { joinCode: string }).joinCode;
    await joinGroup(a.ctx, code);
    await joinGroup(b.ctx, code);

    await leaveGroup(a.ctx);
    expect(await getGroup(a.ctx)).toEqual({ inGroup: false });
    await expect(leaveGroup(a.ctx)).rejects.toThrow(/isn't in a group/);
    // The brand that started the group can't just walk away from it
    await expect(leaveGroup(hq.ctx)).rejects.toThrow(/started the group/);

    await removeBrand(hq.ctx, b.tenant.id);
    expect(await getGroup(b.ctx)).toEqual({ inGroup: false });
    await expect(removeBrand(hq.ctx, b.tenant.id)).rejects.toThrow(/isn't in your group/);
    await expect(removeBrand(hq.ctx, hq.tenant.id)).rejects.toThrow(/your own business/);

    await joinGroup(b.ctx, code);
    await disbandGroup(hq.ctx);
    for (const x of [hq, b]) expect(await getGroup(x.ctx)).toEqual({ inGroup: false });
    // Ending the group doesn't touch anyone's customers
    expect(await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, a.tenant.id))).toHaveLength(1);
    const [aStill] = await db.select({ org: tenants.organisationId }).from(tenants).where(eq(tenants.id, a.tenant.id));
    expect(aStill.org).toBeNull();
  });

  it("only lets the group's owner change it, and refuses wrong or replaced codes and double membership", async () => {
    const [hq, a, c] = [await brand("hq3"), await brand("a3"), await brand("c3")];
    await createGroup(hq.ctx, "Group Three");
    const first = ((await getGroup(hq.ctx)) as { joinCode: string }).joinCode;
    await joinGroup(a.ctx, first);

    await expect(joinGroup(c.ctx, "NOTACODE12")).rejects.toThrow(/doesn't match a group/);
    await expect(joinGroup(a.ctx, first)).rejects.toThrow(/already in a group/);
    await expect(createGroup(a.ctx, "Mine")).rejects.toThrow(/already in a group/);
    await expect(createGroup(c.ctx, "x")).rejects.toThrow(/name/);

    // A brand in the group can't change it
    await expect(newGroupCode(a.ctx)).rejects.toThrow(/Only the owner/);
    await expect(removeBrand(a.ctx, hq.tenant.id)).rejects.toThrow(/Only the owner/);
    await expect(disbandGroup(a.ctx)).rejects.toThrow(/Only the owner/);

    // A new code replaces the old one, and brands already in stay
    const { joinCode } = await newGroupCode(hq.ctx);
    expect(joinCode).not.toBe(first);
    await expect(joinGroup(c.ctx, first)).rejects.toThrow(/doesn't match a group/);
    await joinGroup(c.ctx, joinCode);
    expect(((await getGroup(hq.ctx)) as { brandCount: number }).brandCount).toBe(3);

    // Staff or customers can't run a group
    const staffish: RequestContext = { ...hq.ctx, role: "staff" };
    await expect(createGroup(staffish, "Nope")).rejects.toThrow();
  });
});
