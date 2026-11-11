"use client";

import React from "react";
import { QrCode } from "lucide-react";
import { Tilt } from "@/components/marketing/Tilt";
import { BusinessLogo } from "@/components/brand/BusinessLogo";

/**
 * What a new customer is about to get: the shop's own card, in the shop's colour, leaning towards the pointer.
 * It is a preview, so it shows an empty card (no points yet) and says so.
 */
export function ShopCardPreview3D({
  name,
  logoUrl,
  brandColor,
  stamps,
}: {
  name: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  stamps: boolean;
}) {
  const surface = brandColor && /^#[0-9a-f]{6}$/i.test(brandColor) ? brandColor : "#0056f9";
  return (
    <Tilt
      max={9}
      className="relative aspect-[1.586/1] w-full max-w-[420px] mx-auto rounded-[1.5rem] p-5 sm:p-6 text-white overflow-hidden flex flex-col justify-between shadow-[0_40px_70px_-34px_rgba(1,30,90,0.65)]"
    >
      {/* the shop's colour, with a diagonal sheen that makes it read as a surface */}
      <span aria-hidden className="absolute inset-0" style={{ backgroundColor: surface }} />
      <span
        aria-hidden
        className="absolute inset-0"
        style={{ backgroundImage: "linear-gradient(125deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 42%, rgba(0,0,0,0.22) 100%)" }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <BusinessLogo name={name} logoUrl={logoUrl} brandColor={surface} size="sm" className="ring-2 ring-white/40" />
          <p className="font-display text-lg sm:text-xl font-bold leading-tight truncate">{name}</p>
        </div>
        <span className="shrink-0 w-10 h-10 rounded-xl bg-white/90 text-evergreen-deep flex items-center justify-center">
          <QrCode className="w-5 h-5" />
        </span>
      </div>

      <div className="relative">
        {stamps ? (
          <div className="flex gap-2" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-dashed border-white/60" />
            ))}
          </div>
        ) : (
          <p className="font-display text-4xl sm:text-5xl font-bold leading-none tabular-nums">0</p>
        )}
        <p className="mt-2 text-sm text-white/85">{stamps ? "Your first stamp is one visit away" : "Your points will appear here"}</p>
      </div>
    </Tilt>
  );
}
