import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LoyaltyPlatform Enterprise — Multi-Tenant QR Loyalty & ERP Engine",
  description:
    "Enterprise-grade SaaS loyalty platform for independent and multi-location retail, hospitality, salons, and services. Real-time ledger, anti-gating review engine, and UK GDPR compliance.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light overflow-x-hidden" style={{ colorScheme: "light" }}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased overflow-x-hidden w-full max-w-full bg-[#fafafa] text-zinc-900`}
      >
        {children}
      </body>
    </html>
  );
}
