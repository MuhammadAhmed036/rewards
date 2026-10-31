import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { memberNotes, memberships, users } from "../db/schema";
import { RequestContext, assertCan } from "../security/permissions";
import { logAuditEvent } from "./audit";

/** Notes are deleted this long after they were written (FR-086 retention). */
export const NOTE_RETENTION_MONTHS = 24;
const MAX_NOTE_LENGTH = 1000;
const MAX_NOTES_PER_MEMBER = 50;

async function assertOwnMember(ctx: RequestContext, membershipId: string) {
  const [m] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.id, membershipId), eq(memberships.tenantId, ctx.tenantId!)))
    .limit(1);
  if (!m) throw new Error("Customer not found for this business.");
}

/** Only owners and managers can read or write notes; staff at the till never see them. */
export async function listNotes(ctx: RequestContext, membershipId: string) {
  assertCan(ctx, "member.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");
  await assertOwnMember(ctx, membershipId);
  // Reading private notes about a person is itself recorded
  await logAuditEvent(ctx, { action: "member.notes_viewed", targetType: "membership", targetId: membershipId });
  return db
    .select({ id: memberNotes.id, body: memberNotes.body, createdAt: memberNotes.createdAt, authorName: users.name })
    .from(memberNotes)
    .leftJoin(users, eq(users.id, memberNotes.authorUserId))
    .where(and(eq(memberNotes.tenantId, ctx.tenantId), eq(memberNotes.membershipId, membershipId)))
    .orderBy(desc(memberNotes.createdAt));
}

export async function addNote(ctx: RequestContext, membershipId: string, body: string) {
  assertCan(ctx, "member.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");
  const text = body.trim();
  if (!text) throw new Error("Write something to save.");
  if (text.length > MAX_NOTE_LENGTH) throw new Error(`Keep a note under ${MAX_NOTE_LENGTH} characters.`);
  await assertOwnMember(ctx, membershipId);
  const existing = await db.select({ id: memberNotes.id }).from(memberNotes).where(and(eq(memberNotes.tenantId, ctx.tenantId), eq(memberNotes.membershipId, membershipId)));
  if (existing.length >= MAX_NOTES_PER_MEMBER) throw new Error(`Up to ${MAX_NOTES_PER_MEMBER} notes per customer. Remove an old one first.`);
  const [row] = await db.insert(memberNotes).values({ tenantId: ctx.tenantId, membershipId, authorUserId: ctx.userId, body: text }).returning();
  // The audit trail records that a note was written, never what it said
  await logAuditEvent(ctx, { action: "member.note_added", targetType: "membership", targetId: membershipId });
  return { id: row.id, body: row.body, createdAt: row.createdAt };
}

export async function deleteNote(ctx: RequestContext, id: string) {
  assertCan(ctx, "member.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");
  const [row] = await db.delete(memberNotes).where(and(eq(memberNotes.id, id), eq(memberNotes.tenantId, ctx.tenantId))).returning();
  if (!row) throw new Error("That note doesn't exist.");
  await logAuditEvent(ctx, { action: "member.note_deleted", targetType: "membership", targetId: row.membershipId });
  return { deleted: true };
}
