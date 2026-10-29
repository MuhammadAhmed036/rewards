"use client";

import React, { useLayoutEffect, useRef, useState } from "react";

export interface SideNavGroup<T extends string> {
  title?: string;
  items: Array<{ id: T; label: string; icon: React.ComponentType<{ className?: string }> }>;
}

/** Owner sidebar: the highlight slides to the page you open. */
export function SideNav<T extends string>({
  groups,
  active,
  onChange,
  unread = {},
}: {
  groups: SideNavGroup<T>[];
  active: T;
  onChange: (id: T) => void;
  unread?: Partial<Record<T, number>>;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ y: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current?.querySelector<HTMLButtonElement>(`[data-nav="${active}"]`);
    if (el && wrap.current) {
      const top = el.getBoundingClientRect().top - wrap.current.getBoundingClientRect().top;
      setPill({ y: top, h: el.offsetHeight });
    }
  }, [active]);

  return (
    <div ref={wrap} className="relative flex flex-col gap-6">
      {pill && (
        <span
          aria-hidden
          className="absolute left-0 right-0 rounded-xl bg-mist transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
          style={{ top: pill.y, height: pill.h }}
        >
          <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-evergreen" />
        </span>
      )}
      {groups.map((group, gi) => (
        <div key={gi} className="relative">
          {group.title && <p className="px-3 mb-1.5 text-xs font-semibold text-zinc-400">{group.title}</p>}
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const on = active === item.id;
              const count = unread[item.id] ?? 0;
              return (
                <button
                  key={item.id}
                  data-nav={item.id}
                  onClick={() => onChange(item.id)}
                  aria-current={on ? "page" : undefined}
                  className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marigold ${
                    on ? "text-evergreen-deep font-semibold" : "text-zinc-600 font-medium hover:text-zinc-900"
                  }`}
                >
                  <Icon className={`w-[18px] h-[18px] transition-colors ${on ? "text-evergreen" : "text-zinc-400"}`} />
                  <span className="flex-1 text-left">{item.label}</span>
                  {count > 0 && (
                    <span
                      className="min-w-5 h-5 px-1.5 rounded-full bg-marigold text-evergreen-deep text-xs font-bold flex items-center justify-center"
                      aria-label={`${count} unread`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
