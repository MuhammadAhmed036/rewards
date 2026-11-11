import type { MetadataRoute } from "next";

const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://www.rappio.co.uk").replace(/\/$/, "");

// Only the pages a visitor would search for: the shops themselves are listed by their own owners, not here.
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/login", "/signup", "/privacy"].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: "monthly" as const,
    priority: path === "" ? 1 : 0.5,
  }));
}
