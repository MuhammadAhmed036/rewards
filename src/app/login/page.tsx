"use client";

import React from "react";
import Link from "next/link";
import { AuthPortal } from "@/components/auth/AuthPortal";
import { QrCode, ArrowLeft } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-50/80 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      {/* Top Global Navigation Bar */}
      <header className="border-b border-slate-200/90 bg-white/95 backdrop-blur-md px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-sm group-hover:bg-indigo-700 transition-colors">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <span className="font-black text-base tracking-tight text-slate-900 group-hover:text-indigo-600 transition-colors">
                LoyaltyEngine
              </span>
              <span className="text-[10px] text-slate-400 block font-semibold -mt-1">
                Enterprise Cloud
              </span>
            </div>
          </Link>

          <Link
            href="/"
            className="text-xs font-bold text-slate-600 hover:text-indigo-600 transition-colors inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Platform
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex items-center justify-center py-6">
        <AuthPortal initialMode="signin" />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 bg-white py-4 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <span>&copy; {new Date().getFullYear()} LoyaltyEngine SaaS Platform. All rights reserved.</span>
          <div className="flex items-center space-x-4">
            <Link href="/" className="hover:text-slate-800">Platform Overview</Link>
            <Link href="/login?role=admin" className="hover:text-slate-800">Super Admin Console</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
