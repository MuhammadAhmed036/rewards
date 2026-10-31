import "dotenv/config";
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { auditEvents, users } from "../db/schema";
import { registerOwnerAndTenant } from "./tenant";
import { joinProgramme } from "./member";
import { earn } from "./ledger";
import { addNote } from "./member-notes";
import { getSupportView, grantSupportAccess, listAccessibleTenants, listSupportGrants, revokeSupportAccess, setSupportAgent } from "./support-access";
import { createSession, getSessionContext } from "../auth";
import { can, RequestContext } from "../security/permissions";
import { POST as loginRoute } from "@/app/api/v1/auth/login/route";
import { GET as supportTenantsRoute } from "@/app/api/v1/support/tenants/route";
import { GET as ownerExportRoute } from "@/app/api/v1/owner/reports/export/route";
import { hashPassword } from "../auth";

async function shop() {
  const stamp = `sup-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const s = await registerOwnerAndTenant({ email: `owner-${stamp}@sup.test`, password: "Password123!", name: "Support Owner", businessName: `Support ${stamp}`, slug: stamp, emailVerified: true });
  const ctx: RequestContext = { userId: s.user.id, tenantId: s.tenant.id, role: "owner", requestId: "sup" };
  return { ...s, ctx, slug: stamp };
}

async function agent(admin: RequestContext) {
  const email = `agent-${Date.now()}-${Math.floor(Math.random() * 1000)}@sup.test`;
  const [user] = await db.insert(users).values({ email, name: "Agent Ada", passwordHash: await hashPassword("Password123!"), emailVerifiedAt: new Date() }).returning();
  await setSupportAgent(admin, email, true);
  const ctx: RequestContext = { userId: user.id, role: "support_agent", requestId: "agent" };
  return { user, email, ctx };
}

const admin: RequestContext = { userId: "00000000-0000-0000-0000-000000000001", role: "platform_admin", requestId: "admin", isPlatformAdmin: true };

describe("Support agents (section 4, FR-114)", () => {
  it("can only read: the role has no way to change points, settings or send anything", () => {
    const ctx: RequestContext = { userId: "u", tenantId: "t", role: "support_agent", requestId: "r" };
    expect(can(ctx, "member.read")).toBe(true);
    expect(can(ctx, "support.read")).toBe(true);
    for (const action of ["ledger.earn", "ledger.redeem", "ledger.adjust", "ledger.reverse", "member.manage", "tenant.manage", "staff.manage", "campaign.manage", "reports.export", "platform.admin"] as const) {
      expect(can(ctx, action)).toBe(false);
    }
  });

  it("sees nothing until the owner allows it, then only that business, and only until it ends", async () => {
    const s = await shop();
    const other = await shop();
    const a = await agent(admin);

    await expect(getSupportView(a.ctx, s.tenant.id)).rejects.toThrow(/hasn't opened/);
    expect((await listAccessibleTenants(a.ctx)).some((t) => t.tenantId === s.tenant.id)).toBe(false);

    const grant = await grantSupportAccess(s.ctx, { hours: 1, reason: "A customer's points look wrong" });
    expect((await listAccessibleTenants(a.ctx)).some((t) => t.tenantId === s.tenant.id)).toBe(true);
    const view = await getSupportView(a.ctx, s.tenant.id);
    expect(view.readOnly).toBe(true);
    expect(view.tenant.name).toContain("Support");
    // Another business that didn't allow it stays closed
    await expect(getSupportView(a.ctx, other.tenant.id)).rejects.toThrow(/hasn't opened/);

    await revokeSupportAccess(s.ctx, grant.id);
    await expect(getSupportView(a.ctx, s.tenant.id)).rejects.toThrow(/hasn't opened/);
    await expect(revokeSupportAccess(s.ctx, grant.id)).rejects.toThrow(/already ended/);
  });

  it("shows a customer's history and problems, never private notes, and records each look for the owner", async () => {
    const s = await shop();
    const a = await agent(admin);
    const m = await joinProgramme({ tenantSlug: s.slug, email: `cust-${Date.now()}@sup.test` });
    await earn(s.ctx, { membershipId: m.membership.id, locationId: s.location.id, amountMinor: 1200, idempotencyKey: crypto.randomUUID() });
    await addNote(s.ctx, m.membership.id, "Secret remark about this customer");
    await grantSupportAccess(s.ctx, { hours: 24, reason: "Checking a balance" });

    const view = await getSupportView(a.ctx, s.tenant.id, m.membership.memberNumber);
    expect(view.member).toMatchObject({ memberNumber: m.membership.memberNumber, balance: 12 });
    expect(view.member!.history.some((h) => h.type === "earn" && h.points === 12)).toBe(true);
    expect(JSON.stringify(view)).not.toContain("Secret remark");
    expect(JSON.stringify(view)).not.toContain("@sup.test"); // no customer emails either

    const log = await db.select().from(auditEvents).where(eq(auditEvents.tenantId, s.tenant.id));
    const looked = log.filter((e) => e.action === "support.viewed");
    expect(looked.length).toBe(1);
    expect(looked[0].actorUserId).toBe(a.user.id);
    // The owner sees who looked
    const mine = await listSupportGrants(s.ctx);
    expect(mine.visits.some((v) => v.action === "support.viewed" && v.email === a.email)).toBe(true);
  });

  it("only owners can open access, with a reason and a fixed length", async () => {
    const s = await shop();
    await expect(grantSupportAccess({ ...s.ctx, role: "manager" }, { hours: 1, reason: "Help me please" })).rejects.toThrow(/FORBIDDEN/);
    await expect(grantSupportAccess(s.ctx, { hours: 1000, reason: "Help me please" })).rejects.toThrow(/1 hour, 1 day or 7 days/);
    await expect(grantSupportAccess(s.ctx, { hours: 1, reason: "hi" })).rejects.toThrow(/briefly/);
  });

  it("is a separate kind of account: it can't be a shop user or customer, only admins add it, and it signs in through the team door", async () => {
    const s = await shop();
    await expect(setSupportAgent(admin, s.user.email, true)).rejects.toThrow(/shop/);
    await expect(setSupportAgent({ ...admin, role: "owner", isPlatformAdmin: false }, "x@y.com", true)).rejects.toThrow(/FORBIDDEN/);

    const a = await agent(admin);
    const post = (path: string, body: unknown) =>
      new NextRequest(`http://localhost:3000${path}`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `10.7.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }, body: JSON.stringify(body) });
    // Not through a shop's page
    const wrongDoor = await loginRoute(post("/api/v1/auth/login", { email: a.email, password: "Password123!", portal: "owner", tenantSlug: s.slug }));
    expect(wrongDoor.status).toBeGreaterThanOrEqual(400);
    const ok = await loginRoute(post("/api/v1/auth/login", { email: a.email, password: "Password123!", portal: "admin" }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).data.user.role).toBe("support_agent");
  });

  it("a signed-in agent is held to the support area: other APIs say no", async () => {
    const s = await shop();
    const a = await agent(admin);
    const session = await createSession(a.user.id, "admin");
    const ctx = await getSessionContext(session.token, s.tenant.id);
    expect(ctx?.role).toBe("support_agent");
    expect(ctx?.tenantId).toBeUndefined(); // naming a business in the request doesn't give access

    await grantSupportAccess(s.ctx, { hours: 1, reason: "Need a hand with exports" });
    const get = (path: string) => new NextRequest(`http://localhost:3000${path}`, { headers: { Authorization: `Bearer ${session.token}`, "x-tenant-id": s.tenant.id } });
    expect((await supportTenantsRoute(get("/api/v1/support/tenants"))).status).toBe(200);
    // Even with access open, the owner's own routes stay closed to an agent
    expect((await ownerExportRoute(get("/api/v1/owner/reports/export?type=members"))).status).toBeGreaterThanOrEqual(400);
  });
});
