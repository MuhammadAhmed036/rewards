import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LoyaltyPlatform — digital loyalty cards for local shops",
  description:
    "Customers scan a QR code, collect points on their phone and claim rewards. No app to download. Built for cafés, barbers, restaurants and other UK high-street businesses.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "light",
  themeColor: "#495e57",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${bricolage.variable} ${figtree.variable} light overflow-x-hidden`} style={{ colorScheme: "light" }}>
      <body
        className={`antialiased overflow-x-hidden w-full max-w-full bg-paper text-zinc-900`}
      >
        {children}
      </body>
    </html>
  );
}
