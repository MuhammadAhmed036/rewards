import * as React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={twMerge(
          clsx(
            "flex min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base shadow-sm transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:placeholder:text-slate-500 dark:focus-visible:ring-slate-300",
            className
          )
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
