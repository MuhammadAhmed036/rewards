import { db, DbExecutor } from "../db";
import { auditEvents } from "../db/schema";
import { RequestContext } from "../security/permissions";
import { logger } from "@/lib/logger";

export interface LogAuditParams {
  action: string;
  targetType: string;
  targetId: string;
  tenantId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export async function logAuditEvent(
  ctx: RequestContext,
  params: LogAuditParams,
  executor: DbExecutor = db
): Promise<void> {
  try {
    const effectiveTenantId =
      params.tenantId ||
      ctx.tenantId ||
      (params.targetType === "tenant" ? params.targetId : null);

    await executor.insert(auditEvents).values({
      tenantId: effectiveTenantId,
      actorUserId: ctx.userId || null,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      reason: params.reason || null,
      metadata: params.metadata || {},
      requestId: ctx.requestId || null,
      ipHash: ctx.ipHash || null,
    });

    logger.info(
      {
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        tenantId: effectiveTenantId,
        actorUserId: ctx.userId,
      },
      `Audit: ${params.action}`
    );
  } catch (err) {
    logger.error({ err, params }, "Failed to persist audit event");
  }
}
