"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  QrCode,
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Scissors,
  Coffee,
  Sparkles,
  Store,
  User,
  Smartphone,
  Check,
  Building2,
  Info,
} from "lucide-react";

export type AuthMode = "signin" | "signup";
export type AuthRole = "owner" | "staff" | "customer" | "admin";

interface AuthPortalProps {
  initialMode?: AuthMode;
}

function AuthForm({ initialMode = "signin" }: AuthPortalProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect");
  const queryMode = searchParams.get("mode") as AuthMode | null;
  const queryRole = searchParams.get("role") as AuthRole | null;

  const [mode, setMode] = useState<AuthMode>(
    queryMode === "signup" || queryMode === "signin" ? queryMode : initialMode
  );

  // Selected Role
  const [selectedRole, setSelectedRole] = useState<AuthRole>(
    queryRole && ["owner", "staff", "customer", "admin"].includes(queryRole)
      ? queryRole
      : mode === "signup"
      ? "owner"
      : "owner"
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sign In inputs
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Sign Up inputs
  const [signupName, setSignupName] = useState("");
  const [signupBusinessName, setSignupBusinessName] = useState("");
  const [signupProgrammeType, setSignupProgrammeType] = useState<"points" | "stamps">("points");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");

  // Target destination based on role & mode
  const getRoleDestination = (role: AuthRole): string => {
    if (redirectUrl) return redirectUrl;
    switch (role) {
      case "owner":
        return "/dashboard";
      case "staff":
        return "/staff";
      case "customer":
        return "/me";
      case "admin":
        return "/admin";
      default:
        return "/dashboard";
    }
  };

  // Handle Login submission
  const handleLogin = async (overrideEmail?: string, overridePassword?: string) => {
    const e = overrideEmail || loginEmail;
    const p = overridePassword || loginPassword;

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

      const userRole = json.data?.user?.role;
      const isAdmin = json.data?.user?.isPlatformAdmin;

      if (redirectUrl) {
        router.push(redirectUrl);
      } else if (isAdmin) {
        router.push("/admin");
      } else if (userRole === "staff") {
        router.push("/staff");
      } else if (userRole === "owner") {
        router.push("/dashboard");
      } else {
        router.push("/me");
      }
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to sign in";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // 1-Click Demo Logins
  const handleQuickDemo = (demoEmail: string, demoRole: AuthRole) => {
    setSelectedRole(demoRole);
    setLoginEmail(demoEmail);
    setLoginPassword("Password123!");
    handleLogin(demoEmail, "Password123!");
  };

  // Handle Sign Up submission
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupName.trim() || !signupEmail.trim() || !signupPassword.trim()) {
      setError("Please fill in all required fields.");
      return;
    }

    if (selectedRole === "owner" && !signupBusinessName.trim()) {
      setError("Please enter your business or restaurant name.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: selectedRole === "owner" ? "owner" : "customer",
          name: signupName.trim(),
          email: signupEmail.trim(),
          password: signupPassword,
          businessName: selectedRole === "owner" ? signupBusinessName.trim() : undefined,
          programmeType: signupProgrammeType,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error?.message || "Registration failed");
      }

      const redirect = redirectUrl || json.data?.redirectUrl || (selectedRole === "owner" ? "/dashboard" : "/me");
      router.push(redirect);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const currentDestination = getRoleDestination(selectedRole);
  const googleOAuthUrl = `/api/v1/auth/google?role=${selectedRole}&returnTo=${encodeURIComponent(currentDestination)}`;

  return (
    <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200/90 shadow-2xl overflow-hidden my-6 transition-all">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white p-6 sm:p-7 text-center relative overflow-hidden">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto mb-3 shadow-lg shadow-indigo-500/30">
          <QrCode className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-black tracking-tight text-white">
          {mode === "signin" ? "Sign In to Your Account" : "Create Your Loyalty Account"}
        </h1>
        <p className="text-xs text-slate-300 mt-1 max-w-sm mx-auto">
          {mode === "signin"
            ? "Select your role, enter credentials or continue directly with Google"
            : "Choose your role below to launch a programme or earn customer rewards"}
        </p>

        {/* Primary Mode Tabs: Sign In vs Sign Up */}
        <div className="flex bg-slate-800/90 p-1 rounded-2xl mt-5 border border-slate-700/80 max-w-md mx-auto">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              mode === "signin"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError(null);
              if (selectedRole === "staff" || selectedRole === "admin") {
                setSelectedRole("owner");
              }
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              mode === "signup"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            Create Account (Sign Up)
          </button>
        </div>
      </div>

      <div className="p-6 sm:p-7 space-y-6">
        {/* Error Notification */}
        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* ======================================================== */}
        {/* STEP 1: ROLE SELECTION                                   */}
        {/* ======================================================== */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 inline-flex items-center justify-center text-[10px] font-black">
                1
              </span>
              Select Your Role
            </label>
            <span className="text-[11px] text-slate-400 font-medium">
              {mode === "signin" ? "Who are you signing in as?" : "What account do you need?"}
            </span>
          </div>

          {mode === "signup" ? (
            /* Sign Up Role Choices (Owner vs Customer) */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setSelectedRole("owner");
                  setError(null);
                }}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative ${
                  selectedRole === "owner"
                    ? "border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-600/20 shadow-sm"
                    : "border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                    <Store className="w-4 h-4" />
                  </div>
                  {selectedRole === "owner" && (
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                  )}
                </div>
                <p className="font-bold text-slate-900 text-xs leading-tight">Business Owner / CEO</p>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  Restaurant, Cafe, Barber, Salon, Car Wash
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedRole("customer");
                  setError(null);
                }}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative ${
                  selectedRole === "customer"
                    ? "border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-600/20 shadow-sm"
                    : "border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                    <User className="w-4 h-4" />
                  </div>
                  {selectedRole === "customer" && (
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                  )}
                </div>
                <p className="font-bold text-slate-900 text-xs leading-tight">Customer / Member</p>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  Collect points/stamps & claim rewards
                </p>
              </button>
            </div>
          ) : (
            /* Sign In Role Choices (Owner, Staff, Customer, Super Admin) */
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setSelectedRole("owner");
                  setError(null);
                }}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                  selectedRole === "owner"
                    ? "border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-600/20 font-bold text-slate-900"
                    : "border-slate-200 hover:border-slate-300 text-slate-700"
                }`}
              >
                <Store className={`w-4 h-4 shrink-0 ${selectedRole === "owner" ? "text-indigo-600" : "text-slate-500"}`} />
                <div className="min-w-0">
                  <p className="text-xs truncate">Business Owner</p>
                  <p className="text-[10px] text-slate-400 font-normal">Dashboard</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedRole("staff");
                  setError(null);
                }}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                  selectedRole === "staff"
                    ? "border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-600/20 font-bold text-slate-900"
                    : "border-slate-200 hover:border-slate-300 text-slate-700"
                }`}
              >
                <Smartphone className={`w-4 h-4 shrink-0 ${selectedRole === "staff" ? "text-indigo-600" : "text-slate-500"}`} />
                <div className="min-w-0">
                  <p className="text-xs truncate">Frontline Staff</p>
                  <p className="text-[10px] text-slate-400 font-normal">QR Terminal</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedRole("customer");
                  setError(null);
                }}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                  selectedRole === "customer"
                    ? "border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-600/20 font-bold text-slate-900"
                    : "border-slate-200 hover:border-slate-300 text-slate-700"
                }`}
              >
                <User className={`w-4 h-4 shrink-0 ${selectedRole === "customer" ? "text-indigo-600" : "text-slate-500"}`} />
                <div className="min-w-0">
                  <p className="text-xs truncate">Customer Member</p>
                  <p className="text-[10px] text-slate-400 font-normal">My Passes</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedRole("admin");
                  setError(null);
                }}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                  selectedRole === "admin"
                    ? "border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-600/20 font-bold text-slate-900"
                    : "border-slate-200 hover:border-slate-300 text-slate-700"
                }`}
              >
                <ShieldCheck className={`w-4 h-4 shrink-0 ${selectedRole === "admin" ? "text-rose-600" : "text-slate-500"}`} />
                <div className="min-w-0">
                  <p className="text-xs truncate">Super Admin</p>
                  <p className="text-[10px] text-slate-400 font-normal">Console</p>
                </div>
              </button>
            </div>
          )}

          {mode === "signup" && (
            <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              Staff logins are provisioned by your business manager. If you already have credentials, please{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setSelectedRole("staff");
                }}
                className="text-indigo-600 font-semibold hover:underline cursor-pointer"
              >
                Sign in here
              </button>
              .
            </p>
          )}
        </div>

        {/* ======================================================== */}
        {/* STEP 2: AUTHENTICATION METHOD (GOOGLE OR CREDENTIALS)    */}
        {/* ======================================================== */}
        <div className="space-y-4 pt-1 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-700 inline-flex items-center justify-center text-[10px] font-black">
                2
              </span>
              {mode === "signup"
                ? `Sign Up as ${selectedRole === "owner" ? "Business Owner" : "Customer"}`
                : `Sign In as ${
                    selectedRole === "owner"
                      ? "Business Owner"
                      : selectedRole === "staff"
                      ? "Staff Member"
                      : selectedRole === "admin"
                      ? "Super Admin"
                      : "Customer"
                  }`}
            </label>
          </div>

          {/* Quick 1-Click Demo Buttons for Testing (in Sign In) */}
          {mode === "signin" && (
            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-indigo-600" />
                  Instant 1-Click Demo Logins
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Password: Password123!</span>
              </div>

              {selectedRole === "owner" && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleQuickDemo("barber-owner@platform.local", "owner")}
                    className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors text-left cursor-pointer shadow-2xs"
                  >
                    <Scissors className="w-4 h-4 text-indigo-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">Barber Owner</p>
                      <p className="text-[10px] text-slate-400">Points Model</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDemo("coffee-owner@platform.local", "owner")}
                    className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 hover:border-amber-400 hover:bg-amber-50/50 transition-colors text-left cursor-pointer shadow-2xs"
                  >
                    <Coffee className="w-4 h-4 text-amber-700 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">Coffee Owner</p>
                      <p className="text-[10px] text-slate-400">Stamps Model</p>
                    </div>
                  </button>
                </div>
              )}

              {selectedRole === "staff" && (
                <button
                  type="button"
                  onClick={() => handleQuickDemo("barber-staff@platform.local", "staff")}
                  className="w-full flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors text-left cursor-pointer shadow-2xs text-xs"
                >
                  <Scissors className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">1-Click Staff Scanner (Alex Rivera)</p>
                    <p className="text-[10px] text-slate-400">Opens Frontline Staff Terminal</p>
                  </div>
                </button>
              )}

              {selectedRole === "admin" && (
                <button
                  type="button"
                  onClick={() => handleQuickDemo("admin@platform.local", "admin")}
                  className="w-full flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 hover:border-rose-400 hover:bg-rose-50/50 transition-colors text-left cursor-pointer shadow-2xs text-xs"
                >
                  <ShieldCheck className="w-4 h-4 text-rose-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">1-Click Platform Super Admin</p>
                    <p className="text-[10px] text-slate-400">Manage all tenants & system health</p>
                  </div>
                </button>
              )}

              {selectedRole === "customer" && (
                <button
                  type="button"
                  onClick={() => handleQuickDemo("member1@example.com", "customer")}
                  className="w-full flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors text-left cursor-pointer shadow-2xs text-xs"
                >
                  <User className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">1-Click Customer Account</p>
                    <p className="text-[10px] text-slate-400">View customer privacy center & passes</p>
                  </div>
                </button>
              )}
            </div>
          )}

          {/* Google OAuth Button */}
          <div>
            <a
              href={googleOAuthUrl}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-2xl border border-slate-300 hover:border-indigo-400 hover:bg-slate-50 transition-all font-bold text-xs shadow-xs text-slate-800"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>
                {mode === "signup"
                  ? `Sign up with Google (${selectedRole === "owner" ? "Business Owner" : "Customer"})`
                  : `Sign in with Google (${
                      selectedRole === "owner"
                        ? "Business Owner"
                        : selectedRole === "staff"
                        ? "Staff"
                        : selectedRole === "admin"
                        ? "Admin"
                        : "Customer"
                    })`}
              </span>
            </a>
          </div>

          {/* Divider */}
          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-3 text-[11px] text-slate-400 font-bold uppercase tracking-wider">
              {mode === "signup" ? "Or register with email" : "Or enter credentials"}
            </span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {/* Form Content */}
          {mode === "signin" ? (
            /* ==================================================== */
            /* SIGN IN FORM                                         */
            /* ==================================================== */
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleLogin();
              }}
              className="space-y-3.5"
            >
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder={
                      selectedRole === "owner"
                        ? "owner@restaurant.local"
                        : selectedRole === "staff"
                        ? "staff@restaurant.local"
                        : selectedRole === "admin"
                        ? "admin@platform.local"
                        : "customer@example.com"
                    }
                    required
                    className="w-full pl-10 pr-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-10 pr-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/25 transition-all disabled:opacity-50 cursor-pointer pt-3 mt-1"
              >
                {loading ? "Signing in..." : `Sign In as ${selectedRole.toUpperCase()}`}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          ) : (
            /* ==================================================== */
            /* SIGN UP FORM                                         */
            /* ==================================================== */
            <form onSubmit={handleSignup} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Alex Johnson"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
                />
              </div>

              {selectedRole === "owner" && (
                <>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Business / Restaurant Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Bella Italia Trattoria"
                      value={signupBusinessName}
                      onChange={(e) => setSignupBusinessName(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Loyalty Engine Model
                    </label>
                    <select
                      value={signupProgrammeType}
                      onChange={(e) => setSignupProgrammeType(e.target.value as "points" | "stamps")}
                      className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
                    >
                      <option value="points">Points Mode (£1 Spend = 1 Point) - Restaurants, Salons, Retail</option>
                      <option value="stamps">Stamps Mode (1 Stamp per Visit) - Coffee Shops, Car Washes</option>
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Password</label>
                <input
                  type="password"
                  placeholder="At least 8 characters"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-600/25 transition-all disabled:opacity-50 cursor-pointer pt-3 mt-1"
              >
                {loading
                  ? "Creating Account..."
                  : selectedRole === "owner"
                  ? "Create Business & Open Dashboard →"
                  : "Create Member Account →"}
              </button>
            </form>
          )}
        </div>

        {/* Bottom Switcher */}
        <div className="pt-3 text-center border-t border-slate-100">
          {mode === "signin" ? (
            <p className="text-xs text-slate-500">
              Don&apos;t have an account yet?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                  if (selectedRole === "staff" || selectedRole === "admin") {
                    setSelectedRole("owner");
                  }
                }}
                className="text-indigo-600 hover:text-indigo-700 font-bold hover:underline cursor-pointer"
              >
                Create Account (Sign Up)
              </button>
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                }}
                className="text-indigo-600 hover:text-indigo-700 font-bold hover:underline cursor-pointer"
              >
                Sign In
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function AuthPortal({ initialMode = "signin" }: AuthPortalProps) {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-lg p-10 bg-white rounded-3xl border border-slate-200 shadow-xl text-center text-slate-500 text-sm">
          Loading authentication portal...
        </div>
      }
    >
      <AuthForm initialMode={initialMode} />
    </Suspense>
  );
}

