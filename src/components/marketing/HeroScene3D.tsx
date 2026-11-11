"use client";

import React, { useRef } from "react";
import { BadgeCheck, Star } from "lucide-react";
import { StampCard3D } from "./StampCard3D";

/**
 * The home page's one big 3D moment: the customer's card in the middle, the till phone scanning it in front,
 * a gold reward coin turning on its edge, and the owner's numbers hanging behind. Each layer sits at its own
 * depth, so moving the pointer slides them against each other.
 */

export function Coin() {
  const discs = Array.from({ length: 9 });
  return (
    <div className="coin w-[84px] h-[84px] sm:w-[104px] sm:h-[104px]" aria-hidden>
      {discs.map((_, i) => (
        <span
          key={i}
          className="coin-disc"
          style={{
            transform: `translateZ(${(i - 4) * 2.2}px)`,
            background: i % 2 ? "#e6a91c" : "#f5b92e",
          }}
        />
      ))}
      {/* faces */}
      <span
        className="coin-disc flex items-center justify-center bg-gradient-to-br from-[#ffe08a] via-[#ffc53d] to-[#e6a91c] ring-4 ring-[#f0ad14]/70"
        style={{ transform: "translateZ(10px)" }}
      >
        <Star className="w-[46%] h-[46%] text-evergreen-deep" strokeWidth={2.2} fill="currentColor" />
      </span>
      <span
        className="coin-disc flex items-center justify-center bg-gradient-to-br from-[#ffe08a] via-[#ffc53d] to-[#e6a91c] ring-4 ring-[#f0ad14]/70"
        style={{ transform: "rotateY(180deg) translateZ(10px)" }}
      >
        <Star className="w-[46%] h-[46%] text-evergreen-deep" strokeWidth={2.2} fill="currentColor" />
      </span>
    </div>
  );
}

function Phone() {
  return (
    <div className="relative w-[104px] sm:w-[124px] aspect-[9/18.5] rounded-[26px] bg-evergreen-deep p-[5px] shadow-[0_40px_60px_-24px_rgba(1,30,90,0.75)]">
      <div className="relative h-full w-full rounded-[21px] overflow-hidden bg-gradient-to-b from-[#0b2b7a] to-[#011e5a]">
        {/* camera view with the scan frame */}
        <div className="absolute inset-x-3 top-[18%] aspect-square">
          {(["tl", "tr", "bl", "br"] as const).map((c) => (
            <span
              key={c}
              className={`absolute w-4 h-4 border-marigold ${
                c === "tl" ? "top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-md" : ""
              } ${c === "tr" ? "top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-md" : ""} ${
                c === "bl" ? "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-md" : ""
              } ${c === "br" ? "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-md" : ""}`}
            />
          ))}
          <span className="scan-line absolute inset-x-1 h-[2px] rounded-full bg-marigold shadow-[0_0_10px_2px_rgba(255,197,61,0.7)]" />
        </div>
        <div className="absolute inset-x-2 bottom-3 rounded-xl bg-white px-2 py-1.5 text-center">
          <p className="flex items-center justify-center gap-1 text-[10px] font-bold text-evergreen-deep leading-tight">
            <BadgeCheck className="w-3 h-3 text-evergreen" /> +1 stamp
          </p>
          <p className="text-[9px] text-zinc-500 leading-tight">Priya S. · Artisan Roast</p>
        </div>
      </div>
    </div>
  );
}

function NumbersPanel() {
  const bars = [38, 52, 44, 68, 58, 82, 74];
  return (
    <div className="w-[210px] sm:w-[250px] rounded-2xl bg-white p-3.5 sm:p-4 shadow-[0_30px_60px_-26px_rgba(1,30,90,0.55)] ring-1 ring-zinc-200/80">
      <p className="text-[11px] font-semibold text-zinc-500">Regulars this week</p>
      <p className="font-display text-2xl font-bold text-evergreen-deep tabular-nums leading-tight">
        128 <span className="text-xs font-semibold text-evergreen">visits</span>
      </p>
      <div className="mt-3 flex items-end gap-1.5 h-16" aria-hidden>
        {bars.map((h, i) => (
          <span
            key={i}
            className={`flex-1 rounded-md ${i === bars.length - 1 ? "bg-brand-gradient" : "bg-mist"}`}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <p className="mt-2 text-[10px] text-zinc-400">Example numbers</p>
    </div>
  );
}

export function HeroScene3D() {
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);

  const move = (e: React.PointerEvent) => {
    if (e.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = stage.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const py = ((e.clientY - r.top) / r.height - 0.5) * 2;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.setProperty("--px", String(px));
      el.style.setProperty("--py", String(py));
    });
  };

  const leave = () => {
    const el = stage.current;
    if (!el) return;
    el.style.setProperty("--px", "0");
    el.style.setProperty("--py", "0");
  };

  return (
    <div
      ref={stage}
      onPointerMove={move}
      onPointerLeave={leave}
      className="scene relative w-full max-w-[560px] mx-auto aspect-[1/1.2] select-none"
    >
      {/* the light the objects seem to sit in */}
      <div aria-hidden className="absolute inset-[6%] rounded-full bg-brand-gradient opacity-25 blur-3xl" />

      <div
        className="scene-layer absolute inset-0"
        style={{ transform: "rotateX(calc(var(--py, 0) * -5deg)) rotateY(calc(var(--px, 0) * 7deg))", transition: "transform 0.5s cubic-bezier(0.2,0.8,0.2,1)" }}
      >
        {/* numbers, far back */}
        <div
          className="scene-layer absolute top-[2%] right-[0%]"
          style={{ ["--z" as string]: "-70px", ["--mx" as string]: "-16px", ["--my" as string]: "-10px", ["--ry" as string]: "-12deg", ["--rx" as string]: "5deg" }}
        >
          <div className="float-slower">
            <NumbersPanel />
          </div>
        </div>

        {/* the card, in the middle */}
        <div
          className="scene-layer absolute left-[4%] right-[6%] top-[17%]"
          style={{ ["--z" as string]: "0px", ["--mx" as string]: "12px", ["--my" as string]: "8px" }}
        >
          <StampCard3D bare />
        </div>

        {/* the till phone, in front */}
        <div
          className="scene-layer absolute left-[9%] bottom-[0%]"
          style={{ ["--z" as string]: "110px", ["--mx" as string]: "26px", ["--my" as string]: "16px", ["--rx" as string]: "-6deg", ["--ry" as string]: "14deg", ["--rz" as string]: "-5deg" }}
        >
          <div className="float-slow">
            <Phone />
          </div>
        </div>

        {/* the reward coin, nearest */}
        <div
          className="scene-layer absolute right-[4%] bottom-[6%]"
          style={{ ["--z" as string]: "150px", ["--mx" as string]: "34px", ["--my" as string]: "22px" }}
        >
          <div className="float-slower" style={{ transformStyle: "preserve-3d" }}>
            <Coin />
          </div>
        </div>
      </div>
    </div>
  );
}
