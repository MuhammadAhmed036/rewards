import { db } from "../db";
import {
  tenants,
  locations,
  memberships,
  staffMembers,
  membershipBalances,
  emailOutbox,
  auditEvents,
  users,
} from "../db/schema";
import { RequestContext, assertCan } from "../security/permissions";
import { logAuditEvent } from "./audit";
import { invalidateUserSessions } from "../auth";
import { eq, and, sql, desc, or, ilike, gte } from "drizzle-orm";

export interface ListTenantsFilters {
  q?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export async function listTenants(ctx: RequestContext, filters: ListTenantsFilters = {}) {
  assertCan(ctx, "platform.admin");

  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  const conditions = [];
  if (filters.status) {
    conditions.push(eq(tenants.status, filters.status));
  }
  if (filters.q) {
    const search = `%${filters.q.trim().toLowerCase()}%`;
    conditions.push(
      or(
        ilike(tenants.name, search),
        ilike(tenants.slug, search)
      )!
    );
  }

  const baseQuery = conditions.length > 0 ? and(...conditions) : undefined;

  const tenantRows = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      status: tenants.status,
      plan: tenants.plan,
      industry: tenants.industry,
      timezone: tenants.timezone,
      createdAt: tenants.createdAt,
    })
    .from(tenants)
    .where(baseQuery)
    .orderBy(desc(tenants.createdAt))
    .limit(limit)
    .offset(offset);

  // Aggregate stats per tenant
  const tenantIds = tenantRows.map((t) => t.id);

  if (tenantIds.length === 0) {
    return { tenants: [], total: 0 };
  }

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tenants)
    .where(baseQuery);

  // Member counts per tenant
  const memberCounts = await db
    .select({
      tenantId: memberships.tenantId,
      count: sql<number>`count(*)::int`,
    })
    .from(memberships)
    .groupBy(memberships.tenantId);

  // Location counts per tenant
  const locationCounts = await db
    .select({
      tenantId: locations.tenantId,
      count: sql<number>`count(*)::int`,
    })
    .from(locations)
    .groupBy(locations.tenantId);

  // Staff counts per tenant
  const staffCounts = await db
    .select({
      tenantId: staffMembers.tenantId,
      count: sql<number>`count(*)::int`,
    })
    .from(staffMembers)
    .groupBy(staffMembers.tenantId);

  // Liability per tenant
  const liabilitySums = await db
    .select({
      tenantId: membershipBalances.tenantId,
      liability: sql<number>`COALESCE(SUM(balance), 0)::int`,
    })
    .from(membershipBalances)
    .groupBy(membershipBalances.tenantId);

  const memberMap = new Map(memberCounts.map((m) => [m.tenantId, m.count]));
  const locMap = new Map(locationCounts.map((l) => [l.tenantId, l.count]));
  const staffMap = new Map(staffCounts.map((s) => [s.tenantId, s.count]));
  const liabilityMap = new Map(liabilitySums.map((l) => [l.tenantId, l.liability]));

  const enriched = tenantRows.map((t) => ({
    ...t,
    stats: {
      memberCount: memberMap.get(t.id) || 0,
      locationCount: locMap.get(t.id) || 0,
      staffCount: staffMap.get(t.id) || 0,
      outstandingPoints: liabilityMap.get(t.id) || 0,
    },
  }));

  return { tenants: enriched, total: totalRow.count };
}

export async function getTenantDetail(ctx: RequestContext, tenantId: string, reason?: string) {
  assertCan(ctx, "platform.admin");

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) {
    throw new Error("Tenant not found");
  }

  // Audit access to tenant data by platform admin per Section 10 & 22.10
  await logAuditEvent(ctx, {
    action: "admin.tenant_viewed",
    targetType: "tenant",
    targetId: tenant.id,
    reason: reason || "Platform admin dashboard inspection",
    metadata: { slug: tenant.slug },
  });

  const [membersCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(memberships)
    .where(eq(memberships.tenantId, tenant.id));

  const [liabilityRow] = await db
    .select({ liability: sql<number>`COALESCE(SUM(balance), 0)::int` })
    .from(membershipBalances)
    .where(eq(membershipBalances.tenantId, tenant.id));

  const locationRows = await db
    .select()
    .from(locations)
    .where(eq(locations.tenantId, tenant.id));

  const staffRows = await db
    .select({
      id: staffMembers.id,
      role: staffMembers.role,
      status: staffMembers.status,
      name: users.name,
      email: users.email,
    })
    .from(staffMembers)
    .innerJoin(users, eq(staffMembers.userId, users.id))
    .where(eq(staffMembers.tenantId, tenant.id));

  return {
    tenant,
    stats: {
      memberCount: membersCount.count,
      outstandingPoints: liabilityRow.liability,
      locationCount: locationRows.length,
      staffCount: staffRows.length,
    },
    locations: locationRows,
    staff: staffRows,
  };
}

export interface UpdateTenantInput {
  status?: "active" | "suspended" | "closed" | "pending";
  plan?: "free" | "pro";
  features?: Record<string, unknown>;
  limits?: Record<string, unknown>;
  reason: string;
}

