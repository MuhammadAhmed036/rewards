"use client";

import React from "react";
import Link from "next/link";
import { AuthPortal } from "@/components/auth/AuthPortal";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/Logo";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-paper flex flex-col justify-between overflow-x-hidden w-full max-w-full">
      {/* Top Global Navigation Bar */}
      <header className="border-b border-zinc-200/80 bg-white px-4 sm:px-6 lg:px-8 py-3 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Logo />

          <Link
            href="/"
            className="text-xs font-medium text-zinc-700 hover:text-zinc-950 transition-colors inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 shadow-2xs"
          >
            <ArrowLeft className="w-3.5 h-3.5 stroke-[1.8]" />
            <span>Back to home</span>
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex items-center justify-center py-6 sm:py-10">
        <AuthPortal initialMode="signin" />
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200/80 bg-white py-4 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 gap-2.5">
          <span>&copy; {new Date().getFullYear()} LoyaltyPlatform Ltd. Made in the UK.</span>
          <div className="flex items-center space-x-4">
            <Link href="/" className="hover:text-zinc-900 transition-colors">Home</Link>
            <Link href="/login?role=admin" className="hover:text-zinc-900 transition-colors">Platform admin</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
