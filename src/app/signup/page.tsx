"use client";

import React from "react";
import Link from "next/link";
import { AuthPortal } from "@/components/auth/AuthPortal";

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 flex flex-col justify-center items-center p-4">
      <AuthPortal initialMode="signup" />

      <div className="text-center mt-2 mb-6">
        <Link
          href="/"
          className="text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors inline-flex items-center gap-1"
        >
          ← Back to Homepage
        </Link>
      </div>
    </div>
  );
}

