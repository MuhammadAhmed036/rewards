import { describe, it, expect } from "vitest";
import { can, assertCan, RequestContext, Action, UserRole } from "./permissions";

describe("RBAC Permissions Matrix (M1)", () => {
  const actions: Action[] = [
    "platform.admin",
    "tenant.manage",
    "location.manage",
    "staff.manage",
    "programme.manage",
    "reward.manage",
    "member.read",
    "member.manage",
    "ledger.earn",
    "ledger.redeem",
    "ledger.adjust",
    "ledger.reverse",
    "links.manage",
    "feedback.read",
    "feedback.manage",
    "analytics.view",
    "reports.export",
    "qr.download",
    "customer.profile",
    "customer.redeem",
    "customer.feedback",
  ];

  const roles: UserRole[] = [
    "platform_admin",
    "owner",
    "manager",
    "staff",
    "marketing",
    "customer",
  ];

  it("evaluates permission checks across all roles and actions without crashing", () => {
    for (const role of roles) {
      const ctx: RequestContext = {
        userId: "user-123",
        tenantId: "tenant-abc",
        role,
        requestId: "req-1",
        isPlatformAdmin: role === "platform_admin",
      };

      for (const action of actions) {
        const allowed = can(ctx, action);
        expect(typeof allowed).toBe("boolean");
      }
    }
  });

  describe("Owner permissions", () => {
    const ownerCtx: RequestContext = {
      userId: "owner-1",
      tenantId: "tenant-1",
      role: "owner",
      requestId: "req-1",
    };

    it("can manage programme, rewards, staff, and links", () => {
      expect(can(ownerCtx, "programme.manage")).toBe(true);
      expect(can(ownerCtx, "reward.manage")).toBe(true);
      expect(can(ownerCtx, "staff.manage")).toBe(true);
      expect(can(ownerCtx, "links.manage")).toBe(true);
      expect(can(ownerCtx, "tenant.manage")).toBe(true);
      expect(can(ownerCtx, "ledger.adjust")).toBe(true);
      expect(can(ownerCtx, "reports.export")).toBe(true);
    });

    it("cannot perform platform admin tasks", () => {
      expect(can(ownerCtx, "platform.admin")).toBe(false);
    });
  });

  describe("Staff permissions & Location scoping", () => {
    const staffCtx: RequestContext = {
      userId: "staff-1",
      tenantId: "tenant-1",
      role: "staff",
      locationIds: ["loc-branch-a"],
      requestId: "req-1",
    };

    it("allows staff to earn and redeem at their assigned location", () => {
      expect(can(staffCtx, "ledger.earn", { locationId: "loc-branch-a" })).toBe(true);
      expect(can(staffCtx, "ledger.redeem", { locationId: "loc-branch-a" })).toBe(true);
      expect(can(staffCtx, "member.read")).toBe(true);
    });

    it("forbids staff from acting at an unassigned location", () => {
      expect(can(staffCtx, "ledger.earn", { locationId: "loc-branch-b" })).toBe(false);
      expect(can(staffCtx, "ledger.redeem", { locationId: "loc-branch-b" })).toBe(false);
    });

    it("forbids staff from exporting reports, altering settings, or adjusting balances", () => {
      expect(can(staffCtx, "reports.export")).toBe(false);
      expect(can(staffCtx, "tenant.manage")).toBe(false);
      expect(can(staffCtx, "ledger.adjust")).toBe(false);
      expect(can(staffCtx, "programme.manage")).toBe(false);
    });

    it("throws forbidden error on assertCan", () => {
      expect(() => assertCan(staffCtx, "tenant.manage")).toThrow(/FORBIDDEN/);
    });
  });

  describe("Customer permissions", () => {
    const customerCtx: RequestContext = {
      userId: "cust-1",
      role: "customer",
      requestId: "req-1",
    };

    it("allows customer to view profile, request redemption, and submit feedback", () => {
      expect(can(customerCtx, "customer.profile")).toBe(true);
      expect(can(customerCtx, "customer.redeem")).toBe(true);
      expect(can(customerCtx, "customer.feedback")).toBe(true);
    });

    it("forbids customer from staff or management actions", () => {
      expect(can(customerCtx, "ledger.earn")).toBe(false);
      expect(can(customerCtx, "ledger.redeem")).toBe(false);
      expect(can(customerCtx, "member.read")).toBe(false);
      expect(can(customerCtx, "reports.export")).toBe(false);
    });
  });

  describe("Cross-tenant boundaries", () => {
    const tenantACtx: RequestContext = {
      userId: "owner-a",
      tenantId: "tenant-aaa",
      role: "owner",
      requestId: "req-1",
    };

    it("forbids acting on resources belonging to another tenant", () => {
      expect(can(tenantACtx, "programme.manage", { tenantId: "tenant-bbb" })).toBe(false);
      expect(can(tenantACtx, "member.read", { tenantId: "tenant-bbb" })).toBe(false);
    });
  });
});