export async function updateTenantByAdmin(
  ctx: RequestContext,
  tenantId: string,
  input: UpdateTenantInput
) {
  assertCan(ctx, "platform.admin");

  if (!input.reason || input.reason.trim().length === 0) {
    throw new Error("Reason is required for platform admin modifications");
  }

  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!existing) {
      throw new Error("Tenant not found");
    }

    const updates: Partial<typeof tenants.$inferInsert> = {};
    if (input.status) updates.status = input.status;
    if (input.plan) updates.plan = input.plan;
    if (input.features) updates.features = input.features;
    if (input.limits) updates.limits = input.limits;

    const [updated] = await tx
      .update(tenants)
      .set(updates)
      .where(eq(tenants.id, tenantId))
      .returning();

    // Section 10 & 19: If suspended, invalidate all staff sessions immediately!
    if (input.status === "suspended" && existing.status !== "suspended") {
      const staffList = await tx
        .select({ userId: staffMembers.userId })
        .from(staffMembers)
        .where(eq(staffMembers.tenantId, tenantId));

      for (const s of staffList) {
        await invalidateUserSessions(s.userId);
      }
    }

    const action =
      input.status === "suspended"
        ? "tenant.suspended"
        : input.status === "active" && existing.status === "suspended"
        ? "tenant.reactivated"
        : "tenant.admin_updated";

    await logAuditEvent(
      ctx,
      {
        action,
        targetType: "tenant",
        targetId: tenantId,
        reason: input.reason,
        metadata: {
          previousStatus: existing.status,
          newStatus: updated.status,
          plan: updated.plan,
        },
      },
      tx
    );

    return updated;
  });
}

export async function getSystemHealth(ctx: RequestContext) {
  assertCan(ctx, "platform.admin");

  const startDb = Date.now();
  await db.execute(sql`SELECT 1`);
  const dbLatencyMs = Date.now() - startDb;

  // Outbox backlog metrics
  const outboxCounts = await db
    .select({
      status: emailOutbox.status,
      count: sql<number>`count(*)::int`,
    })
    .from(emailOutbox)
    .groupBy(emailOutbox.status);

  const outboxMap = new Map(outboxCounts.map((o) => [o.status, o.count]));

  // Audit event volume
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [recentAuditCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditEvents)
    .where(gte(auditEvents.createdAt, oneDayAgo));

  // Total active tenants
  const [tenantStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${tenants.status} = 'active')::int`,
      suspended: sql<number>`count(*) filter (where ${tenants.status} = 'suspended')::int`,
    })
    .from(tenants);

  return {
    database: {
      status: "healthy",
      latencyMs: dbLatencyMs,
    },
    outbox: {
      queued: outboxMap.get("queued") || 0,
      sent: outboxMap.get("sent") || 0,
      failed: outboxMap.get("failed") || 0,
      dead: outboxMap.get("dead") || 0,
    },
    tenants: {
      total: tenantStats.total,
      active: tenantStats.active,
      suspended: tenantStats.suspended,
    },
    auditEvents24h: recentAuditCount.count,
    timestamp: new Date().toISOString(),
  };
}

export async function getPlatformAuditLogs(
  ctx: RequestContext,
  filters: { tenantId?: string; action?: string; limit?: number } = {}
) {
  assertCan(ctx, "platform.admin");

  const limit = filters.limit || 50;
  const conditions = [];

  if (filters.tenantId) {
    conditions.push(
      or(
        eq(auditEvents.tenantId, filters.tenantId),
        and(eq(auditEvents.targetType, "tenant"), eq(auditEvents.targetId, filters.tenantId))
      )!
    );
  }
  if (filters.action) {
    conditions.push(eq(auditEvents.action, filters.action));
  }

  const baseQuery = conditions.length > 0 ? and(...conditions) : undefined;

  const logs = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      targetType: auditEvents.targetType,
      targetId: auditEvents.targetId,
      reason: auditEvents.reason,
      metadata: auditEvents.metadata,
      createdAt: auditEvents.createdAt,
      tenantId: auditEvents.tenantId,
      actorUserId: auditEvents.actorUserId,
      actorEmail: users.email,
      actorName: users.name,
    })
    .from(auditEvents)
    .leftJoin(users, eq(auditEvents.actorUserId, users.id))
    .where(baseQuery)
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);

  return logs;
}

export async function listPlatformCustomers(
  ctx: RequestContext,
  filters: { q?: string; tenantId?: string; limit?: number; offset?: number } = {}
) {
  assertCan(ctx, "platform.admin");
  const limit = filters.limit || 100;
  const offset = filters.offset || 0;

  const conditions = [];
  if (filters.tenantId) {
    conditions.push(eq(memberships.tenantId, filters.tenantId));
  }
  if (filters.q) {
    const search = `%${filters.q.trim().toLowerCase()}%`;
    conditions.push(
      or(
        ilike(users.name, search),
        ilike(users.email, search),
        ilike(memberships.memberNumber, search),
        ilike(tenants.name, search)
      )!
    );
  }

  const baseQuery = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: memberships.id,
      memberNumber: memberships.memberNumber,
      status: memberships.status,
      joinedAt: memberships.joinedAt,
      balance: membershipBalances.balance,
      name: users.name,
      email: users.email,
      tenantId: tenants.id,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .innerJoin(tenants, eq(memberships.tenantId, tenants.id))
    .leftJoin(membershipBalances, eq(memberships.id, membershipBalances.membershipId))
    .where(baseQuery)
    .orderBy(desc(memberships.joinedAt))
    .limit(limit)
    .offset(offset);

  return rows;
}
