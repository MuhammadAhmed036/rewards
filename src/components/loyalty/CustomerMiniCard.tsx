"use client";

import React from "react";
import { useCountUp } from "@/lib/use-count-up";

/**
 * The customer's card as staff see it after a scan: it swings in, and the balance counts up,
 * so the person at the till can tell at a glance who they are serving and what they have.
 */
export function CustomerMiniCard({
  name,
  memberNumber,
  balance,
  unit,
  brandColor,
  businessName,
}: {
  name: string;
  memberNumber: string;
  balance: number;
  unit: "points" | "stamps";
  brandColor?: string | null;
  businessName: string;
}) {
  const surface = brandColor && /^#[0-9a-f]{6}$/i.test(brandColor) ? brandColor : "#495e57";
  const shown = useCountUp(balance);

  return (
    <div className="card-arrive w-full max-w-[300px]">
      <div className="card-stage">
        <div
          className="card-3d relative aspect-[1.586/1] rounded-[1.25rem] overflow-hidden text-white shadow-[0_24px_40px_-22px_rgba(38,48,45,0.7)]"
          style={{ backgroundColor: surface, ["--rx" as string]: "6deg", ["--ry" as string]: "-12deg" }}
        >
          <span
            aria-hidden
            className="absolute inset-0 opacity-[0.1]"
            style={{ backgroundImage: "repeating-radial-gradient(circle at 110% 120%, #fff 0 1px, transparent 1px 8px)" }}
          />
          <span className="card-lift-1 absolute left-4 top-3.5 right-4 text-xs text-white/75 truncate">{businessName}</span>
          <span className="card-lift-2 absolute left-4 top-1/2 -translate-y-1/2">
            <span className="block font-display font-bold text-4xl leading-none tabular-nums">{shown}</span>
            <span className="block text-xs text-white/75 mt-1">{unit} to spend</span>
          </span>
          <span className="card-lift-1 absolute left-4 right-4 bottom-3 flex items-end justify-between gap-2 text-sm">
            <span className="font-semibold truncate">{name}</span>
            <span className="tracking-wider tabular-nums text-white/85 shrink-0">{memberNumber}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
