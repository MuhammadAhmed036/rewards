import { db } from "../db";
import { businessLinks, linkClickEvents } from "../db/schema";
import { RequestContext, assertCan } from "../security/permissions";
import { eq, and, sql, asc, gte, lte } from "drizzle-orm";
import { logAuditEvent } from "./audit";

export type LinkType = "google_review" | "instagram" | "facebook" | "website" | "other";

const ALLOWED_GOOGLE_DOMAINS = [
  "google.com",
  "www.google.com",
  "g.page",
  "maps.app.goo.gl",
  "goo.gl",
  "search.google.com",
  "g.co",
];

const ALLOWED_INSTAGRAM_DOMAINS = ["instagram.com", "www.instagram.com"];
const ALLOWED_FACEBOOK_DOMAINS = ["facebook.com", "www.facebook.com", "fb.com", "fb.me"];

/**
 * Strict server-side URL validator per Section 11.1
 */
export function validateLinkUrl(type: LinkType, urlString: string): { valid: boolean; error?: string } {
  if (!urlString || typeof urlString !== "string") {
    return { valid: false, error: "URL is required" };
  }

  const trimmed = urlString.trim();
  if (trimmed.length > 2048) {
    return { valid: false, error: "URL exceeds maximum length" };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: "Malformed URL" };
  }

  if (parsed.protocol !== "https:") {
    return { valid: false, error: "URL must use https" };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, error: "URL credentials are forbidden" };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (type === "google_review") {
    const isAllowed = ALLOWED_GOOGLE_DOMAINS.some(
      (d) => hostname === d || hostname.endsWith("." + d)
    );
    if (!isAllowed) {
      return {
        valid: false,
        error: "Google review link must belong to google.com, g.page, goo.gl, or maps.app.goo.gl",
      };
    }
  } else if (type === "instagram") {
    const isAllowed = ALLOWED_INSTAGRAM_DOMAINS.some(
      (d) => hostname === d || hostname.endsWith("." + d)
    );
    if (!isAllowed) {
      return { valid: false, error: "Instagram link must belong to instagram.com" };
    }
  } else if (type === "facebook") {
    const isAllowed = ALLOWED_FACEBOOK_DOMAINS.some(
      (d) => hostname === d || hostname.endsWith("." + d)
    );
    if (!isAllowed) {
      return { valid: false, error: "Facebook link must belong to facebook.com or fb.me" };
    }
  }

  return { valid: true };
}

/**
 * NON-NEGOTIABLE ANTI-GATING RULE (Section 1.2 & 11.2):
 * Its signature must NOT accept any membership, feedback, rating, sentiment, points, or tier input.
 * Every member of a tenant sees the exact same set of enabled links.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getVisibleLinks(tenantId: string, _locationId?: string) {
  // Arity and signature check enforced in automated tests
  const query = db
    .select({
      id: businessLinks.id,
      type: businessLinks.type,
      label: businessLinks.label,
      url: businessLinks.url,
      sortOrder: businessLinks.sortOrder,
    })
    .from(businessLinks)
    .where(
      and(
        eq(businessLinks.tenantId, tenantId),
        eq(businessLinks.enabled, true)
      )
    )
    .orderBy(asc(businessLinks.sortOrder));

  return await query;
}

export async function getAllTenantLinks(tenantId: string) {
  return await db
    .select()
    .from(businessLinks)
    .where(eq(businessLinks.tenantId, tenantId))
    .orderBy(asc(businessLinks.sortOrder));
}

export interface UpdateLinkInput {
  type: LinkType;
  label: string;
  url: string;
  enabled: boolean;
  sortOrder: number;
  locationId?: string;
}

export async function updateBusinessLinks(ctx: RequestContext, links: UpdateLinkInput[]) {
  assertCan(ctx, "links.manage");
  if (!ctx.tenantId) throw new Error("tenantId required");

  for (const l of links) {
    if (l.enabled) {
      const val = validateLinkUrl(l.type, l.url);
      if (!val.valid) {
        throw new Error(`Invalid URL for ${l.label}: ${val.error}`);
      }
    }
  }

  return await db.transaction(async (tx) => {
    // Delete existing and replace with validated set
    await tx.delete(businessLinks).where(eq(businessLinks.tenantId, ctx.tenantId!));

    const inserted = await tx
      .insert(businessLinks)
      .values(
        links.map((l) => ({
          tenantId: ctx.tenantId!,
          type: l.type,
          label: l.label,
          url: l.url,
          enabled: l.enabled,
          sortOrder: l.sortOrder,
          locationId: l.locationId || null,
          updatedBy: ctx.userId,
          updatedAt: new Date(),
        }))
      )
      .returning();

    await logAuditEvent(
      ctx,
      {
        action: "links.updated",
        targetType: "business_links",
        targetId: ctx.tenantId!,
        metadata: { count: links.length },
      },
      tx
    );

    return inserted;
  });
}

/**
 * Tracked Redirect Handler logic per Section 11.3:
 * Records link click event with NO IP and NO raw user agent.
 */
export async function recordLinkClick(
  linkId: string,
  options: {
    membershipId?: string;
    locationId?: string;
    rawUserAgent?: string;
  } = {}
): Promise<string> {
  const [link] = await db
    .select()
    .from(businessLinks)
    .where(and(eq(businessLinks.id, linkId), eq(businessLinks.enabled, true)))
    .limit(1);

  if (!link) {
    throw new Error("Link not found or disabled");
  }

  // Sanitise User Agent family (No raw UA string, no IP stored per privacy specs)
  let userAgentFamily = "Other";
  if (options.rawUserAgent) {
    const ua = options.rawUserAgent.toLowerCase();
    if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) {
      userAgentFamily = "Mobile";
    } else if (ua.includes("macintosh") || ua.includes("windows") || ua.includes("linux")) {
      userAgentFamily = "Desktop";
    }
  }

  await db.insert(linkClickEvents).values({
    tenantId: link.tenantId,
    linkId: link.id,
    membershipId: options.membershipId || null,
    locationId: options.locationId || link.locationId || null,
    source: "hub",
    userAgentFamily,
  });

  return link.url;
}

export async function getLinkClickAnalytics(
  ctx: RequestContext,
  params: { from?: Date; to?: Date } = {}
) {
  assertCan(ctx, "analytics.view");
  if (!ctx.tenantId) throw new Error("tenantId required");

  const conditions = [eq(linkClickEvents.tenantId, ctx.tenantId!)];
  if (params.from) conditions.push(gte(linkClickEvents.clickedAt, params.from));
  if (params.to) conditions.push(lte(linkClickEvents.clickedAt, params.to));

  const stats = await db
    .select({
      linkId: linkClickEvents.linkId,
      linkType: businessLinks.type,
      linkLabel: businessLinks.label,
      totalClicks: sql<number>`count(*)::int`,
      uniqueMembers: sql<number>`count(distinct ${linkClickEvents.membershipId})::int`,
    })
    .from(linkClickEvents)
    .innerJoin(businessLinks, eq(linkClickEvents.linkId, businessLinks.id))
    .where(and(...conditions))
    .groupBy(linkClickEvents.linkId, businessLinks.type, businessLinks.label);

  return stats;
}
