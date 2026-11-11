import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { tenants } from "@/server/db/schema";

/** Each shop's page carries the shop's own name, so a shared link and a browser tab say whose card it is. */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const [t] = await db.select({ name: tenants.name, status: tenants.status }).from(tenants).where(eq(tenants.slug, slug.toLowerCase())).limit(1);
    if (!t || t.status !== "active") return { title: "Shop not found", robots: { index: false } };
    return {
      title: `${t.name} loyalty card`,
      description: `Join ${t.name}'s loyalty card, collect points on your phone and claim rewards. No app to download.`,
    };
  } catch {
    return { title: "Loyalty card" };
  }
}

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return children;
}
