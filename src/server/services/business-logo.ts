import { sql } from "drizzle-orm";
import { tenants } from "../db/schema";

/**
 * Business logos are stored in `tenants.logo_url` as a small, client-resized
 * data URL (PNG / JPEG / WebP only — SVG is rejected because it can carry script).
 * API responses never inline that data: they point at
 * /api/v1/public/tenants/:id/logo?v=<hash>, which streams the image with long-lived caching.
 * External http(s) URLs are passed through unchanged.
 */

export const MAX_LOGO_DATA_URL_LENGTH = 400_000; // ~300 KB of image data

const LOGO_DATA_URL_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;

export function validateLogoDataUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length > MAX_LOGO_DATA_URL_LENGTH) {
    throw new Error("LOGO_TOO_LARGE: Logo must be smaller than 300 KB after resizing");
  }
  if (!LOGO_DATA_URL_RE.test(trimmed)) {
    throw new Error("LOGO_INVALID: Logo must be a PNG, JPEG or WebP image");
  }
  return trimmed;
}

/**
 * Selects a lightweight logo reference instead of the full data URL:
 * "v:<hash>" for stored images, the URL itself for external links, or null.
 */
export const logoRefSql = sql<string | null>`CASE
  WHEN ${tenants.logoUrl} IS NULL OR ${tenants.logoUrl} = '' THEN NULL
  WHEN ${tenants.logoUrl} LIKE 'data:%' THEN 'v:' || left(md5(${tenants.logoUrl}), 12)
  ELSE ${tenants.logoUrl}
END`;

export function resolveLogoUrl(tenantId: string, logoRef: string | null | undefined): string | null {
  if (!logoRef) return null;
  if (logoRef.startsWith("v:")) {
    return `/api/v1/public/tenants/${tenantId}/logo?v=${logoRef.slice(2)}`;
  }
  if (logoRef.startsWith("data:")) {
    // Raw data URL slipped through a query that didn't use logoRefSql
    return `/api/v1/public/tenants/${tenantId}/logo`;
  }
  return /^https?:\/\//i.test(logoRef) ? logoRef : null;
}

export function decodeLogoDataUrl(dataUrl: string): { contentType: string; body: Buffer } | null {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!match) return null;
  return { contentType: match[1], body: Buffer.from(match[2], "base64") };
}
