import crypto from "crypto";
import dns from "dns/promises";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { tenants } from "../db/schema";
import { RequestContext, assertCan } from "../security/permissions";
import { cleanHost, hostOf, isPlatformHost, normaliseDomain } from "@/lib/branded-host";
import { logAuditEvent } from "./audit";

/** What the shop adds to its DNS: a TXT record to prove it owns the name, and a CNAME to point the name at us. */
const cnameTarget = () => process.env.CUSTOM_DOMAIN_CNAME_TARGET || "cname.vercel-dns.com";
const txtName = (domain: string) => `_loyalty-verify.${domain}`;

function platformHosts() {
  return [hostOf(process.env.APP_URL), hostOf(process.env.NEXT_PUBLIC_APP_URL), process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL];
}

export async function getDomainSettings(ctx: RequestContext) {
  assertCan(ctx, "tenant.manage");
  const [t] = await db
    .select({ slug: tenants.slug, domain: tenants.customDomain, token: tenants.customDomainToken, verifiedAt: tenants.customDomainVerifiedAt })
    .from(tenants)
    .where(eq(tenants.id, ctx.tenantId!))
    .limit(1);
  const root = process.env.ROOT_DOMAIN;
  return {
    subdomain: root ? `${t.slug}.${cleanHost(root)}` : null,
    domain: t.domain,
    verified: Boolean(t.verifiedAt),
    // What to add at the domain provider
    records: t.domain && t.token ? { txt: { name: txtName(t.domain), value: t.token }, cname: { name: t.domain, value: cnameTarget() } } : null,
  };
}

/** Chooses the shop's own web address. It only starts working once the DNS record proves it is theirs. */
export async function setCustomDomain(ctx: RequestContext, input: string) {
  assertCan(ctx, "tenant.manage");
  const domain = normaliseDomain(input);
  if (isPlatformHost(domain, platformHosts(), process.env.ROOT_DOMAIN) || domain.endsWith(`.${cleanHost(process.env.ROOT_DOMAIN)}`)) {
    throw new Error("That address belongs to this platform. Enter a domain you own.");
  }
  const [taken] = await db.select({ id: tenants.id }).from(tenants).where(and(eq(tenants.customDomain, domain))).limit(1);
  if (taken && taken.id !== ctx.tenantId) throw new Error("That address is already used by another business.");

  const token = `loyalty-verify-${crypto.randomBytes(16).toString("hex")}`;
  await db.update(tenants).set({ customDomain: domain, customDomainToken: token, customDomainVerifiedAt: null }).where(eq(tenants.id, ctx.tenantId!));
  await logAuditEvent(ctx, { action: "tenant.domain_set", targetType: "tenant", targetId: ctx.tenantId!, metadata: { domain } });
  return getDomainSettings(ctx);
}

/** Looks for the TXT record. Only a verified domain is ever served. */
export async function verifyCustomDomain(ctx: RequestContext) {
  assertCan(ctx, "tenant.manage");
  const [t] = await db.select({ domain: tenants.customDomain, token: tenants.customDomainToken }).from(tenants).where(eq(tenants.id, ctx.tenantId!)).limit(1);
  if (!t?.domain || !t.token) throw new Error("Choose your address first.");
  let found = false;
  try {
    const records = await dns.resolveTxt(txtName(t.domain));
    found = records.some((parts) => parts.join("") === t.token);
  } catch {
    found = false;
  }
  if (!found) {
    throw new Error(`We couldn't find the verification record yet. Add a TXT record named ${txtName(t.domain)} with the value shown, wait a few minutes, and try again.`);
  }
  await db.update(tenants).set({ customDomainVerifiedAt: new Date() }).where(eq(tenants.id, ctx.tenantId!));
  await logAuditEvent(ctx, { action: "tenant.domain_verified", targetType: "tenant", targetId: ctx.tenantId!, metadata: { domain: t.domain } });
  const hosting = await addToHosting(t.domain);
  return { ...(await getDomainSettings(ctx)), hosting };
}

export async function removeCustomDomain(ctx: RequestContext) {
  assertCan(ctx, "tenant.manage");
  await db.update(tenants).set({ customDomain: null, customDomainToken: null, customDomainVerifiedAt: null }).where(eq(tenants.id, ctx.tenantId!));
  await logAuditEvent(ctx, { action: "tenant.domain_removed", targetType: "tenant", targetId: ctx.tenantId! });
  return getDomainSettings(ctx);
}

/**
 * If the platform has a Vercel API token, add the verified domain to the project so the certificate is issued
 * automatically. Without one, the platform team adds it by hand in the Vercel dashboard.
 */
async function addToHosting(domain: string): Promise<{ added: boolean; note: string }> {
  const token = process.env.VERCEL_API_TOKEN;
  const project = process.env.VERCEL_PROJECT_ID;
  if (!token || !project) return { added: false, note: "The platform team needs to add this domain in the hosting dashboard before it works." };
  try {
    const team = process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : "";
    const res = await fetch(`https://api.vercel.com/v10/projects/${project}/domains${team}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: domain }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok || res.status === 409) return { added: true, note: "Added to hosting. It can take a few minutes for the secure certificate." };
    return { added: false, note: "The hosting service didn't accept it. The platform team will add it by hand." };
  } catch {
    return { added: false, note: "Couldn't reach the hosting service. The platform team will add it by hand." };
  }
}

/** The shop that owns a verified domain, or null. Used by the page that serves branded addresses. */
export async function slugForVerifiedDomain(host: string): Promise<string | null> {
  const h = cleanHost(host);
  if (!h) return null;
  const [t] = await db.select({ slug: tenants.slug, verifiedAt: tenants.customDomainVerifiedAt, status: tenants.status }).from(tenants).where(eq(tenants.customDomain, h)).limit(1);
  return t && t.verifiedAt && t.status === "active" ? t.slug : null;
}
