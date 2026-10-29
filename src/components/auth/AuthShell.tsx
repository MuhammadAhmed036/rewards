import React from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

/** Simple centred page for one-step account tasks (reset password, confirm email). */
export function AuthShell({ title, intro, children }: { title: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <header className="border-b border-zinc-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Logo />
          <Link href="/login" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
            Sign in
          </Link>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="pop-in w-full max-w-md rounded-3xl bg-white border border-zinc-200 p-6 sm:p-8">
          <h1 className="font-display text-3xl font-bold text-evergreen-deep">{title}</h1>
          {intro && <p className="mt-2 text-zinc-600">{intro}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}

export const fieldClass =
  "w-full min-h-[48px] rounded-xl border border-zinc-300 bg-white px-4 text-base focus:outline-none focus:ring-2 focus:ring-evergreen";
export const primaryButtonClass =
  "press w-full min-h-[48px] rounded-full bg-evergreen text-white font-semibold hover:bg-evergreen-deep cursor-pointer disabled:opacity-50";
