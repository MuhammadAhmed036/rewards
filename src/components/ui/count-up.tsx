"use client";

import { useCountUp } from "@/lib/use-count-up";

/** A number that counts up to its value, for balances that just changed. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  return <span className={`tabular-nums ${className ?? ""}`}>{useCountUp(value)}</span>;
}

/** A tick that draws itself, used when something has just been saved. */
export function DrawnCheck({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 52 52" className={className} aria-hidden>
      <circle className="check-ring" cx="26" cy="26" r="23" fill="none" stroke="currentColor" strokeWidth="3" />
      <path className="check-tick" d="M15 27l7 7 15-16" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
