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
            "bg-zinc-950 text-white":
              variant === "default",
            "bg-zinc-100 text-zinc-800 border border-zinc-200/60":
              variant === "secondary",
            "bg-emerald-50 text-emerald-800 border border-emerald-200":
              variant === "success",
            "bg-amber-50 text-amber-800 border border-amber-200":
              variant === "warning",
            "bg-rose-50 text-rose-800 border border-rose-200":
              variant === "destructive",
            "border border-zinc-200 text-zinc-800 bg-white shadow-2xs":
              variant === "outline",
          },
          className
        )
      )}
      {...props}
    />
  );
}

