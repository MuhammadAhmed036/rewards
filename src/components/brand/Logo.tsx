import React from "react";
import Link from "next/link";

export function LogoMark({ className = "w-9 h-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" className={className} aria-hidden>
      <rect width="36" height="36" rx="10" fill="#495e57" />
      <circle cx="18" cy="18" r="9.5" fill="#f4ce14" />
      <path
        d="M13.6 18.4l3 3 5.8-6.4"
        fill="none"
        stroke="#26302d"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ href = "/", tone = "dark" }: { href?: string; tone?: "dark" | "light" }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 shrink-0 rounded-lg">
      <LogoMark />
      <span
        className={`font-display text-lg font-bold tracking-tight ${
          tone === "light" ? "text-white" : "text-evergreen-deep"
        }`}
      >
        LoyaltyPlatform
      </span>
    </Link>
  );
}
