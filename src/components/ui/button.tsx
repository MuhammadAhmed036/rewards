import * as React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "brand" | "outline" | "secondary" | "ghost" | "destructive" | "success";
  size?: "default" | "sm" | "lg" | "icon";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={twMerge(
          clsx(
            "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none",
            "min-h-[48px] rounded-xl text-base px-5 py-3", // Touch friendly 48px height per Section 14.1 & 14.3
            {
              "bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98]":
                variant === "default",
              "bg-[var(--brand,#0f172a)] text-[var(--brand-foreground,#ffffff)] hover:opacity-90 active:scale-[0.98]":
                variant === "brand",
              "border border-slate-300 dark:border-slate-700 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800":
                variant === "outline",
              "bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100":
                variant === "secondary",
              "bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98]":
                variant === "success",
              "bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.98]":
                variant === "destructive",
              "hover:bg-slate-100 dark:hover:bg-slate-800": variant === "ghost",
              "min-h-[38px] text-sm px-3 py-1.5": size === "sm",
              "min-h-[54px] text-lg px-6 py-4 font-semibold": size === "lg",
              "min-h-[48px] min-w-[48px] p-0": size === "icon",
            },
            className
          )
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

