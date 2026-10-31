import "dotenv/config";
import dns from "dns/promises";
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { tenants } from "../db/schema";
import { registerOwnerAndTenant } from "./tenant";
import { getDomainSettings, removeCustomDomain, setCustomDomain, slugForVerifiedDomain, verifyCustomDomain } from "./custom-domain";
import { cleanHost, isPlatformHost, normaliseDomain, slugFromSubdomain } from "@/lib/branded-host";
import { GET as lookupRoute } from "@/app/api/internal/domain/route";
import { middleware } from "@/middleware";
import { RequestContext } from "../security/permissions";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.ROOT_DOMAIN;
});

async function shop() {
  const stamp = `dom-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const s = await registerOwnerAndTenant({ email: `owner-${stamp}@dom.test`, password: "Password123!", name: "Dom Owner", businessName: `Dom ${stamp}`, slug: stamp, emailVerified: true });
  const ctx: RequestContext = { userId: s.user.id, tenantId: s.tenant.id, role: "owner", requestId: "dom" };
  return { ...s, ctx, slug: stamp, tag: stamp };
}

describe("Reading addresses", () => {
  it("finds the shop in a subdomain, and ignores the main site, www and nested names", () => {
    expect(slugFromSubdomain("ahmed-coffee.example.com", "example.com")).toBe("ahmed-coffee");
    expect(slugFromSubdomain("Ahmed-Coffee.Example.com:3000", "example.com")).toBe("ahmed-coffee");
    expect(slugFromSubdomain("example.com", "example.com")).toBeNull();
    expect(slugFromSubdomain("www.example.com", "example.com")).toBeNull();
    expect(slugFromSubdomain("a.b.example.com", "example.com")).toBeNull();
    expect(slugFromSubdomain("evil-example.com", "example.com")).toBeNull();
    expect(slugFromSubdomain("shop.example.com", undefined)).toBeNull();
  });

  it("tells platform hosts from a shop's own domain, and checks addresses a shop may claim", () => {
    expect(isPlatformHost("localhost:3000", [])).toBe(true);
    expect(isPlatformHost("rewards.vercel.app", ["rewards.vercel.app"])).toBe(true);
    expect(isPlatformHost("shop.ahmed.com", ["rewards.vercel.app"], "example.com")).toBe(false);
    expect(normaliseDomain("https://Shop.Ahmed.com/path")).toBe("shop.ahmed.com");
    for (const bad of ["localhost", "10.0.0.1", "no spaces.com", "-bad.com", "a", "http://", "x..com"]) expect(() => normaliseDomain(bad)).toThrow();
    expect(cleanHost("Shop.Ahmed.com.:443")).toBe("shop.ahmed.com");
  });
});

describe("Owning a domain (FR-014)", () => {
  it("only serves a domain after the DNS record proves it, and shows what to add", async () => {
    const s = await shop();
    const domain = `rewards-${s.tag}.example.org`;
    const set = await setCustomDomain(s.ctx, domain);
    expect(set).toMatchObject({ domain, verified: false });
    expect(set.records!.txt.name).toBe(`_loyalty-verify.${domain}`);
    expect(await slugForVerifiedDomain(domain)).toBeNull(); // not served yet

    // Wrong or missing record: refused
    vi.spyOn(dns, "resolveTxt").mockResolvedValue([["something-else"]]);
    await expect(verifyCustomDomain(s.ctx)).rejects.toThrow(/couldn't find the verification record/);
    vi.spyOn(dns, "resolveTxt").mockRejectedValue(new Error("ENOTFOUND"));
    await expect(verifyCustomDomain(s.ctx)).rejects.toThrow(/couldn't find/);
    expect(await slugForVerifiedDomain(domain)).toBeNull();

    // The right record: served
    vi.spyOn(dns, "resolveTxt").mockResolvedValue([[set.records!.txt.value]]);
    const verified = await verifyCustomDomain(s.ctx);
    expect(verified.verified).toBe(true);
    expect(await slugForVerifiedDomain(domain)).toBe(s.slug);
    expect(await slugForVerifiedDomain(domain.toUpperCase())).toBe(s.slug);

    // The public lookup the middleware uses returns only the shop address
    const res = await lookupRoute(new NextRequest(`http://localhost:3000/api/internal/domain?host=${domain}`));
    expect(await res.json()).toEqual({ slug: s.slug });

    // Removing it stops serving it
    await removeCustomDomain(s.ctx);
    expect(await slugForVerifiedDomain(domain)).toBeNull();
    expect((await getDomainSettings(s.ctx)).domain).toBeNull();
  });

  it("won't let two businesses claim one domain, a platform address, or serve a suspended shop", async () => {
    const a = await shop();
    const b = await shop();
    const domain = `shared-${a.tag}.example.org`;
    await setCustomDomain(a.ctx, domain);
    await expect(setCustomDomain(b.ctx, domain)).rejects.toThrow(/already used/);
    await expect(setCustomDomain(b.ctx, "localhost")).rejects.toThrow(/web address/);
    process.env.ROOT_DOMAIN = "platform.example";
    await expect(setCustomDomain(b.ctx, "anything.platform.example")).rejects.toThrow(/belongs to this platform/);
    await expect(setCustomDomain({ ...b.ctx, role: "staff" }, "ok.example.org")).rejects.toThrow(/FORBIDDEN/);

    vi.spyOn(dns, "resolveTxt").mockImplementation(async () => [[(await getDomainSettings(a.ctx)).records!.txt.value]]);
    await verifyCustomDomain(a.ctx);
    expect(await slugForVerifiedDomain(domain)).toBe(a.slug);
    await db.update(tenants).set({ status: "suspended" }).where(eq(tenants.id, a.tenant.id));
    expect(await slugForVerifiedDomain(domain)).toBeNull();
  });
});

describe("Opening a shop's own address", () => {
  const home = (host: string, path = "/") => new NextRequest(`http://${host}${path}`, { headers: { host } });

  it("shows the shop's page at its subdomain's front page, and leaves every other page alone", async () => {
    process.env.ROOT_DOMAIN = "example.com";
    const res = await middleware(home("ahmed-coffee.example.com"));
    expect(res.headers.get("x-middleware-rewrite")).toContain("/b/ahmed-coffee");
    const other = await middleware(home("ahmed-coffee.example.com", "/login"));
    expect(other.headers.get("x-middleware-rewrite")).toBeNull();
    // The main site and local development are untouched
    expect((await middleware(home("example.com"))).headers.get("x-middleware-rewrite")).toBeNull();
    expect((await middleware(home("localhost:3000"))).headers.get("x-middleware-rewrite")).toBeNull();
  });
});
