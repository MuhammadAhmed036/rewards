import "dotenv/config";
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { memberships } from "../db/schema";
import { registerOwnerAndTenant } from "./tenant";
import { joinProgramme } from "./member";
import { blockEmail, listBlockedEmails, unblockEmail } from "./blocked-emails";
import { earn } from "./ledger";
import { RequestContext } from "../security/permissions";

async function shop() {
  const stamp = `blk-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const s = await registerOwnerAndTenant({
    email: `owner-${stamp}@blk.test`,
    password: "Password123!",
    name: "Blocker",
    businessName: `Block ${stamp}`,
    slug: stamp,
    emailVerified: true,
  });
  const ctx: RequestContext = { userId: s.user.id, tenantId: s.tenant.id, role: "owner", requestId: "blk" };
  return { ...s, ctx, slug: stamp, ownerEmail: `owner-${stamp}@blk.test` };
}

describe("Blocked emails (FR-083)", () => {
  it("stops a blocked email joining, suspends its existing card, and lets it back in after unblocking", async () => {
    const s = await shop();
    const email = `abuser-${Date.now()}@blk.test`;
    const joined = await joinProgramme({ tenantSlug: s.slug, email });

    const result = await blockEmail(s.ctx, { email: email.toUpperCase(), reason: "Fake purchases" });
    expect(result.cardSuspended).toBe(true);
    const [card] = await db.select().from(memberships).where(eq(memberships.id, joined.membership.id));
    expect(card.status).toBe("suspended");
    await expect(
      earn(s.ctx, { membershipId: joined.membership.id, locationId: s.location.id, amountMinor: 500, idempotencyKey: crypto.randomUUID() })
    ).rejects.toThrow(/MEMBERSHIP_SUSPENDED/);

    // A brand-new signup with the blocked email is refused
    await expect(joinProgramme({ tenantSlug: s.slug, email })).rejects.toThrow(/EMAIL_BLOCKED/);

    const list = await listBlockedEmails(s.ctx);
    expect(list).toHaveLength(1);
    expect(list[0].email).toBe(email);

    await unblockEmail(s.ctx, list[0].id);
    expect(await listBlockedEmails(s.ctx)).toHaveLength(0);
    // Back on the normal path: the account exists, so they join with it (and the card stays suspended until reactivated)
    await expect(joinProgramme({ tenantSlug: s.slug, email, allowExistingUser: true })).resolves.toBeDefined();
  });

  it("applies to one business only, needs a reason, and won't block the owner's own email", async () => {
    const a = await shop();
    const b = await shop();
    const email = `shared-${Date.now()}@blk.test`;
    await blockEmail(a.ctx, { email, reason: "Abuse" });

    await expect(joinProgramme({ tenantSlug: a.slug, email })).rejects.toThrow(/EMAIL_BLOCKED/);
    await expect(joinProgramme({ tenantSlug: b.slug, email })).resolves.toBeDefined();

    await expect(blockEmail(a.ctx, { email: `x-${Date.now()}@blk.test`, reason: "  " })).rejects.toThrow(/why/);
    await expect(blockEmail(a.ctx, { email: a.ownerEmail, reason: "Oops" })).rejects.toThrow(/your own email/);
    // Another business can't remove this business's block
    const [entry] = await listBlockedEmails(a.ctx);
    await expect(unblockEmail(b.ctx, entry.id)).rejects.toThrow(/isn't on your blocked list/);
  });
});

describe("Same Gmail inbox, different spelling (FR-006)", () => {
  it("won't open a second account for a dotted or plus-tagged version of an existing Gmail address", async () => {
    const s = await shop();
    const tag = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    await joinProgramme({ tenantSlug: s.slug, email: `sam.lee${tag}@gmail.com` });

    await expect(joinProgramme({ tenantSlug: s.slug, email: `samlee${tag}@gmail.com` })).rejects.toThrow(/DUPLICATE_ACCOUNT/);
    await expect(joinProgramme({ tenantSlug: s.slug, email: `sam.lee${tag}+cafe@gmail.com` })).rejects.toThrow(/same inbox/);
    await expect(joinProgramme({ tenantSlug: s.slug, email: `samlee${tag}@googlemail.com` })).rejects.toThrow(/DUPLICATE_ACCOUNT/);
    // Other providers are never collapsed, and a different person is fine
    await expect(joinProgramme({ tenantSlug: s.slug, email: `sam.lee${tag}@example.com` })).resolves.toBeDefined();
    await expect(joinProgramme({ tenantSlug: s.slug, email: `sam.other${tag}@gmail.com` })).resolves.toBeDefined();
  });
});
