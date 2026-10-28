import { db } from "../db";
import { conversations, conversationMessages, memberships, users } from "../db/schema";
import { RequestContext } from "../security/permissions";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";

/**
 * Customer <-> business chat.
 *  - A customer writes to a shop; staff, managers and the owner all see it and can reply.
 *  - Only the customer can end a conversation. Afterwards it stays visible (read-only) to the business.
 *  - Messages are append-only: nothing here edits or deletes a message.
 */

export const MAX_MESSAGE_LENGTH = 2000;
const BUSINESS_ROLES = ["owner", "manager", "staff"] as const;
const CUSTOMER_MESSAGES_PER_MINUTE = 10;

export interface ChatMessage {
  id: string;
  from: "customer" | "business";
  senderType: string;
  senderName: string | null;
  body: string;
  createdAt: string;
}

export interface ChatConversation {
  id: string;
  status: "open" | "closed";
  createdAt: string;
  lastMessageAt: string;
  closedAt: string | null;
  messages: ChatMessage[];
}

function cleanBody(body: string) {
  const text = (body || "").replace(/\r\n/g, "\n").trim();
  if (!text) throw new Error("Write a message first.");
  if (text.length > MAX_MESSAGE_LENGTH) throw new Error(`Messages can be up to ${MAX_MESSAGE_LENGTH} characters.`);
  return text;
}

function assertBusiness(ctx: RequestContext) {
  if (!ctx.tenantId) throw new Error("tenantId required");
  if (!ctx.isPlatformAdmin && !(BUSINESS_ROLES as readonly string[]).includes(ctx.role)) {
    throw new Error("FORBIDDEN: Only the shop's staff can read customer messages");
  }
}

async function loadMessages(conversationIds: string[]) {
  if (conversationIds.length === 0) return new Map<string, ChatMessage[]>();
  const rows = await db
    .select()
    .from(conversationMessages)
    .where(inArray(conversationMessages.conversationId, conversationIds))
    .orderBy(asc(conversationMessages.createdAt));

  const map = new Map<string, ChatMessage[]>();
  for (const r of rows) {
    const list = map.get(r.conversationId) || [];
    list.push({
      id: r.id,
      from: r.senderType === "customer" ? "customer" : "business",
      senderType: r.senderType,
      senderName: r.senderName,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
    });
    map.set(r.conversationId, list);
  }
  return map;
}

function toConversation(row: typeof conversations.$inferSelect, messages: ChatMessage[]): ChatConversation {
  return {
    id: row.id,
    status: row.status === "closed" ? "closed" : "open",
    createdAt: row.createdAt.toISOString(),
    lastMessageAt: row.lastMessageAt.toISOString(),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    messages,
  };
}

// ---------------- Customer side ----------------

/** The customer's open chat (if any) plus their last few ended chats. Marks the open chat as read. */
export async function getCustomerConversations(tenantId: string, membershipId: string) {
  const rows = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.tenantId, tenantId), eq(conversations.membershipId, membershipId)))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(6);

  const open = rows.find((r) => r.status === "open") || null;
  const past = rows.filter((r) => r.status !== "open").slice(0, 5);
  const messages = await loadMessages(rows.map((r) => r.id));

  if (open) {
    await db.update(conversations).set({ customerLastReadAt: new Date() }).where(eq(conversations.id, open.id));
  }

  return {
    active: open ? toConversation(open, messages.get(open.id) || []) : null,
    past: past.map((r) => toConversation(r, messages.get(r.id) || [])),
  };
}

/** Customer sends a message, starting a new conversation if none is open. */
export async function sendCustomerMessage(tenantId: string, membershipId: string, userId: string, body: string) {
  const text = cleanBody(body);

  const [recent] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(conversationMessages)
    .innerJoin(conversations, eq(conversationMessages.conversationId, conversations.id))
    .where(
      and(
        eq(conversations.membershipId, membershipId),
        eq(conversationMessages.senderType, "customer"),
        gt(conversationMessages.createdAt, new Date(Date.now() - 60_000))
      )
    );
  if ((recent?.count || 0) >= CUSTOMER_MESSAGES_PER_MINUTE) {
    throw new Error("You're sending messages very quickly. Wait a minute and try again.");
  }

  const [member] = await db
    .select({ status: memberships.status, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(and(eq(memberships.id, membershipId), eq(memberships.tenantId, tenantId)))
    .limit(1);
  if (!member) throw new Error("Card not found for this shop");
  if (member.status !== "active") throw new Error(`Your card is ${member.status}, so messages are turned off.`);

  return db.transaction(async (tx) => {
    const now = new Date();
    let [open] = await tx
      .select()
      .from(conversations)
      .where(and(eq(conversations.membershipId, membershipId), eq(conversations.status, "open")))
      .for("update")
      .limit(1);

    if (!open) {
      [open] = await tx
        .insert(conversations)
        .values({ tenantId, membershipId, status: "open", lastMessageAt: now, lastMessageBy: "customer", customerLastReadAt: now })
        .returning();
    }

    await tx.insert(conversationMessages).values({
      conversationId: open.id,
      tenantId,
      senderType: "customer",
      senderUserId: userId,
      senderName: member.name || "Customer",
      body: text,
      createdAt: now,
    });

    await tx
      .update(conversations)
      .set({ lastMessageAt: now, lastMessageBy: "customer", customerLastReadAt: now })
      .where(eq(conversations.id, open.id));

    return open.id;
  });
}

/** Only the customer can end their chat. */
export async function endCustomerConversation(
  tenantId: string,
  membershipId: string,
  userId: string,
  conversationId: string
) {
  const [row] = await db
    .update(conversations)
    .set({ status: "closed", closedAt: new Date(), closedBy: userId })
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.tenantId, tenantId),
        eq(conversations.membershipId, membershipId),
        eq(conversations.status, "open")
      )
    )
    .returning({ id: conversations.id });
  if (!row) throw new Error("This chat is already ended or doesn't exist.");
  return row;
}

