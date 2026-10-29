"use client";

import React, { useLayoutEffect, useRef, useState } from "react";

export interface SlidingTab<T extends string> {
  id: T;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

/**
 * Tab bar whose highlight slides to the tab you pick, so it is clear what changed.
 * Works when the tabs wrap onto two rows on phones.
 */
export function SlidingTabs<T extends string>({
  tabs,
  active,
  onChange,
  className = "",
}: {
  tabs: SlidingTab<T>[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const el = wrap.current?.querySelector<HTMLButtonElement>(`[data-tab="${active}"]`);
      if (el) setPill({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [active, tabs.length]);

  return (
    <div
      ref={wrap}
      role="tablist"
      className={`relative grid grid-cols-3 sm:grid-cols-6 gap-1 p-1.5 bg-white rounded-2xl border border-zinc-200 ${className}`}
    >
      {pill && (
        <span
          aria-hidden
          className="absolute rounded-xl bg-evergreen shadow-[0_8px_18px_-10px_rgba(38,48,45,0.8)] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
          style={{ left: pill.x, top: pill.y, width: pill.w, height: pill.h }}
        />
      )}
      {tabs.map(({ id, label, icon: Icon, badge }) => {
        const on = id === active;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={on}
            data-tab={id}
            onClick={() => onChange(id)}
            className={`press relative z-10 flex flex-col items-center justify-center py-2.5 px-1 rounded-xl text-xs sm:text-sm font-semibold transition-colors duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marigold ${
              on ? "text-white" : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            <Icon className="h-4 w-4 mb-1 stroke-[1.8]" />
            <span className="truncate max-w-full">{label}</span>
            {!!badge && badge > 0 && (
              <span
                className="absolute top-1 right-2 min-w-5 h-5 px-1 rounded-full bg-marigold text-evergreen-deep text-xs font-bold flex items-center justify-center"
                aria-label={`${badge} unread`}
              >
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
