import { db } from "../db";
import { feedbackMessages } from "../db/schema";
import { RequestContext, assertCan } from "../security/permissions";
import { eq, and, desc } from "drizzle-orm";
import { logAuditEvent } from "./audit";

export interface SubmitFeedbackInput {
  tenantId: string;
  membershipId?: string;
  locationId?: string;
  message: string;
  contactBackOk?: boolean;
}

export async function submitFeedback(input: SubmitFeedbackInput) {
  const trimmedMessage = input.message.trim();
  if (!trimmedMessage) {
    throw new Error("Feedback message cannot be empty");
  }

  if (trimmedMessage.length > 2000) {
    throw new Error("Feedback message cannot exceed 2000 characters");
  }

  const [newMessage] = await db
    .insert(feedbackMessages)
    .values({
      tenantId: input.tenantId,
      membershipId: input.membershipId || null,
      locationId: input.locationId || null,
      message: trimmedMessage,
      contactBackOk: !!input.contactBackOk,
      status: "new",
    })
    .returning();

  return newMessage;
}

export async function getFeedbackMessages(
  ctx: RequestContext,
  options: { status?: "new" | "read" | "resolved" } = {}
) {
  assertCan(ctx, "feedback.read");
  if (!ctx.tenantId) throw new Error("tenantId required");

  let conditions = eq(feedbackMessages.tenantId, ctx.tenantId);
  if (options.status) {
    conditions = and(conditions, eq(feedbackMessages.status, options.status)) as typeof conditions;
  }

  return await db
    .select()
    .from(feedbackMessages)
    .where(conditions)
    .orderBy(desc(feedbackMessages.createdAt));
}

export async function updateFeedbackStatus(
  ctx: RequestContext,
  feedbackId: string,
  status: "new" | "read" | "resolved"
) {
  assertCan(ctx, "feedback.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");

  const [updated] = await db
    .update(feedbackMessages)
    .set({
      status,
      handledBy: ctx.userId,
    })
    .where(
      and(
        eq(feedbackMessages.id, feedbackId),
        eq(feedbackMessages.tenantId, ctx.tenantId)
      )
    )
    .returning();

  await logAuditEvent(ctx, {
    action: "feedback.status_updated",
    targetType: "feedback_message",
    targetId: feedbackId,
    metadata: { status },
  });

  return updated;
}
