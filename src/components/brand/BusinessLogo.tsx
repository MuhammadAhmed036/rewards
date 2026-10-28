import React from "react";

/**
 * A business's own logo, shown at the same fixed sizes in the owner, staff and customer portals.
 * The image is contained (never stretched) inside a white tile; businesses without a logo
 * get their initial on their brand colour.
 */
const SIZES = {
  sm: "w-10 h-10 rounded-xl text-base", // lists and loyalty cards
  md: "w-12 h-12 rounded-2xl text-lg", // portal headers
  lg: "w-20 h-20 rounded-3xl text-3xl", // settings preview
} as const;

export type BusinessLogoSize = keyof typeof SIZES;

export function BusinessLogo({
  name,
  logoUrl,
  brandColor,
  size = "md",
  className = "",
}: {
  name: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  size?: BusinessLogoSize;
  className?: string;
}) {
  const box = `${SIZES[size]} shrink-0 overflow-hidden flex items-center justify-center ${className}`;

  if (logoUrl) {
    return (
      <span className={`${box} bg-white ring-1 ring-black/10`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- served from our own logo route with immutable caching */}
        <img src={logoUrl} alt={`${name} logo`} className="w-full h-full object-contain p-1" loading="lazy" />
      </span>
    );
  }

  return (
    <span
      className={`${box} font-display font-bold text-white`}
      style={{ backgroundColor: brandColor || "#495e57" }}
      aria-label={`${name} logo`}
      role="img"
    >
      {name.trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}
