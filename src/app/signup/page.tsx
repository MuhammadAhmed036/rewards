"use client";

import React from "react";
import Link from "next/link";
import { AuthPortal } from "@/components/auth/AuthPortal";
import { QrCode, ArrowLeft } from "lucide-react";

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col justify-between selection:bg-zinc-900 selection:text-white overflow-x-hidden w-full max-w-full">
      {/* Top Global Navigation Bar */}
      <header className="border-b border-zinc-200/80 bg-white/90 backdrop-blur-md px-4 sm:px-6 lg:px-8 py-3 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-zinc-950 text-white flex items-center justify-center font-bold text-sm shadow-xs ring-1 ring-zinc-900/10 group-hover:bg-zinc-800 transition-colors">
              <QrCode className="w-4 h-4 stroke-[1.8]" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-bold text-sm sm:text-base text-zinc-950 tracking-tight">
                Loyalty<span className="text-zinc-500 font-normal">Platform</span>
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200/80">
                Enterprise
              </span>
            </div>
          </Link>

          <Link
            href="/"
            className="text-xs font-medium text-zinc-700 hover:text-zinc-950 transition-colors inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 shadow-2xs"
          >
            <ArrowLeft className="w-3.5 h-3.5 stroke-[1.8]" />
            <span>Back to Platform</span>
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex items-center justify-center py-6 sm:py-10">
        <AuthPortal initialMode="signup" />
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200/80 bg-white py-4 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 gap-2.5">
          <span>&copy; {new Date().getFullYear()} LoyaltyPlatform Enterprise. Engineered in the UK.</span>
          <div className="flex items-center space-x-4">
            <Link href="/" className="hover:text-zinc-900 transition-colors">Platform Overview</Link>
            <Link href="/login?role=admin" className="hover:text-zinc-900 transition-colors">Platform Admin Console</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
