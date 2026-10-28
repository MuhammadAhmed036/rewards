import "dotenv/config";
import { describe, it, expect } from "vitest";
import { registerOwnerAndTenant } from "./tenant";
import { joinProgramme } from "./member";
import { addStaffMember } from "./staff";
import {
  sendCustomerMessage,
  getCustomerConversations,
  endCustomerConversation,
  listBusinessConversations,
  getBusinessConversation,
  replyAsBusiness,
  countUnreadBusinessConversations,
} from "./conversations";
import { purgeTenantByAdmin, updateTenantByAdmin } from "./admin";
import { RequestContext } from "../security/permissions";
import { db } from "../db";
import { tenants, ledgerEntries, conversationMessages, users } from "../db/schema";
import { eq } from "drizzle-orm";
import { earn } from "./ledger";

async function setupShop(tag: string) {
  const stamp = `${tag}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const shop = await registerOwnerAndTenant({
    email: `owner-${stamp}@chat.test`,
    password: "Password123!",
    name: "Chat Owner",
    businessName: `Chat Cafe ${stamp}`,
    slug: stamp,
  });
  const ownerCtx: RequestContext = { userId: shop.user.id, tenantId: shop.tenant.id, role: "owner", requestId: "chat" };
  const staff = await addStaffMember(ownerCtx, { email: `staff-${stamp}@chat.test`, name: "Sam Staff", role: "staff", temporaryPassword: "Password123!" });
  const staffCtx: RequestContext = { userId: staff.userId, tenantId: shop.tenant.id, role: "staff", requestId: "chat-staff" };
  const customer = await joinProgramme({ tenantSlug: stamp, email: `cust-${stamp}@chat.test`, name: "Cara Customer" });
  return { shop, ownerCtx, staffCtx, customer, slug: stamp };
}

describe("Customer <-> shop chat", () => {
  it("lets staff and the owner see and answer a customer's message", async () => {
    const { shop, ownerCtx, staffCtx, customer } = await setupShop("chat-flow");
    const m = customer.membership;

    await sendCustomerMessage(shop.tenant.id, m.id, m.userId, "Hi, my stamp didn't land yesterday");
    expect(await countUnreadBusinessConversations(staffCtx)).toBe(1);

    const staffList = await listBusinessConversations(staffCtx, "open");
    expect(staffList).toHaveLength(1);
    expect(staffList[0].customerName).toBe("Cara Customer");
    expect(staffList[0].unread).toBe(true);
    expect((await listBusinessConversations(ownerCtx, "open"))[0].id).toBe(staffList[0].id);

    await replyAsBusiness(staffCtx, staffList[0].id, "Sorry about that, I've added it now");
    await replyAsBusiness(ownerCtx, staffList[0].id, "Owner here, all sorted");
    expect(await countUnreadBusinessConversations(ownerCtx)).toBe(0);

    const mine = await getCustomerConversations(shop.tenant.id, m.id);
    expect(mine.active?.messages.map((x) => x.from)).toEqual(["customer", "business", "business"]);
    expect(mine.active?.messages[1].senderType).toBe("staff");
    expect(mine.active?.messages[2].senderType).toBe("owner");
  });

  it("only the customer can end a chat; afterwards the shop keeps a read-only copy", async () => {
    const { shop, ownerCtx, staffCtx, customer } = await setupShop("chat-end");
    const m = customer.membership;
    await sendCustomerMessage(shop.tenant.id, m.id, m.userId, "Question about rewards");
    const convId = (await listBusinessConversations(staffCtx, "open"))[0].id;

    // There is no business-side "end" — the service simply doesn't offer one — and a different card can't end it
    const other = await joinProgramme({ tenantSlug: (await db.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, shop.tenant.id)))[0].slug, email: `other-${Date.now()}@chat.test` });
    await expect(endCustomerConversation(shop.tenant.id, other.membership.id, other.membership.userId, convId)).rejects.toThrow();

    await endCustomerConversation(shop.tenant.id, m.id, m.userId, convId);
    await expect(replyAsBusiness(ownerCtx, convId, "Anything else?")).rejects.toThrow(/ended this chat/);

    const closed = await listBusinessConversations(staffCtx, "closed");
    expect(closed.map((c) => c.id)).toContain(convId);
    const record = await getBusinessConversation(staffCtx, convId);
    expect(record.status).toBe("closed");
    expect(record.messages).toHaveLength(1);

    // Writing again starts a fresh chat
    await sendCustomerMessage(shop.tenant.id, m.id, m.userId, "One more thing");
    const mine = await getCustomerConversations(shop.tenant.id, m.id);
    expect(mine.active?.id).not.toBe(convId);
    expect(mine.past.map((c) => c.id)).toContain(convId);
  });

  it("keeps each shop's chats to itself and rejects empty messages", async () => {
    const a = await setupShop("chat-iso-a");
    const b = await setupShop("chat-iso-b");
    await sendCustomerMessage(a.shop.tenant.id, a.customer.membership.id, a.customer.membership.userId, "For shop A");
    const convA = (await listBusinessConversations(a.staffCtx, "open"))[0].id;

    expect(await listBusinessConversations(b.ownerCtx, "all")).toHaveLength(0);
    await expect(getBusinessConversation(b.ownerCtx, convA)).rejects.toThrow(/not found/);
    await expect(replyAsBusiness(b.staffCtx, convA, "hi")).rejects.toThrow(/not found/);
    await expect(sendCustomerMessage(a.shop.tenant.id, a.customer.membership.id, a.customer.membership.userId, "   ")).rejects.toThrow();
  });
});

describe("Permanently deleting a business", () => {
  it("requires suspension and the exact name, then removes the business, its points history and chats", async () => {
    const { shop, ownerCtx, customer, slug } = await setupShop("purge");
    const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.isPlatformAdmin, true)).limit(1);
    const adminCtx: RequestContext = { userId: admin.id, role: "platform_admin", isPlatformAdmin: true, requestId: "purge" };

    await earn(ownerCtx, {
      membershipId: customer.membership.id,
      locationId: shop.location.id,
      amountMinor: 1000,
      idempotencyKey: `purge-earn-${slug}`,
    });
    await sendCustomerMessage(shop.tenant.id, customer.membership.id, customer.membership.userId, "Hello");

    await expect(purgeTenantByAdmin(adminCtx, shop.tenant.id, { confirmName: shop.tenant.name, reason: "Closed down" })).rejects.toThrow(/Suspend/);
    await updateTenantByAdmin(adminCtx, shop.tenant.id, { status: "suspended", reason: "Closing" });
    await expect(purgeTenantByAdmin(adminCtx, shop.tenant.id, { confirmName: "wrong name", reason: "Closed down" })).rejects.toThrow(/exactly/);

    await purgeTenantByAdmin(adminCtx, shop.tenant.id, { confirmName: shop.tenant.name, reason: "Business closed down" });
    expect(await db.select().from(tenants).where(eq(tenants.id, shop.tenant.id))).toHaveLength(0);
    expect(await db.select().from(ledgerEntries).where(eq(ledgerEntries.tenantId, shop.tenant.id))).toHaveLength(0);
    expect(await db.select().from(conversationMessages).where(eq(conversationMessages.tenantId, shop.tenant.id))).toHaveLength(0);
  });

  it("still refuses ledger deletes outside an admin purge", async () => {
    const [row] = await db.select({ id: ledgerEntries.id }).from(ledgerEntries).limit(1);
    expect(row).toBeDefined();
    await expect(db.delete(ledgerEntries).where(eq(ledgerEntries.id, row.id))).rejects.toThrow();
  });
});
