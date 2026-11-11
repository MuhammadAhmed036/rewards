"use client";

import React, { useEffect, useRef } from "react";
import { Gift, Home, Megaphone, QrCode, Settings, Users } from "lucide-react";

const NAV = [
  { icon: Home, label: "Overview", active: true },
  { icon: Users, label: "Customers" },
  { icon: Gift, label: "Rewards" },
  { icon: Megaphone, label: "Offers" },
  { icon: QrCode, label: "QR codes" },
  { icon: Settings, label: "Settings" },
];

const ACTIVITY = [
  { who: "Priya S.", what: "earned 1 stamp", when: "2 min ago" },
  { who: "Tom H.", what: "claimed a free coffee", when: "9 min ago" },
  { who: "Aisha K.", what: "joined", when: "21 min ago" },
  { who: "Marcus B.", what: "earned 1 stamp", when: "34 min ago" },
];

/**
 * The owner's dashboard shown tilted in space. It lies back when the page loads and settles towards flat the
 * moment it scrolls into view (the one scroll moment on the page), then leans a little with the pointer.
 * Every number is marked as an example.
 */
export function OwnerPreview3D() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.setProperty("--rx", "5deg");
          el.style.setProperty("--ry", "-7deg");
          io.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const move = (e: React.PointerEvent) => {
    if (e.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${py * -8}deg`);
    el.style.setProperty("--ry", `${px * 12}deg`);
  };
  const leave = () => {
    ref.current?.style.setProperty("--rx", "5deg");
    ref.current?.style.setProperty("--ry", "-7deg");
  };

  return (
    <div className="relative" onPointerMove={move} onPointerLeave={leave}>
      <div aria-hidden className="absolute -inset-6 rounded-[2.5rem] bg-brand-gradient opacity-20 blur-3xl" />
      <div
        ref={ref}
        className="tilt-panel relative rounded-3xl bg-white ring-1 ring-zinc-200 shadow-[0_50px_90px_-40px_rgba(1,30,90,0.6)] overflow-hidden"
        style={{ ["--rx" as string]: "18deg", ["--ry" as string]: "-20deg" }}
      >
        <div className="flex">
          {/* sidebar */}
          <div className="hidden sm:flex w-44 shrink-0 flex-col gap-1 bg-evergreen-deep p-3.5 text-white/80">
            <p className="px-2 pb-3 pt-1 font-display text-base font-bold text-white">Artisan Roast</p>
            {NAV.map((n) => (
              <span
                key={n.label}
                className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium ${
                  n.active ? "bg-white/12 text-white" : ""
                }`}
              >
                <n.icon className="w-4 h-4" />
                {n.label}
              </span>
            ))}
          </div>

          {/* content */}
          <div className="flex-1 min-w-0 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="font-display text-lg sm:text-xl font-bold text-evergreen-deep">Your regulars</p>
              <span className="rounded-full bg-mist px-3 py-1 text-xs font-semibold text-evergreen">Last 30 days</span>
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-2.5 sm:gap-3">
              {[
                ["New members", "212"],
                ["Visits", "1,486"],
                ["Rewards used", "94"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-paper p-3">
                  <dt className="text-[11px] sm:text-xs text-zinc-500 leading-tight">{label}</dt>
                  <dd className="mt-1 font-display text-lg sm:text-2xl font-bold tabular-nums text-evergreen-deep">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-4 grid gap-3 sm:grid-cols-[1.2fr_1fr]">
              <div className="rounded-2xl border border-zinc-200 p-3.5">
                <p className="text-xs font-semibold text-zinc-600">Customers who came back</p>
                <div className="mt-3 flex items-end gap-1.5 h-24" aria-hidden>
                  {[30, 42, 38, 55, 49, 63, 58, 72, 66, 84, 78, 92].map((h, i) => (
                    <span
                      key={i}
                      className={`flex-1 rounded-md ${i > 8 ? "bg-brand-gradient" : "bg-mist"}`}
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              </div>
              <ul className="rounded-2xl border border-zinc-200 p-3.5 space-y-2.5">
                {ACTIVITY.map((a) => (
                  <li key={a.who} className="text-xs leading-snug">
                    <span className="font-semibold text-evergreen-deep">{a.who}</span>{" "}
                    <span className="text-zinc-600">{a.what}</span>
                    <span className="block text-[11px] text-zinc-400">{a.when}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-3 text-[11px] text-zinc-400">Example data, for illustration.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
