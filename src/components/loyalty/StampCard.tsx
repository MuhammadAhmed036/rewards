"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, Gift, Clock } from "lucide-react";
import { BusinessLogo } from "@/components/brand/BusinessLogo";

export interface StampCardData {
  offerId: string;
  title: string;
  rewardName: string;
  requiredStamps: number;
  stamps: number;
  state: "collecting" | "ready" | "pending";
  rewardsClaimed: number;
  offerStatus: "active" | "expired" | "deactivated";
}

// Brand colours can be light; pick a text colour that stays readable on them.
function isLight(hex: string) {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((v) => parseInt(v, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6;
}

/**
 * A customer's digital stamp card for one offer, drawn as a tilting 3D card.
 * Newly earned stamps "land" on the card when the stamp count goes up.
 */
export function StampCard({
  card,
  businessName,
  logoUrl,
  brandColor,
  onClaim,
  claiming = false,
  justEarned = false,
}: {
  card: StampCardData;
  businessName: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  onClaim?: () => void;
  claiming?: boolean;
  /** Animate the newest stamp landing as soon as the card appears (e.g. right after a scan). */
  justEarned?: boolean;
}) {
  const surface = brandColor && /^#[0-9a-f]{6}$/i.test(brandColor) ? brandColor : "#495e57";
  const light = isLight(surface);
  const ink = light ? "text-zinc-900" : "text-white";
  const soft = light ? "text-zinc-700" : "text-white/75";

  const cardRef = useRef<HTMLDivElement>(null);
  const prevStamps = useRef(card.stamps);
  const [freshFrom, setFreshFrom] = useState<number | null>(
    justEarned && card.stamps > 0 ? card.stamps - 1 : null
  );

  useEffect(() => {
    if (!justEarned) return;
    const t = setTimeout(() => setFreshFrom(null), 1200);
    return () => clearTimeout(t);
  }, [justEarned]);

  useEffect(() => {
    if (card.stamps > prevStamps.current) {
      setFreshFrom(prevStamps.current);
      const t = setTimeout(() => setFreshFrom(null), 1200);
      prevStamps.current = card.stamps;
      return () => clearTimeout(t);
    }
    prevStamps.current = card.stamps;
  }, [card.stamps]);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch" || !cardRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    cardRef.current.classList.add("is-tracking");
    cardRef.current.style.setProperty("--rx", `${py * -14}deg`);
    cardRef.current.style.setProperty("--ry", `${px * 18}deg`);
  };
  const onPointerLeave = () => {
    if (!cardRef.current) return;
    cardRef.current.classList.remove("is-tracking");
    cardRef.current.style.setProperty("--rx", "6deg");
    cardRef.current.style.setProperty("--ry", "-8deg");
  };

  const remaining = Math.max(0, card.requiredStamps - card.stamps);
  const ended = card.offerStatus !== "active" && card.state === "collecting";
  const slots = card.requiredStamps + 1; // stamps plus the reward slot
  const cols = slots <= 6 ? slots : 5;

  return (
    <div className="card-stage" onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <div
        ref={cardRef}
        className="card-3d"
        style={{ ["--rx" as string]: "6deg", ["--ry" as string]: "-8deg" }}
      >
        <div
          className={`relative rounded-[1.5rem] p-5 sm:p-6 overflow-hidden shadow-[0_28px_50px_-22px_rgba(38,48,45,0.6)] ${ink} ${
            ended ? "grayscale opacity-70" : ""
          }`}
          style={{ backgroundColor: surface, transformStyle: "preserve-3d" }}
        >
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.08] pointer-events-none"
            style={{
              backgroundImage: `repeating-linear-gradient(115deg, ${light ? "#000" : "#fff"} 0 1px, transparent 1px 7px)`,
            }}
          />

          <div className="card-lift-2 relative flex items-start gap-3">
            <BusinessLogo name={businessName} logoUrl={logoUrl} brandColor={surface} size="sm" />
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${soft} truncate`}>{businessName}</p>
              <p className="font-display text-lg sm:text-xl font-bold leading-tight">{card.title}</p>
            </div>
            <span className="font-display text-xl font-bold tabular-nums shrink-0">
              {card.stamps}/{card.requiredStamps}
            </span>
          </div>

          <div
            className="card-lift-1 relative mt-5 grid gap-2.5 sm:gap-3 w-fit"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            aria-label={`${card.stamps} of ${card.requiredStamps} stamps collected`}
          >
            {Array.from({ length: card.requiredStamps }).map((_, i) => {
              const filled = i < card.stamps;
              const fresh = filled && freshFrom !== null && i >= freshFrom;
              return (
                <span
                  key={i}
                  className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center ${
                    filled
                      ? "bg-marigold text-evergreen-deep shadow-[0_4px_10px_-4px_rgba(0,0,0,0.4)]"
                      : `border-2 border-dashed ${light ? "border-black/25" : "border-white/35"}`
                  } ${fresh ? "stamp-pop" : ""}`}
                  style={filled && !fresh ? { transform: `rotate(${((i * 37) % 20) - 10}deg)` } : undefined}
                >
                  {filled ? (
                    <Check className="w-5 h-5" strokeWidth={3} />
                  ) : (
                    <span className={`text-sm font-semibold ${soft}`}>{i + 1}</span>
                  )}
                </span>
              );
            })}
            <span
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center ${
                card.state === "collecting"
                  ? `border-2 border-dashed ${light ? "border-black/40" : "border-marigold/80"}`
                  : "bg-white text-evergreen-deep"
              }`}
              title={`Free ${card.rewardName}`}
            >
              <Gift className={`w-5 h-5 ${card.state === "collecting" && !light ? "text-marigold" : ""}`} />
            </span>
          </div>

          <div className="card-lift-1 relative mt-5">
            {ended ? (
              <p className={`text-sm ${soft}`}>This offer has ended.</p>
            ) : card.state === "collecting" ? (
              <p className={`text-sm ${soft}`}>
                {remaining} more {remaining === 1 ? "stamp" : "stamps"} for a free {card.rewardName}
              </p>
            ) : card.state === "ready" ? (
              <button
                type="button"
                onClick={onClaim}
                disabled={claiming || !onClaim}
                className="w-full min-h-[48px] rounded-full bg-marigold text-evergreen-deep font-bold hover:brightness-95 transition cursor-pointer disabled:opacity-70"
              >
                {claiming ? "Claiming..." : `Claim your free ${card.rewardName}`}
              </button>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl bg-white text-evergreen-deep px-4 py-3">
                <Clock className="w-5 h-5 shrink-0 text-evergreen" />
                <div className="text-sm leading-snug">
                  <p className="font-semibold">Show this card at the counter</p>
                  <p className="text-zinc-600">Staff will hand over your free {card.rewardName}.</p>
                </div>
              </div>
            )}
            {card.rewardsClaimed > 0 && (
              <p className={`mt-3 text-xs ${soft}`}>
                You&rsquo;ve earned this reward {card.rewardsClaimed} {card.rewardsClaimed === 1 ? "time" : "times"}.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
