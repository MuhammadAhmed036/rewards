"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Coffee, RotateCw } from "lucide-react";

const TOTAL_STAMPS = 8;
const FILLED = 6; // the 7th stamp animates in as the "new" one

// Decorative QR-style pattern: fixed seed so server and client render the same grid.
function qrCells(size = 21) {
  let seed = 7;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const inFinder = (x: number, y: number) =>
    (x < 8 && y < 8) || (x > size - 9 && y < 8) || (x < 8 && y > size - 9);
  const cells: Array<[number, number]> = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inFinder(x, y) && rand() > 0.52) cells.push([x, y]);
    }
  }
  return cells;
}

const QR = qrCells();

function Finder({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width={7} height={7} fill="#26302d" />
      <rect x={x + 1} y={y + 1} width={5} height={5} fill="#ffffff" />
      <rect x={x + 2} y={y + 2} width={3} height={3} fill="#26302d" />
    </g>
  );
}

export function StampCard3D() {
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setTilt = useCallback((rx: number, ry: number) => {
    const card = cardRef.current;
    if (!card) return;
    card.style.setProperty("--rx", `${rx}deg`);
    card.style.setProperty("--ry", `${ry}deg`);
  }, []);

  const onPointerMove = (e: React.PointerEvent) => {
    if (reduceMotion || e.pointerType === "touch") return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      cardRef.current?.classList.add("is-tracking");
      setTilt(py * -18, px * 26);
    });
  };

  const onPointerLeave = () => {
    if (frame.current) cancelAnimationFrame(frame.current);
    cardRef.current?.classList.remove("is-tracking");
    setTilt(8, -16);
  };

  const flip = () => {
    cardRef.current?.classList.remove("is-tracking");
    setFlipped((f) => !f);
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <div
        ref={stageRef}
        className="card-stage w-full max-w-[440px] py-6"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        <div
          ref={cardRef}
          className="card-3d w-full aspect-[1.586/1] cursor-pointer"
          style={{ ["--flip" as string]: flipped ? "180deg" : "0deg" }}
          onClick={flip}
          role="img"
          aria-label={
            flipped
              ? "Back of a digital loyalty card showing a QR code to scan at the counter"
              : "Front of a digital loyalty card with 7 of 8 coffee stamps collected"
          }
        >
          {/* Front */}
          <div className="card-face bg-evergreen text-white p-5 sm:p-6 flex flex-col justify-between overflow-hidden shadow-[0_30px_60px_-20px_rgba(38,48,45,0.55)]">
            {/* fine paper grain lines */}
            <div
              aria-hidden
              className="absolute inset-0 rounded-[1.5rem] opacity-[0.07]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(115deg, #ffffff 0 1px, transparent 1px 7px)",
              }}
            />
            <div className="card-lift-2 relative flex items-start justify-between">
              <div>
                <p className="font-display text-xl sm:text-2xl font-bold leading-none">Artisan Roast</p>
                <p className="text-[13px] text-white/70 mt-1.5">Coffee card · Priya S.</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-marigold text-evergreen-deep flex items-center justify-center">
                <Coffee className="w-5 h-5" strokeWidth={2.2} />
              </div>
            </div>

            <div className="card-lift-1 relative grid grid-cols-4 gap-x-3 gap-y-2 w-fit">
              {Array.from({ length: TOTAL_STAMPS }).map((_, i) => {
                const isFree = i === TOTAL_STAMPS - 1;
                const isNew = i === FILLED;
                const filled = i < FILLED;
                if (isFree) {
                  return (
                    <div
                      key={i}
                      className="w-10 h-10 sm:w-[3.25rem] sm:h-[3.25rem] rounded-full border-2 border-dashed border-marigold/80 flex items-center justify-center text-[11px] sm:text-xs font-bold text-marigold"
                    >
                      Free
                    </div>
                  );
                }
                return (
                  <div
                    key={i}
                    className={`w-10 h-10 sm:w-[3.25rem] sm:h-[3.25rem] rounded-full flex items-center justify-center ${
                      filled || isNew ? "bg-marigold text-evergreen-deep" : "border-2 border-white/25"
                    } ${isNew ? "stamp-new" : ""}`}
                    style={filled ? { transform: `rotate(${(i * 37) % 24 - 12}deg)` } : undefined}
                  >
                    {(filled || isNew) && <Coffee className="w-[45%] h-[45%]" strokeWidth={2.4} />}
                  </div>
                );
              })}
            </div>

            <div className="card-lift-1 relative flex items-end justify-between text-[13px]">
              <span className="text-white/80">1 more stamp for a free drink</span>
              <span className="font-display font-bold text-marigold">7 / 8</span>
            </div>
          </div>

          {/* Back */}
          <div className="card-face card-face--back bg-white border border-zinc-200 p-5 sm:p-6 flex items-center gap-5 shadow-[0_30px_60px_-20px_rgba(38,48,45,0.45)]">
            <div className="card-lift-1 shrink-0 w-[42%] aspect-square rounded-xl bg-white p-2 ring-1 ring-zinc-200">
              <svg viewBox="0 0 21 21" className="w-full h-full" shapeRendering="crispEdges" aria-hidden>
                {QR.map(([x, y]) => (
                  <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#26302d" />
                ))}
                <Finder x={0} y={0} />
                <Finder x={14} y={0} />
                <Finder x={0} y={14} />
              </svg>
            </div>
            <div className="card-lift-2 min-w-0">
              <p className="font-display text-lg sm:text-xl font-bold text-evergreen-deep leading-tight">
                Show this at the counter
              </p>
              <p className="text-[13px] text-zinc-600 mt-2 leading-snug">
                Staff scan it, your stamp lands instantly.
              </p>
              <p className="mt-3 text-[13px] font-semibold text-evergreen">Member #40218</p>
            </div>
          </div>

          <div className="card-shadow" aria-hidden />
        </div>
      </div>

      <button
        type="button"
        onClick={flip}
        className="inline-flex items-center gap-2 text-sm font-semibold text-evergreen hover:text-evergreen-deep px-3 py-1.5 rounded-full hover:bg-mist transition-colors cursor-pointer"
      >
        <RotateCw className={`w-4 h-4 transition-transform duration-700 ${flipped ? "rotate-180" : ""}`} />
        {flipped ? "Show the stamps" : "Turn the card over"}
      </button>
    </div>
  );
}
