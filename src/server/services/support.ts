import { db } from "../db";
import { supportReports, ledgerEntries } from "../db/schema";
import { RequestContext, assertCan } from "../security/permissions";
import { eq, and, desc } from "drizzle-orm";
import { logAuditEvent } from "./audit";
import { adjustBalance } from "./ledger";

export interface SubmitSupportReportInput {
  tenantId: string;
  membershipId?: string;
  ledgerEntryId?: string;
  message: string;
  contactInfo?: string;
}

export async function submitSupportReport(input: SubmitSupportReportInput) {
  const trimmedMessage = input.message?.trim();
  if (!trimmedMessage) {
    throw new Error("Support message cannot be empty");
  }
  if (trimmedMessage.length > 2000) {
    throw new Error("Support message cannot exceed 2000 characters");
  }

  // If ledgerEntryId provided, verify it exists and matches tenant
  if (input.ledgerEntryId) {
    const [entry] = await db
      .select({ id: ledgerEntries.id, tenantId: ledgerEntries.tenantId })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.id, input.ledgerEntryId), eq(ledgerEntries.tenantId, input.tenantId)))
      .limit(1);

    if (!entry) {
      throw new Error("Referenced transaction not found for this tenant");
    }
  }

  const [report] = await db
    .insert(supportReports)
    .values({
      tenantId: input.tenantId,
      membershipId: input.membershipId || null,
      ledgerEntryId: input.ledgerEntryId || null,
      message: trimmedMessage,
      contactInfo: input.contactInfo?.trim() || null,
      status: "open",
    })
    .returning();

  return report;
}

export async function getSupportReports(
  ctx: RequestContext,
  options: { status?: "open" | "resolved" } = {}
) {
  assertCan(ctx, "support.read");
  if (!ctx.tenantId) throw new Error("tenantId required");

  let conditions = eq(supportReports.tenantId, ctx.tenantId);
  if (options.status) {
    conditions = and(conditions, eq(supportReports.status, options.status)) as typeof conditions;
  }

  return await db
    .select()
    .from(supportReports)
    .where(conditions)
    .orderBy(desc(supportReports.createdAt));
}

export async function resolveSupportReport(
  ctx: RequestContext,
  reportId: string,
  options?: {
    issueManualPoints?: number;
    reasonCode?: "goodwill" | "correction" | "fraud_removal" | "other";
    note?: string;
  }
) {
  assertCan(ctx, "support.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");

  const [report] = await db
    .select()
    .from(supportReports)
    .where(and(eq(supportReports.id, reportId), eq(supportReports.tenantId, ctx.tenantId)))
    .limit(1);

  if (!report) {
    throw new Error("Support report not found");
  }

  if (report.status === "resolved") {
    return report;
  }

  // If goodwill points are requested and membership is linked
  if (options?.issueManualPoints && options.issueManualPoints > 0) {
    if (!report.membershipId) {
      throw new Error("Cannot issue points: support report has no associated membership");
    }
    await adjustBalance(ctx, {
      membershipId: report.membershipId,
      pointsDelta: options.issueManualPoints,
      reasonCode: options.reasonCode || "goodwill",
      note: options.note || `Resolved support report ${reportId}`,
      idempotencyKey: `support-resolve-${reportId}-${Date.now()}`,
    });
  }

  const [resolved] = await db
    .update(supportReports)
    .set({
      status: "resolved",
      resolvedBy: ctx.userId,
      resolvedAt: new Date(),
    })
    .where(and(eq(supportReports.id, reportId), eq(supportReports.tenantId, ctx.tenantId)))
    .returning();

  await logAuditEvent(ctx, {
    action: "support.resolved",
    targetType: "support_report",
    targetId: reportId,
    metadata: {
      pointsIssued: options?.issueManualPoints ?? 0,
      note: options?.note,
    },
  });

  return resolved;
}