// ---------------- Business side (owner, manager, staff) ----------------

export async function listBusinessConversations(ctx: RequestContext, status: "open" | "closed" | "all" = "open") {
  assertBusiness(ctx);
  const rows = await db
    .select({
      conv: conversations,
      memberNumber: memberships.memberNumber,
      customerName: users.name,
      customerEmail: users.email,
    })
    .from(conversations)
    .innerJoin(memberships, eq(conversations.membershipId, memberships.id))
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(
      and(
        eq(conversations.tenantId, ctx.tenantId!),
        ...(status === "all" ? [] : [eq(conversations.status, status)])
      )
    )
    .orderBy(desc(conversations.lastMessageAt))
    .limit(100);

  const ids = rows.map((r) => r.conv.id);
  const last = ids.length
    ? await db
        .selectDistinctOn([conversationMessages.conversationId], {
          conversationId: conversationMessages.conversationId,
          body: conversationMessages.body,
          senderType: conversationMessages.senderType,
        })
        .from(conversationMessages)
        .where(inArray(conversationMessages.conversationId, ids))
        .orderBy(conversationMessages.conversationId, desc(conversationMessages.createdAt))
    : [];
  const lastById = new Map(last.map((l) => [l.conversationId, l]));

  return rows.map((r) => {
    const unread =
      r.conv.lastMessageBy === "customer" &&
      (!r.conv.businessLastReadAt || r.conv.businessLastReadAt < r.conv.lastMessageAt);
    const lm = lastById.get(r.conv.id);
    return {
      id: r.conv.id,
      status: r.conv.status === "closed" ? "closed" : "open",
      customerName: r.customerName || "Customer",
      memberNumber: r.memberNumber,
      lastMessageAt: r.conv.lastMessageAt.toISOString(),
      lastMessagePreview: lm ? lm.body.slice(0, 140) : "",
      lastMessageFromCustomer: lm ? lm.senderType === "customer" : true,
      unread,
      closedAt: r.conv.closedAt ? r.conv.closedAt.toISOString() : null,
    };
  });
}

export async function countUnreadBusinessConversations(ctx: RequestContext) {
  assertBusiness(ctx);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(conversations)
    .where(
      and(
        eq(conversations.tenantId, ctx.tenantId!),
        eq(conversations.status, "open"),
        eq(conversations.lastMessageBy, "customer"),
        sql`(${conversations.businessLastReadAt} IS NULL OR ${conversations.businessLastReadAt} < ${conversations.lastMessageAt})`
      )
    );
  return row?.count || 0;
}

/** Opens a conversation for the business and marks it read. */
export async function getBusinessConversation(ctx: RequestContext, conversationId: string) {
  assertBusiness(ctx);
  const [row] = await db
    .select({ conv: conversations, memberNumber: memberships.memberNumber, customerName: users.name })
    .from(conversations)
    .innerJoin(memberships, eq(conversations.membershipId, memberships.id))
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, ctx.tenantId!)))
    .limit(1);
  if (!row) throw new Error("Conversation not found");

  await db.update(conversations).set({ businessLastReadAt: new Date() }).where(eq(conversations.id, conversationId));
  const messages = await loadMessages([conversationId]);
  return {
    ...toConversation(row.conv, messages.get(conversationId) || []),
    customerName: row.customerName || "Customer",
    memberNumber: row.memberNumber,
  };
}

/** Staff, manager or owner replies. Ended chats can't be replied to — the customer starts a new one. */
export async function replyAsBusiness(ctx: RequestContext, conversationId: string, body: string) {
  assertBusiness(ctx);
  const text = cleanBody(body);

  const [sender] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, ctx.userId)).limit(1);

  return db.transaction(async (tx) => {
    const [conv] = await tx
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, ctx.tenantId!)))
      .for("update")
      .limit(1);
    if (!conv) throw new Error("Conversation not found");
    if (conv.status !== "open") throw new Error("The customer ended this chat, so it can't be replied to.");

    const now = new Date();
    await tx.insert(conversationMessages).values({
      conversationId,
      tenantId: ctx.tenantId!,
      senderType: ctx.isPlatformAdmin ? "owner" : ctx.role,
      senderUserId: ctx.userId,
      senderName: sender?.name || sender?.email || "Staff",
      body: text,
      createdAt: now,
    });
    await tx
      .update(conversations)
      .set({ lastMessageAt: now, lastMessageBy: "business", businessLastReadAt: now })
      .where(eq(conversations.id, conversationId));
    return { id: conversationId };
  });
}
