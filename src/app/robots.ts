import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://www.rappio.co.uk";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/privacy"], disallow: ["/api/", "/dashboard", "/staff", "/admin", "/me", "/support", "/reset-password", "/accept-invite", "/verify-email", "/household/"] }],
    sitemap: `${base.replace(/\/$/, "")}/sitemap.xml`,
  };
}
