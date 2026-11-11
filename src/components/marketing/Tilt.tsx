"use client";

import React, { useRef } from "react";

/**
 * A surface that leans towards the pointer, with light following it. It only reacts to a mouse or pen (touch
 * would fight scrolling) and stays still for people who ask their device for less motion.
 */
export function Tilt({
  children,
  className = "",
  max = 7,
  glare = true,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  /** Largest lean in degrees */
  max?: number;
  glare?: boolean;
  as?: "div" | "article" | "li";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const frame = useRef<number | null>(null);

  const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const move = (e: React.PointerEvent) => {
    if (e.pointerType === "touch" || reduced()) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.classList.add("is-tracking");
      el.style.setProperty("--rx", `${(0.5 - py) * max * 2}deg`);
      el.style.setProperty("--ry", `${(px - 0.5) * max * 2}deg`);
      el.style.setProperty("--gx", `${px * 100}%`);
      el.style.setProperty("--gy", `${py * 100}%`);
    });
  };

  const leave = () => {
    const el = ref.current;
    if (!el) return;
    if (frame.current) cancelAnimationFrame(frame.current);
    el.classList.remove("is-tracking");
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };

  return (
    <Tag
      ref={ref as React.Ref<never>}
      onPointerMove={move}
      onPointerLeave={leave}
      className={`tilt-card relative ${className}`}
    >
      {children}
      {glare && <span aria-hidden className="card-glare rounded-[inherit]" />}
    </Tag>
  );
}
