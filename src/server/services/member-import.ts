import crypto from "crypto";
import { assertGrowthAllowed } from "./billing";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { blockedEmails, consentRecords, ledgerEntries, membershipBalances, memberships, staffMembers, tenants, users } from "../db/schema";
import { RequestContext, assertCan } from "../security/permissions";
import { generateCrockfordCode } from "../qr";
import { logAuditEvent } from "./audit";
import { emitEvent } from "./events";

/** Version of the CSV layout. Bump it if the columns change, so an old file can be told apart. */
export const IMPORT_SCHEMA_VERSION = "loyalty_import_v1";
export const IMPORT_TEMPLATE = `email,name,points,marketing_consent\nsam@example.com,Sam Lee,25,yes\nalex@example.com,Alex Kim,,no\n`;
const MAX_ROWS = 2000;
const MAX_OPENING_POINTS = 100000;

export interface ImportIssue {
  row: number; // 1 = the first customer row
  email: string;
  problem: string;
}

interface ImportRow {
  row: number;
  email: string;
  name: string | null;
  points: number;
  marketing: boolean;
}

/** Reads CSV text: quoted fields, commas and line breaks inside quotes, either line ending, a leading BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const YES = new Set(["yes", "y", "true", "1"]);
const NO = new Set(["no", "n", "false", "0", ""]);

/** Checks a file without changing anything, and says what would happen to every row. */
export async function validateImport(ctx: RequestContext, csv: string) {
  assertCan(ctx, "member.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");
  const tenantId = ctx.tenantId;
  if (csv.length > 1_000_000) throw new Error("That file is too big. Split it into parts of up to 2,000 customers.");

  const table = parseCsv(csv);
  if (table.length === 0) throw new Error("The file is empty.");
  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  if (col("email") === -1) throw new Error(`The first row must be a header with an "email" column. Download the template to see the layout (${IMPORT_SCHEMA_VERSION}).`);
  const unknown = header.filter((h) => !["email", "name", "points", "marketing_consent"].includes(h));
  if (unknown.length > 0) throw new Error(`Unknown column${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}. Use only email, name, points, marketing_consent.`);
  const body = table.slice(1);
  if (body.length === 0) throw new Error("The file has a header but no customers.");
  if (body.length > MAX_ROWS) throw new Error(`Up to ${MAX_ROWS} customers at a time. This file has ${body.length}.`);

  const issues: ImportIssue[] = [];
  const valid: ImportRow[] = [];
  const seen = new Set<string>();
  const candidates: ImportRow[] = [];

  body.forEach((cells, i) => {
    const row = i + 1;
    const email = (cells[col("email")] ?? "").trim().toLowerCase();
    const name = col("name") === -1 ? null : (cells[col("name")] ?? "").trim() || null;
    const pointsRaw = col("points") === -1 ? "" : (cells[col("points")] ?? "").trim();
    const consentRaw = col("marketing_consent") === -1 ? "" : (cells[col("marketing_consent")] ?? "").trim().toLowerCase();
    const fail = (problem: string) => issues.push({ row, email, problem });

    if (!EMAIL.test(email) || email.length > 255) return fail("Not a valid email address");
    if (seen.has(email)) return fail("Appears earlier in this file");
    seen.add(email);
    if (name && name.length > 255) return fail("Name is too long");
    let points = 0;
    if (pointsRaw !== "") {
      if (!/^\d+$/.test(pointsRaw)) return fail("Points must be a whole number, 0 or more");
      points = parseInt(pointsRaw, 10);
      if (points > MAX_OPENING_POINTS) return fail(`Points can't be more than ${MAX_OPENING_POINTS.toLocaleString("en-GB")}`);
    }
    if (!YES.has(consentRaw) && !NO.has(consentRaw)) return fail('marketing_consent must be "yes" or "no" (or left empty)');
    candidates.push({ row, email, name, points, marketing: YES.has(consentRaw) });
  });

  // Look the rest up in a few queries rather than one per row
  const emails = candidates.map((c) => c.email);
  const existingUsers = emails.length ? await db.select({ id: users.id, email: users.email, isPlatformAdmin: users.isPlatformAdmin }).from(users).where(inArray(users.email, emails)) : [];
  const userByEmail = new Map(existingUsers.map((u) => [u.email, u]));
  const userIds = existingUsers.map((u) => u.id);
  const teamIds = new Set(
    userIds.length ? (await db.select({ userId: staffMembers.userId }).from(staffMembers).where(inArray(staffMembers.userId, userIds))).map((r) => r.userId) : []
  );
  const alreadyCustomers = new Set(
    userIds.length ? (await db.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.tenantId, tenantId), inArray(memberships.userId, userIds)))).map((r) => r.userId) : []
  );
  const blocked = new Set(emails.length ? (await db.select({ email: blockedEmails.email }).from(blockedEmails).where(and(eq(blockedEmails.tenantId, tenantId), inArray(blockedEmails.email, emails)))).map((r) => r.email) : []);

  for (const c of candidates) {
    const u = userByEmail.get(c.email);
    if (blocked.has(c.email)) issues.push({ row: c.row, email: c.email, problem: "This email is on your blocked list" });
    else if (u && (u.isPlatformAdmin || teamIds.has(u.id))) issues.push({ row: c.row, email: c.email, problem: "This email belongs to a team account, not a customer" });
    else if (u && alreadyCustomers.has(u.id)) issues.push({ row: c.row, email: c.email, problem: "Already a customer of yours" });
    else valid.push(c);
  }
  issues.sort((a, b) => a.row - b.row);

  return {
    schemaVersion: IMPORT_SCHEMA_VERSION,
    totalRows: body.length,
    importable: valid.length,
    skipped: issues.length,
    openingPoints: valid.reduce((n, r) => n + r.points, 0),
    withMarketingConsent: valid.filter((r) => r.marketing).length,
    issues,
    _valid: valid,
  };
}

