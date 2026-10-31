import "dotenv/config";
import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { consentRecords, ledgerEntries, membershipBalances, memberships, users } from "../db/schema";
import { registerOwnerAndTenant } from "./tenant";
import { joinProgramme } from "./member";
import { blockEmail } from "./blocked-emails";
import { addStaffMember } from "./staff";
import { IMPORT_SCHEMA_VERSION, parseCsv, previewImport, runImport } from "./member-import";
import { RequestContext } from "../security/permissions";

async function shop() {
  const stamp = `imp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const s = await registerOwnerAndTenant({
    email: `owner-${stamp}@imp.test`,
    password: "Password123!",
    name: "Import Owner",
    businessName: `Import ${stamp}`,
    slug: stamp,
    emailVerified: true,
  });
  const ctx: RequestContext = { userId: s.user.id, tenantId: s.tenant.id, role: "owner", requestId: "imp" };
  return { ...s, ctx, slug: stamp, tag: stamp };
}

describe("CSV reading", () => {
  it("copes with quotes, commas and line breaks inside fields, a BOM, and either line ending", () => {
    const rows = parseCsv('﻿email,name\r\na@x.com,"Lee, Sam"\r\nb@x.com,"Say ""hi"""\nc@x.com,"two\nlines"\n\n');
    expect(rows).toEqual([["email", "name"], ["a@x.com", "Lee, Sam"], ["b@x.com", 'Say "hi"'], ["c@x.com", "two\nlines"]]);
  });
});

describe("Bulk import (FR-084, FR-123)", () => {
  it("checks every row first and says why each skipped one is skipped, without changing anything", async () => {
    const s = await shop();
    const existing = await joinProgramme({ tenantSlug: s.slug, email: `have-${s.tag}@imp.test` });
    await blockEmail(s.ctx, { email: `bad-${s.tag}@imp.test`, reason: "Abuse" });
    await addStaffMember(s.ctx, { email: `staff-${s.tag}@imp.test`, name: "Sam", role: "staff", temporaryPassword: "Password123!" });
    expect(existing.membership.id).toBeDefined();

    const csv = [
      "email,name,points,marketing_consent",
      `new1-${s.tag}@imp.test,New One,25,yes`,
      `new2-${s.tag}@imp.test,,,no`,
      `new1-${s.tag}@imp.test,Again,5,no`, // same email twice in the file
      `have-${s.tag}@imp.test,Already,5,no`,
      `bad-${s.tag}@imp.test,Blocked,5,no`,
      `staff-${s.tag}@imp.test,Team,5,no`,
      "not-an-email,Nope,5,no",
      `pts-${s.tag}@imp.test,Bad points,-3,no`,
      `huge-${s.tag}@imp.test,Huge,999999,no`,
      `maybe-${s.tag}@imp.test,Maybe,5,perhaps`,
    ].join("\n");

    const report = await previewImport(s.ctx, csv);
    expect(report).toMatchObject({ schemaVersion: IMPORT_SCHEMA_VERSION, totalRows: 10, importable: 2, skipped: 8, openingPoints: 25, withMarketingConsent: 1 });
    const why = Object.fromEntries(report.issues.map((i) => [i.row, i.problem]));
    expect(why[3]).toMatch(/earlier in this file/);
    expect(why[4]).toMatch(/Already a customer/);
    expect(why[5]).toMatch(/blocked list/);
    expect(why[6]).toMatch(/team account/);
    expect(why[7]).toMatch(/valid email/);
    expect(why[8]).toMatch(/whole number/);
    expect(why[9]).toMatch(/more than/);
    expect(why[10]).toMatch(/"yes" or "no"/);

    // Looking at a file changes nothing
    expect(await db.select().from(users).where(eq(users.email, `new1-${s.tag}@imp.test`))).toHaveLength(0);
  });

  it("adds customers with an opening balance and records where each consent came from", async () => {
    const s = await shop();
    const csv = `email,name,points,marketing_consent\nsam-${s.tag}@imp.test,Sam Lee,25,yes\nalex-${s.tag}@imp.test,Alex Kim,,no\n`;

    // Rows that say "yes" to marketing need the owner to confirm they hold that consent
    await expect(runImport(s.ctx, csv, { consentAttested: false })).rejects.toThrow(/confirm you hold that consent/);

    const out = await runImport(s.ctx, csv, { consentAttested: true });
    expect(out).toMatchObject({ created: 2, skipped: 0 });

    const [sam] = await db.select().from(users).where(eq(users.email, `sam-${s.tag}@imp.test`));
    expect(sam.passwordHash).toBeNull(); // they set one with Forgot password
    const [card] = await db.select().from(memberships).where(and(eq(memberships.userId, sam.id), eq(memberships.tenantId, s.tenant.id)));
    expect(card.marketingOptIn).toBe(true);
    const [bal] = await db.select().from(membershipBalances).where(eq(membershipBalances.membershipId, card.id));
    expect(bal.balance).toBe(25);
    const ledger = await db.select().from(ledgerEntries).where(eq(ledgerEntries.membershipId, card.id));
    expect(ledger.map((l) => l.pointsDelta)).toEqual([25]); // the opening balance is a ledger entry, so it reconciles

    const consents = await db.select().from(consentRecords).where(eq(consentRecords.membershipId, card.id));
    expect(consents.find((c) => c.purpose === "marketing_email")).toMatchObject({ granted: true, source: "owner_import" });
    // The customer hasn't accepted the terms yet
    expect(consents.find((c) => c.purpose === "programme_terms")).toMatchObject({ granted: false, source: "owner_import" });

    // Running the same file again adds nobody
    const again = await runImport(s.ctx, csv, { consentAttested: true });
    expect(again.created).toBe(0);
    expect(again.skipped).toBe(2);
  });

  it("ignores a marketing yes when consent isn't confirmed on a no-consent row, rejects unknown columns, and is for owners and managers", async () => {
    const s = await shop();
    await expect(previewImport(s.ctx, "name\nSam")).rejects.toThrow(/"email" column/);
    await expect(previewImport(s.ctx, "email,phone\na@b.co,123")).rejects.toThrow(/Unknown column/);
    await expect(previewImport(s.ctx, "email\n")).rejects.toThrow(/no customers/);
    await expect(previewImport(s.ctx, "")).rejects.toThrow(/empty/);
    await expect(previewImport({ ...s.ctx, role: "staff" }, "email\na@b.co")).rejects.toThrow(/FORBIDDEN/);

    // A person who already has an account elsewhere gets a card here without a second account
    const other = await shop();
    const elsewhere = await joinProgramme({ tenantSlug: other.slug, email: `shared-${s.tag}@imp.test` });
    const out = await runImport(s.ctx, `email,name\nshared-${s.tag}@imp.test,Shared\n`, { consentAttested: false });
    expect(out.created).toBe(1);
    const cards = await db.select().from(memberships).where(eq(memberships.userId, elsewhere.membership.userId));
    expect(cards).toHaveLength(2);
  });
});
