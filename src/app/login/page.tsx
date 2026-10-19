"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { QrCode, Lock, Mail, ArrowRight, AlertCircle, CheckCircle2, ShieldCheck, Scissors, Coffee, Sparkles } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (loginEmail?: string, loginPassword?: string) => {
    const e = loginEmail || email;
    const p = loginPassword || password;

    if (!e || !p) {
      setError("Please enter both email and password.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e, password: p }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error?.message || "Invalid email or password");
      }

      const role = json.data?.user?.role;
      const isAdmin = json.data?.user?.isPlatformAdmin;

      // Smart redirect based on role or explicit redirect query
      if (redirectUrl) {
        router.push(redirectUrl);
      } else if (isAdmin) {
        router.push("/admin");
      } else if (role === "staff") {
        router.push("/staff");
      } else {
        router.push("/dashboard");
      }
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to sign in";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoLogin = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword("Password123!");
    handleLogin(demoEmail, "Password123!");
  };

  return (
    <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900 text-white p-6 sm:p-8 text-center relative overflow-hidden">
        <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center mx-auto mb-3 shadow-lg shadow-indigo-500/30">
          <QrCode className="w-6 h-6" />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Sign in to LoyaltyPlatform</h1>
        <p className="text-xs text-slate-400 mt-1">Access your business dashboard, staff scanner, or admin portal</p>
      </div>

      <div className="p-6 sm:p-8 space-y-6">
        {/* Quick 1-Click Demo Buttons */}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            1-Click Demo Logins (Instant Access)
          </label>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => handleQuickDemoLogin("barber-owner@platform.local")}
              className="flex items-center gap-1.5 p-2 rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors text-left"
            >
              <Scissors className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <div>
                <p className="font-semibold text-slate-900">Barber Owner</p>
                <p className="text-[10px] text-slate-500">Dashboard</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickDemoLogin("barber-staff@platform.local")}
              className="flex items-center gap-1.5 p-2 rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors text-left"
            >
              <Scissors className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <div>
                <p className="font-semibold text-slate-900">Barber Staff</p>
                <p className="text-[10px] text-slate-500">Scanner / Terminal</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickDemoLogin("coffee-owner@platform.local")}
              className="flex items-center gap-1.5 p-2 rounded-lg border border-slate-200 hover:border-amber-400 hover:bg-amber-50/50 transition-colors text-left"
            >
              <Coffee className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <div>
                <p className="font-semibold text-slate-900">Coffee Owner</p>
                <p className="text-[10px] text-slate-500">Stamp Dashboard</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleQuickDemoLogin("admin@platform.local")}
              className="flex items-center gap-1.5 p-2 rounded-lg border border-slate-200 hover:border-rose-400 hover:bg-rose-50/50 transition-colors text-left"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <div>
                <p className="font-semibold text-slate-900">Super Admin</p>
                <p className="text-[10px] text-slate-500">Console</p>
              </div>
            </button>
          </div>
        </div>

        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-slate-200"></div>
          <span className="flex-shrink mx-3 text-xs text-slate-400 font-medium">Or enter credentials</span>
          <div className="flex-grow border-t border-slate-200"></div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Credentials Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
          className="space-y-4"
        >
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@platform.local"
                required
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Dev accounts password: <span className="font-mono text-slate-600">Password123!</span></p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-xl shadow-md shadow-indigo-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="text-center pt-2">
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-800 transition-colors">
            ← Back to Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4">
      <Suspense fallback={<div className="p-8 text-slate-500 text-sm">Loading login portal...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}