/** The report as shown to the owner: without the internal list of rows to import. */
export async function previewImport(ctx: RequestContext, csv: string) {
  const { _valid, ...report } = await validateImport(ctx, csv);
  void _valid;
  return report;
}

/**
 * Adds the valid rows as customers. They get a card and, if the file said so, an opening balance. They are not
 * emailed and have no password: they set one with "Forgot password" when they first sign in. Marketing is only
 * switched on for rows marked "yes" and only if the owner confirms they hold that consent.
 */
export async function runImport(ctx: RequestContext, csv: string, options: { consentAttested: boolean }) {
  const report = await validateImport(ctx, csv);
  const tenantId = ctx.tenantId!;
  await assertGrowthAllowed(tenantId, "Importing customers");
  const [tenant] = await db.select({ status: tenants.status }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (tenant?.status !== "active") throw new Error("This business can't import customers right now.");
  if (report.withMarketingConsent > 0 && !options.consentAttested) {
    throw new Error("Some rows say \"yes\" to marketing. Tick the box to confirm you hold that consent, or change those rows to \"no\".");
  }

  let created = 0;
  const failures: ImportIssue[] = [...report.issues];
  for (const r of report._valid) {
    try {
      const membershipId = await db.transaction(async (tx) => {
        let [user] = await tx.select({ id: users.id }).from(users).where(eq(users.email, r.email)).limit(1);
        if (!user) [user] = await tx.insert(users).values({ email: r.email, name: r.name }).returning({ id: users.id });

        const [m] = await tx
          .insert(memberships)
          .values({
            tenantId,
            userId: user.id,
            memberNumber: generateCrockfordCode(8),
            publicId: `mem_${crypto.randomBytes(12).toString("hex")}`,
            marketingOptIn: r.marketing && options.consentAttested,
          })
          .returning({ id: memberships.id });

        await tx.insert(membershipBalances).values({ membershipId: m.id, tenantId, balance: r.points, lifetimeEarned: r.points, lifetimeRedeemed: 0 });
        if (r.points > 0) {
          await tx.insert(ledgerEntries).values({
            tenantId,
            membershipId: m.id,
            type: "adjust",
            pointsDelta: r.points,
            actorUserId: ctx.userId,
            reasonCode: "other",
            note: "Opening balance from customer import",
            idempotencyKey: `import-${m.id}`,
          });
        }
        // Where each consent came from (FR-084): the customer has not accepted the terms yet, and marketing is only
        // recorded as given when the owner confirmed they hold it
        await tx.insert(consentRecords).values({ tenantId, membershipId: m.id, purpose: "programme_terms", granted: false, textVersion: "1.0", source: "owner_import" });
        await tx.insert(consentRecords).values({ tenantId, membershipId: m.id, purpose: "marketing_email", granted: r.marketing && options.consentAttested, textVersion: "1.0", source: "owner_import" });
        return m.id;
      });
      created++;
      await emitEvent(tenantId, "membership.created", { membershipId, source: "import" });
    } catch (err) {
      // One bad row (for example a rare clash) must not stop the rest
      failures.push({ row: r.row, email: r.email, problem: err instanceof Error && /unique|duplicate/i.test(`${err.message} ${(err as { cause?: Error }).cause?.message ?? ""}`) ? "Could not be added (clash with an existing record)" : "Could not be added" });
    }
  }

  await logAuditEvent(ctx, {
    action: "members.imported",
    targetType: "tenant",
    targetId: tenantId,
    metadata: {
      schemaVersion: IMPORT_SCHEMA_VERSION,
      rows: report.totalRows,
      created,
      skipped: failures.length,
      openingPoints: report.openingPoints,
      marketingConsentAttested: options.consentAttested,
      fileFingerprint: crypto.createHash("sha256").update(csv).digest("hex").slice(0, 16),
    },
  });
  failures.sort((a, b) => a.row - b.row);
  return { schemaVersion: IMPORT_SCHEMA_VERSION, totalRows: report.totalRows, created, skipped: failures.length, issues: failures };
}

