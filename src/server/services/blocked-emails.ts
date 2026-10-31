import { db } from "../db";
import { blockedEmails, memberships, users } from "../db/schema";
import { RequestContext, assertCan } from "../security/permissions";
import { and, desc, eq } from "drizzle-orm";
import { invalidateUserSessions } from "../auth";
import { logAuditEvent } from "./audit";

/** Emails this business has barred from joining. */
export async function listBlockedEmails(ctx: RequestContext) {
  assertCan(ctx, "member.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");
  return db
    .select({ id: blockedEmails.id, email: blockedEmails.email, reason: blockedEmails.reason, createdAt: blockedEmails.createdAt })
    .from(blockedEmails)
    .where(eq(blockedEmails.tenantId, ctx.tenantId))
    .orderBy(desc(blockedEmails.createdAt));
}

/**
 * Bars an email from this business's programme. If that person already has a card here it is
 * suspended too, so they can't keep earning or spending. Their points and history are kept.
 */
export async function blockEmail(ctx: RequestContext, params: { email: string; reason: string }) {
  assertCan(ctx, "member.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");
  const email = params.email.toLowerCase().trim();
  const reason = params.reason.trim();
  if (!reason) throw new Error("Say why you are blocking this email.");

  const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, ctx.userId)).limit(1);
  if (owner?.email === email) throw new Error("You can't block your own email.");

  const [row] = await db
    .insert(blockedEmails)
    .values({ tenantId: ctx.tenantId, email, reason, blockedBy: ctx.userId })
    .onConflictDoNothing()
    .returning();

  // Suspend their card here, if they have one
  const [person] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  let suspended = false;
  if (person) {
    const updated = await db
      .update(memberships)
      .set({ status: "suspended" })
      .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.userId, person.id), eq(memberships.status, "active")))
      .returning({ id: memberships.id });
    suspended = updated.length > 0;
    if (suspended) await invalidateUserSessions(person.id);
  }

  await logAuditEvent(ctx, {
    action: "member.email_blocked",
    targetType: "blocked_email",
    targetId: row?.id ?? email,
    reason,
    metadata: { email, cardSuspended: suspended },
  });
  return { blocked: true, cardSuspended: suspended };
}

/** Lets a blocked email join again. Any suspended card stays suspended until reactivated. */
export async function unblockEmail(ctx: RequestContext, id: string) {
  assertCan(ctx, "member.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");
  const [removed] = await db
    .delete(blockedEmails)
    .where(and(eq(blockedEmails.id, id), eq(blockedEmails.tenantId, ctx.tenantId)))
    .returning();
  if (!removed) throw new Error("That email isn't on your blocked list.");
  await logAuditEvent(ctx, {
    action: "member.email_unblocked",
    targetType: "blocked_email",
    targetId: id,
    metadata: { email: removed.email },
  });
  return { removed: true };
}
