import * as React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "success" | "warning" | "destructive" | "outline";
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <div
      className={twMerge(
        clsx(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none select-none",
          {
            "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900":
              variant === "default",
            "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100":
              variant === "secondary",
            "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300":
              variant === "success",
            "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300":
              variant === "warning",
            "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300":
              variant === "destructive",
            "border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200":
              variant === "outline",
          },
          className
        )
      )}
      {...props}
    />
  );
}
