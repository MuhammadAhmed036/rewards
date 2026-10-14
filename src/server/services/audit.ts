import { db, DbExecutor } from "../db";
import { auditEvents } from "../db/schema";
import { RequestContext } from "../security/permissions";
import { logger } from "@/lib/logger";

export interface LogAuditParams {
  action: string;
  targetType: string;
  targetId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export async function logAuditEvent(
  ctx: RequestContext,
  params: LogAuditParams,
  executor: DbExecutor = db
): Promise<void> {
  try {
    await executor.insert(auditEvents).values({
      tenantId: ctx.tenantId || null,
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
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
      },
      `Audit: ${params.action}`
    );
  } catch (err) {
    logger.error({ err, params }, "Failed to persist audit event");
  }
}
