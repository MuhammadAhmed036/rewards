import React from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

/** Readable long-form page for the privacy notice and programme terms. */
export function LegalPage({ title, meta, children }: { title: string; meta: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <header className="border-b border-zinc-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Logo />
          <Link href="/" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
            Home
          </Link>
        </div>
      </header>
      <main className="flex-1 px-4 sm:px-6 py-10 sm:py-14">
        <article className="max-w-[68ch] mx-auto text-zinc-800 leading-relaxed [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-evergreen-deep [&_h2]:mt-10 [&_h2]:mb-3 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mt-1.5 [&_a]:text-evergreen [&_a]:font-semibold [&_a]:underline">
          <h1 className="font-display text-4xl font-bold text-evergreen-deep">{title}</h1>
          <p className="mt-2 text-sm text-zinc-500">{meta}</p>
          {children}
        </article>
      </main>
      <footer className="border-t border-zinc-200 bg-white py-5">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 flex gap-4 text-sm text-zinc-500">
          <Link href="/privacy" className="hover:text-zinc-900">
            Privacy
          </Link>
          <Link href="/me" className="hover:text-zinc-900">
            Your data
          </Link>
        </div>
      </footer>
    </div>
  );
}
