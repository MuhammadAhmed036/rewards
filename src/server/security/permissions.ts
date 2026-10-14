export type UserRole =
  | "platform_admin"
  | "owner"
  | "manager"
  | "staff"
  | "marketing"
  | "customer";

export interface RequestContext {
  userId: string;
  tenantId?: string;
  role: UserRole;
  locationIds?: string[]; // Empty/undefined means all locations for owner/manager
  requestId: string;
  ipHash?: string;
  isPlatformAdmin?: boolean;
}

export type Action =
  | "platform.admin"
  | "tenant.manage"
  | "location.manage"
  | "staff.manage"
  | "programme.manage"
  | "reward.manage"
  | "member.read"
  | "member.manage"
  | "ledger.earn"
  | "ledger.redeem"
  | "ledger.adjust"
  | "ledger.reverse"
  | "links.manage"
  | "feedback.read"
  | "feedback.manage"
  | "analytics.view"
  | "reports.export"
  | "qr.download"
  | "customer.profile"
  | "customer.redeem"
  | "customer.feedback";

// RBAC Action Matrix per Section 6
const ROLE_PERMISSIONS: Record<UserRole, readonly Action[]> = {
  platform_admin: [
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
  ],
  owner: [
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
  ],
  manager: [
    "location.manage",
    "member.read",
    "member.manage",
    "ledger.earn",
    "ledger.redeem",
    "ledger.adjust",
    "ledger.reverse",
    "feedback.read",
    "feedback.manage",
    "analytics.view",
    "reports.export",
    "qr.download",
  ],
  staff: [
    "member.read",
    "ledger.earn",
    "ledger.redeem",
  ],
  marketing: [
    "analytics.view",
    "member.read",
  ],
  customer: [
    "customer.profile",
    "customer.redeem",
    "customer.feedback",
  ],
};

/**
 * Evaluates whether the given context has permission to execute the specified action on a resource.
 * Also checks location scope when resource specifies a locationId.
 */
export function can(
  ctx: RequestContext,
  action: Action,
  resource?: { locationId?: string; tenantId?: string }
): boolean {
  if (ctx.isPlatformAdmin && action === "platform.admin") {
    return true;
  }

  // Check tenant scope if resource specifies a tenantId
  if (
    resource?.tenantId &&
    ctx.tenantId &&
    resource.tenantId !== ctx.tenantId &&
    ctx.role !== "platform_admin"
  ) {
    return false;
  }

  // Check if role permits this action
  const allowedActions = ROLE_PERMISSIONS[ctx.role] || [];
  if (!allowedActions.includes(action)) {
    return false;
  }

  // Check location scoping for staff/manager if a locationId is supplied
  if (resource?.locationId && ctx.locationIds && ctx.locationIds.length > 0) {
    if (!ctx.locationIds.includes(resource.locationId)) {
      return false;
    }
  }

  return true;
}

export function assertCan(
  ctx: RequestContext,
  action: Action,
  resource?: { locationId?: string; tenantId?: string }
): void {
  if (!can(ctx, action, resource)) {
    throw new Error(`FORBIDDEN: Role ${ctx.role} cannot perform ${action}`);
  }
}

