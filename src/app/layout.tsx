import type { Metadata, Viewport } from "next";
import { Sora, Figtree } from "next/font/google";
import "./globals.css";
import { SecurityDialogs } from "@/components/auth/SecurityDialogs";
import { OfflineBanner } from "@/components/OfflineBanner";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://www.rappio.co.uk"),
  title: { default: "Rappio: digital loyalty cards for local shops", template: "%s | Rappio" },
  description:
    "Customers scan a QR code, collect points on their phone and claim rewards. No app to download. Built for cafés, barbers, restaurants and other UK high-street businesses.",
  applicationName: "Rappio",
  openGraph: {
    type: "website",
    siteName: "Rappio",
    title: "Rappio: digital loyalty cards for local shops",
    description: "Customers scan a QR code, collect points on their phone and claim rewards. No app to download.",
    images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: "Rappio" }],
  },
  twitter: { card: "summary_large_image", images: ["/brand/og.png"] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "light",
  themeColor: "#0056f9",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sora.variable} ${figtree.variable} light overflow-x-hidden`} style={{ colorScheme: "light" }}>
      <body
        className={`antialiased overflow-x-hidden w-full max-w-full bg-paper text-zinc-900`}
      >
        {children}
        <SecurityDialogs />
        <OfflineBanner />
      </body>
    </html>
  );
}
