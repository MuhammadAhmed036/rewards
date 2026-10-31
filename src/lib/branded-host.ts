/**
 * Working out which business a web address belongs to (FR-014). Two kinds:
 *  - a subdomain of the platform's own domain: ahmed-coffee.example.com  ->  the shop "ahmed-coffee"
 *  - a domain the shop owns and has proved: shop.ahmed.com  ->  looked up in the database
 * Pure functions, so the same rules run in the edge middleware and in tests.
 */

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/** Lower-cases a host and drops any port. */
export function cleanHost(host: string | null | undefined): string {
  return (host ?? "").toLowerCase().trim().replace(/:\d+$/, "").replace(/\.$/, "");
}

/** The shop slug when `host` is `<slug>.<rootDomain>`; null for the main site, `www`, and anything else. */
export function slugFromSubdomain(host: string, rootDomain: string | undefined): string | null {
  const root = cleanHost(rootDomain);
  const h = cleanHost(host);
  if (!root || !h.endsWith(`.${root}`)) return null;
  const label = h.slice(0, -(root.length + 1));
  if (label.includes(".") || label === "www" || label === "app" || label === "api" || !SLUG.test(label)) return null;
  return label;
}

/** Hosts that are the platform itself: never treated as a shop's own domain. */
export function isPlatformHost(host: string, platformHosts: Array<string | undefined>, rootDomain?: string): boolean {
  const h = cleanHost(host);
  if (!h || h === "localhost" || h === "127.0.0.1" || h.endsWith(".localhost")) return true;
  if (platformHosts.some((p) => cleanHost(p) === h)) return true;
  const root = cleanHost(rootDomain);
  return Boolean(root && (h === root || h === `www.${root}`));
}

/** Host name from a full address or a bare host, for building the list of platform hosts. */
export function hostOf(urlOrHost: string | undefined): string | undefined {
  if (!urlOrHost) return undefined;
  try {
    return new URL(urlOrHost.includes("://") ? urlOrHost : `https://${urlOrHost}`).hostname;
  } catch {
    return undefined;
  }
}

const DOMAIN = /^(?=.{4,253}$)(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/;

/** A web address a shop could own: letters, numbers, hyphens and dots, with a proper ending. Not an IP, not a path. */
export function normaliseDomain(input: string): string {
  const d = cleanHost(input.replace(/^https?:\/\//i, "").split("/")[0]);
  if (!DOMAIN.test(d)) throw new Error("Enter a web address like shop.example.com (no https:// or path).");
  return d;
}
