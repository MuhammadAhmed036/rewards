import crypto from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "../db";
import { apiKeys, externalTransactions, memberships, tenants } from "../db/schema";
import { RequestContext, assertCan } from "../security/permissions";
import { assertRateLimit } from "../security/rate-limit";
import { verifyAnyMemberQrToken } from "../qr";
import { logAuditEvent } from "./audit";
import { earn } from "./ledger";

export const API_SCOPES = ["earn:write", "events:read"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

const hashKey = (key: string) => crypto.createHash("sha256").update(key).digest("hex");

export async function listApiKeys(ctx: RequestContext) {
  assertCan(ctx, "tenant.manage");
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      scopes: apiKeys.scopes,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.tenantId, ctx.tenantId!))
    .orderBy(desc(apiKeys.createdAt));
}

/** Makes a key. The full key is returned once and only its hash is kept. */
export async function createApiKey(ctx: RequestContext, params: { name: string; scopes: string[]; expiresInDays?: number }) {
  assertCan(ctx, "tenant.manage");
  const name = params.name.trim();
  if (!name) throw new Error("Give the key a name, like 'Front till'.");
  const scopes = params.scopes.filter((s): s is ApiScope => (API_SCOPES as readonly string[]).includes(s));
  if (scopes.length === 0) throw new Error("Choose what this key may do.");
  const active = await db.select({ id: apiKeys.id }).from(apiKeys).where(and(eq(apiKeys.tenantId, ctx.tenantId!), isNull(apiKeys.revokedAt)));
  if (active.length >= 10) throw new Error("You can have up to 10 active keys. Revoke one first.");

  const key = `lk_live_${crypto.randomBytes(24).toString("hex")}`;
  const expiresAt = params.expiresInDays ? new Date(Date.now() + params.expiresInDays * 86400_000) : null;
  const [row] = await db
    .insert(apiKeys)
    .values({ tenantId: ctx.tenantId!, name, prefix: key.slice(0, 16), keyHash: hashKey(key), scopes, createdBy: ctx.userId, expiresAt })
    .returning();
  await logAuditEvent(ctx, { action: "api_key.created", targetType: "api_key", targetId: row.id, metadata: { name, scopes } });
  return { id: row.id, name, scopes, expiresAt, key };
}

export async function revokeApiKey(ctx: RequestContext, id: string) {
  assertCan(ctx, "tenant.manage");
  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.tenantId, ctx.tenantId!)))
    .returning();
  if (!row) throw new Error("That key doesn't exist.");
  await logAuditEvent(ctx, { action: "api_key.revoked", targetType: "api_key", targetId: id });
  return { revoked: true };
}

export class ApiKeyError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

/** Checks the bearer key on a request: it must exist, be live, and carry the scope. Limited to 120 calls a minute. */
export async function authenticateApiKey(request: NextRequest, scope: ApiScope) {
  const header = request.headers.get("authorization");
  const key = header?.startsWith("Bearer lk_") ? header.slice(7).trim() : null;
  if (!key) throw new ApiKeyError(401, "UNAUTHORIZED", "Send your key as 'Authorization: Bearer lk_...'.");
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hashKey(key))).limit(1);
  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt < new Date())) throw new ApiKeyError(401, "UNAUTHORIZED", "That key isn't valid.");
  if (!(row.scopes as string[]).includes(scope)) throw new ApiKeyError(403, "FORBIDDEN", `This key can't do that (needs ${scope}).`);
  await assertRateLimit(`apikey:${row.id}`, 120, 60, "RATE_LIMITED: Too many requests. Slow down.");
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id));
  return row;
}

/**
 * A till or POS reports a sale (UC-17). The same `externalRef` can only earn once, so a retried request
 * returns the first result instead of paying twice. Points always come from the business's own rules.
 */
export async function earnFromExternalSale(
  key: typeof apiKeys.$inferSelect,
  input: { memberNumber?: string; qrToken?: string; locationId: string; amountMinor: number; tipMinor?: number; externalRef: string }
) {
  const tenantId = key.tenantId;
  const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new ApiKeyError(404, "NOT_FOUND", "Business not found.");

  // Find the customer by member number, or by their signed QR code
  let membershipId: string | null = null;
  if (input.qrToken) {
    const check = verifyAnyMemberQrToken(input.qrToken);
    if (check.valid && check.membershipPublicId) {
      const [m] = await db.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.publicId, check.membershipPublicId), eq(memberships.tenantId, tenantId))).limit(1);
      membershipId = m?.id ?? null;
    }
  } else if (input.memberNumber) {
    const [m] = await db.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.memberNumber, input.memberNumber.toUpperCase().trim()), eq(memberships.tenantId, tenantId))).limit(1);
    membershipId = m?.id ?? null;
  }
  if (!membershipId) throw new ApiKeyError(404, "MEMBER_NOT_FOUND", "No customer matches that member number or QR code at this business.");

  const idempotencyKey = `pos:${key.name}:${input.externalRef}`.slice(0, 250);
  // Acts as a manager on this business, tied to whoever made the key, so the ledger shows where it came from
  const ctx: RequestContext = { userId: key.createdBy!, tenantId, role: "manager", requestId: `api-key:${key.id}` };
  const result = await earn(ctx, { membershipId, locationId: input.locationId, amountMinor: input.amountMinor, tipMinor: input.tipMinor, idempotencyKey });

  await db
    .insert(externalTransactions)
    .values({ tenantId, source: key.name, externalRef: input.externalRef, ledgerEntryId: result.entryId })
    .onConflictDoNothing();
  return result;
}
