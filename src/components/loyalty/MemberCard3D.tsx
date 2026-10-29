"use client";

import React, { useRef } from "react";
import { RotateCw } from "lucide-react";
import { BusinessLogo } from "@/components/brand/BusinessLogo";
import { useCountUp } from "@/lib/use-count-up";

function isLight(hex: string) {
  const m = hex
    .replace("#", "")
    .match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((v) => parseInt(v, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6;
}

/**
 * The customer's own loyalty card as a physical-feeling 3D card. It leans towards the pointer,
 * catches the light, and flips over to show the QR code staff scan at the counter.
 */
export function MemberCard3D({
  businessName,
  logoUrl,
  brandColor,
  memberName,
  memberNumber,
  balance,
  unit,
  qrDataUrl,
  flipped = false,
  onFlip,
}: {
  businessName: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  memberName: string;
  memberNumber: string;
  balance: number;
  unit: "points" | "stamps";
  /** Leave out for a preview card that doesn't flip (e.g. on the owner dashboard). */
  qrDataUrl?: string;
  flipped?: boolean;
  onFlip?: () => void;
}) {
  const surface =
    brandColor && /^#[0-9a-f]{6}$/i.test(brandColor) ? brandColor : "#495e57";
  const light = isLight(surface);
  const cardRef = useRef<HTMLDivElement>(null);
  const shown = useCountUp(balance);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch" || !cardRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const el = cardRef.current;
    el.classList.add("is-tracking");
    el.style.setProperty("--rx", `${(py - 0.5) * -16}deg`);
    el.style.setProperty("--ry", `${(px - 0.5) * 20}deg`);
    el.style.setProperty("--gx", `${px * 100}%`);
    el.style.setProperty("--gy", `${py * 100}%`);
  };
  const onPointerLeave = () => {
    const el = cardRef.current;
    if (!el) return;
    el.classList.remove("is-tracking");
    el.style.setProperty("--rx", "4deg");
    el.style.setProperty("--ry", "-10deg");
  };

  return (
    <div className="card-arrive w-full max-w-[420px] mx-auto">
      <div
        className="card-stage"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        <div
          ref={cardRef}
          className="card-3d aspect-[1.586/1] w-full"
          style={{
            ["--rx" as string]: "4deg",
            ["--ry" as string]: "-10deg",
            ["--flip" as string]: flipped ? "180deg" : "0deg",
          }}
        >
          {/* Front */}
          <button
            type="button"
            onClick={onFlip}
            disabled={!qrDataUrl}
            aria-label={
              qrDataUrl
                ? "Flip card to show your QR code"
                : `${businessName} loyalty card`
            }
            className={`card-face text-left overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-marigold ${
              light ? "text-zinc-900" : "text-white"
            } ${qrDataUrl ? "" : "cursor-default"}`}
            style={{ backgroundColor: surface }}
            tabIndex={flipped ? -1 : 0}
          >
            {/* Engraved lines and a soft light that follows the pointer */}
            <span
              aria-hidden
              className="absolute inset-0 opacity-[0.09]"
              style={{
                backgroundImage: `repeating-radial-gradient(circle at 110% 120%, ${light ? "#000" : "#fff"} 0 1px, transparent 1px 9px)`,
              }}
            />
            <span aria-hidden className="card-glare" />

            <span className="card-lift-2 absolute left-6 top-6 right-6 flex items-center gap-3">
              <BusinessLogo
                name={businessName}
                logoUrl={logoUrl}
                brandColor={surface}
                size="sm"
              />
              <span className="font-display font-bold text-lg truncate">
                {businessName}
              </span>
            </span>

            <span className="card-lift-2 absolute left-6 top-1/2 -translate-y-[38%]">
              <span className="block font-display font-bold text-5xl sm:text-6xl leading-none tabular-nums">
                {shown}
              </span>
              <span
                className={`block mt-1 text-sm ${light ? "text-zinc-700" : "text-white/75"}`}
              >
                {unit}
              </span>
            </span>

            <span className="card-lift-1 absolute left-6 right-6 bottom-5 flex items-end justify-between gap-3">
              <span className="min-w-0">
                <span
                  className={`block text-xs ${light ? "text-zinc-700" : "text-white/70"}`}
                >
                  Member
                </span>
                <span className="block font-semibold truncate">
                  {memberName}
                </span>
              </span>
              <span className="text-right shrink-0">
                <span
                  className={`block text-xs ${light ? "text-zinc-700" : "text-white/70"}`}
                >
                  ID
                </span>
                <span className="block font-semibold tracking-wider tabular-nums">
                  {memberNumber}
                </span>
              </span>
            </span>

            {qrDataUrl && (
              <span
                aria-hidden
                className="card-lift-1 absolute right-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-marigold/90 flex items-center justify-center text-evergreen-deep shadow-[0_6px_14px_-6px_rgba(0,0,0,0.5)]"
              >
                <RotateCw className="w-5 h-5" />
              </span>
            )}
          </button>

          {/* Back: the code staff scan */}
          {qrDataUrl && (
            <button
              type="button"
              onClick={onFlip}
              aria-label="Flip card back"
              className="card-face card-face--back bg-white border border-zinc-200 overflow-hidden cursor-pointer flex items-center gap-4 sm:gap-6 p-5 sm:p-6 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-marigold"
              tabIndex={flipped ? 0 : -1}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt={`QR code for customer ${memberNumber}`}
                className="h-full max-h-[190px] aspect-square rounded-xl"
              />
              <span className="text-left min-w-0">
                <span className="block text-sm text-zinc-600">
                  Show this at the counter
                </span>
                <span className="block mt-2 text-xs text-zinc-500">
                  No scanner? Staff can type
                </span>
                <span className="block font-display text-2xl font-bold tracking-[0.12em] text-evergreen-deep break-all">
                  {memberNumber}
                </span>
              </span>
            </button>
          )}
        </div>
        <div className="card-shadow" aria-hidden />
      </div>
    </div>
  );
}
