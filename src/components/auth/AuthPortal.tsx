"use client";

import React, { useState, useEffect, Suspense } from "react";
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
  Sparkles,
  Store,
  Building2,
  ExternalLink,
  Search,
  Copy,
  Check,
  Smartphone,
  UserPlus,
  KeyRound,
} from "lucide-react";

export type AuthMode = "signin" | "signup";

interface RegisteredTenant {
  id: string;
  slug: string;
  name: string;
  status: string;
  industry?: string | null;
  brandPrimaryHex?: string | null;
  logoUrl?: string | null;
  plan: string;
}

interface AuthPortalProps {
  initialMode?: AuthMode;
}

function AuthForm({ initialMode = "signin" }: AuthPortalProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect");
  const queryMode = searchParams.get("mode") as AuthMode | null;

  const [mode, setMode] = useState<AuthMode>(
    queryMode === "signup" || queryMode === "signin" ? queryMode : initialMode
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Super Admin Sign In inputs
  const [adminEmail, setAdminEmail] = useState("admin@platform.local");
  const [adminPassword, setAdminPassword] = useState("Password123!");

  // Sign Up inputs (Business Owner only)
  const [signupName, setSignupName] = useState("");
  const [signupBusinessName, setSignupBusinessName] = useState("");
  const [signupCategory, setSignupCategory] = useState("Coffee Shop & Cafe");
  const [signupStaffCount, setSignupStaffCount] = useState(5);
  const [signupManagerCount, setSignupManagerCount] = useState(2);
  const [signupProgrammeType, setSignupProgrammeType] = useState<"points" | "stamps">("points");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");

  // Approval state & newly created store info
  const [pendingApprovalSuccess, setPendingApprovalSuccess] = useState(false);
  const [createdStoreData, setCreatedStoreData] = useState<{
    name: string;
    slug: string;
    storeUrl: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Registered Stores Directory State
  const [registeredTenants, setRegisteredTenants] = useState<RegisteredTenant[]>([]);
  const [storeSearchQuery, setStoreSearchQuery] = useState("");
  const [loadingStores, setLoadingStores] = useState(true);

  // Fetch registered stores on mount
  useEffect(() => {
    async function loadStores() {
      try {
        const res = await fetch("/api/v1/public/tenants");
        if (res.ok) {
          const json = await res.json();
          setRegisteredTenants(json.data || []);
        }
      } catch (err) {
        console.error("Failed to fetch public tenants", err);
      } finally {
        setLoadingStores(false);
      }
    }
    loadStores();
  }, []);

  // Filtered stores
  const filteredStores = registeredTenants.filter((t) => {
    if (!storeSearchQuery.trim()) return true;
    const q = storeSearchQuery.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.slug.toLowerCase().includes(q) ||
      (t.industry && t.industry.toLowerCase().includes(q))
    );
  });

  // Handle Super Admin Login submission
  const handleAdminLogin = async (overrideEmail?: string, overridePassword?: string) => {
    const e = overrideEmail || adminEmail;
    const p = overridePassword || adminPassword;

    if (!e || !p) {
      setError("Please enter both administrator email and password.");
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
        throw new Error(json.error?.message || "Invalid administrator credentials");
      }

      const isAdmin = json.data?.user?.isPlatformAdmin;

      if (!isAdmin) {
        setError("This login is restricted to Platform Super Admins. Business owners and staff must log in directly on their store page.");
        return;
      }

      router.push(redirectUrl || "/admin");
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to sign in";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Handle Business Owner Sign Up submission
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupName.trim() || !signupEmail.trim() || !signupPassword.trim()) {
      setError("Please fill in all required fields.");
      return;
    }

    if (!signupBusinessName.trim()) {
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
          role: "owner",
          name: signupName.trim(),
          email: signupEmail.trim(),
          password: signupPassword,
          businessName: signupBusinessName.trim(),
          category: signupCategory,
          requestedStaffCount: Number(signupStaffCount),
          requestedManagerCount: Number(signupManagerCount),
          programmeType: signupProgrammeType,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error?.message || "Registration failed");
      }

      const storeUrl =
        json.data?.storeUrl ||
        (json.data?.tenant?.slug
          ? `${window.location.origin}/b/${json.data.tenant.slug}`
          : `${window.location.origin}/b/store`);

      setCreatedStoreData({
        name: signupBusinessName.trim(),
        slug: json.data?.tenant?.slug || "store",
        storeUrl,
      });

      setPendingApprovalSuccess(true);

      // Re-fetch directory so new store shows immediately
      try {
        const storeRes = await fetch("/api/v1/public/tenants");
        if (storeRes.ok) {
          const storeJson = await storeRes.json();
          setRegisteredTenants(storeJson.data || []);
        }
      } catch {
        // ignore
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (createdStoreData?.storeUrl) {
      navigator.clipboard.writeText(createdStoreData.storeUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  return (
    <div className="w-full h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      {/* Enterprise Tight Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* ======================================================== */}
        {/* LEFT COLUMN: REGISTERED STORES DIRECTORY (NO FLUFF)     */}
        {/* ======================================================== */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 flex flex-col justify-between">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900 leading-tight">
                    Registered Businesses &amp; Storefronts
                  </h2>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Store owners, staff &amp; customers log in directly on their store page:
                  </p>
                </div>
              </div>

              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                {registeredTenants.length} Stores
              </span>
            </div>

            {/* Compact Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search registered stores by name or category..."
                value={storeSearchQuery}
                onChange={(e) => setStoreSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
              />
            </div>

            {/* Tight Scrollable Stores List */}
            {loadingStores ? (
              <div className="py-12 text-center text-xs text-slate-400 font-medium">
                Loading stores directory...
              </div>
            ) : filteredStores.length === 0 ? (
              <div className="py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <Store className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
                <p className="text-xs font-bold text-slate-700">No stores found.</p>
                <p className="text-[11px] text-slate-400">Register a new store using the form on the right.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                {filteredStores.map((store) => {
                  const brandColor = store.brandPrimaryHex || "#4f46e5";
                  const storeUrl = `/b/${store.slug}`;
                  const isPending = store.status === "pending";

                  return (
                    <div
                      key={store.id}
                      className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-white hover:border-indigo-400 hover:shadow-sm transition-all flex items-center justify-between gap-3 group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-xs shadow-2xs shrink-0"
                          style={{ backgroundColor: brandColor }}
                        >
                          {store.name.slice(0, 1)}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h3 className="font-extrabold text-xs text-slate-900 truncate">
                              {store.name}
                            </h3>
                            <span
                              className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded shrink-0 ${
                                isPending
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {isPending ? "Pending" : "Active"}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 font-mono truncate">
                            /b/{store.slug}
                          </p>
                        </div>
                      </div>

                      <Link
                        href={storeUrl}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-indigo-600 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-lg shadow-2xs transition-colors shrink-0"
                      >
                        Visit Store <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Informational Pill */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              Multi-tenant isolation &amp; double-entry ledger
            </span>
            <span className="text-slate-400 font-mono text-[10px]">
              Postgres 16 RLS
            </span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* RIGHT COLUMN: SUPER ADMIN LOGIN OR OWNER REGISTER        */}
        {/* ======================================================== */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 sm:p-6 flex flex-col justify-between">
          <div>
            {/* Top Mode Tabs: Super Admin Login vs Register Business */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 mb-4">
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  mode === "signin"
                    ? "bg-white text-indigo-700 shadow-2xs font-black"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                Super Admin Login
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  mode === "signup"
                    ? "bg-white text-indigo-700 shadow-2xs font-black"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <UserPlus className="w-3.5 h-3.5 text-amber-500" />
                Register Business (Sign Up)
              </button>
            </div>

            {/* Error Notification */}
            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            {/* VIEW A: SUCCESS STATE (AFTER REGISTERING BUSINESS) */}
            {pendingApprovalSuccess && createdStoreData ? (
              <div className="p-5 text-center space-y-3.5 bg-emerald-50/70 border border-emerald-200 rounded-2xl animate-in zoom-in-95">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mx-auto shadow-inner">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-200/60 px-2 py-0.5 rounded-full">
                    Welcome Email Dispatched
                  </span>
                  <h3 className="font-black text-base text-slate-900 mt-1.5">
                    {createdStoreData.name} Registered!
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Your business has been created. A welcome email containing your direct store URL and login instructions has been sent to your email.
                  </p>
                </div>

                {/* Direct Store URL Box */}
                <div className="bg-white p-3 rounded-xl border border-emerald-300 text-left space-y-1 shadow-2xs">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">
                    Your Dedicated Store Website Link:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      readOnly
                      value={createdStoreData.storeUrl}
                      className="flex-1 font-mono text-xs bg-slate-50 p-1.5 rounded-lg border border-slate-200 text-slate-900 select-all font-bold"
                    />
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                      title="Copy Link"
                    >
                      {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Action Button */}
                <div className="pt-1 space-y-2">
                  <Link
                    href={`/b/${createdStoreData.slug}`}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
                  >
                    Open Your Store Website Page →
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingApprovalSuccess(false);
                      setMode("signin");
                      setError(null);
                    }}
                    className="text-xs text-slate-500 hover:text-slate-800 font-semibold underline cursor-pointer"
                  >
                    Return to Super Admin Login
                  </button>
                </div>
              </div>
            ) : mode === "signin" ? (
              /* VIEW B: STRICTLY SUPER ADMIN CONSOLE LOGIN */
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Platform Super Admin Console
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Restricted platform access to review pending businesses, audit ledgers, and manage limits.
                  </p>
                </div>

                {/* 1-Click Super Admin Quick Demo */}
                <button
                  type="button"
                  onClick={() => handleAdminLogin("admin@platform.local", "Password123!")}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-300 transition-all text-left cursor-pointer group shadow-2xs"
                >
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                    <div>
                      <p className="font-bold text-xs text-slate-900">1-Click Platform Super Admin</p>
                      <p className="text-[10px] text-slate-400 font-mono">admin@platform.local</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-indigo-600 group-hover:translate-x-0.5 transition-transform">
                    Sign In →
                  </span>
                </button>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAdminLogin();
                  }}
                  className="space-y-3 pt-1"
                >
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Administrator Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="email"
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        placeholder="admin@platform.local"
                        required
                        className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="password"
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer pt-2.5"
                  >
                    {loading ? "Signing in..." : "Sign In to Super Admin Console →"}
                  </button>
                </form>

                {/* Explicit Guidance for Store Owners */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 leading-relaxed">
                  <span className="font-bold text-slate-800">Business Owner Notice:</span> Owners and staff log in directly on their store&apos;s page (e.g. <span className="font-mono text-indigo-600 font-semibold">/b/your-store</span>), not on the platform console. Select your store on the left to open its portal.
                </div>
              </div>
            ) : (
              /* VIEW C: BUSINESS OWNER SIGN UP ONLY */
              <div className="space-y-3.5">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Register Business &amp; Launch Store
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Your dedicated store loyalty website will be created immediately upon registration.
                  </p>
                </div>

                <form onSubmit={handleSignup} className="space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Owner Full Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Alex Johnson"
                        value={signupName}
                        onChange={(e) => setSignupName(e.target.value)}
                        required
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Business / Shop Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Royal Coffee Roasters"
                        value={signupBusinessName}
                        onChange={(e) => setSignupBusinessName(e.target.value)}
                        required
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Business Category
                      </label>
                      <select
                        value={signupCategory}
                        onChange={(e) => setSignupCategory(e.target.value)}
                        className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
                      >
                        <option value="Coffee Shop & Cafe">☕ Coffee Shop &amp; Cafe</option>
                        <option value="Restaurant & Dining">🍽️ Restaurant &amp; Dining</option>
                        <option value="Barbershop & Grooming">✂️ Barbershop &amp; Grooming</option>
                        <option value="Salon & Beauty Spa">💅 Salon &amp; Beauty Spa</option>
                        <option value="Retail Store & Boutique">🛍️ Retail Store &amp; Boutique</option>
                        <option value="Fitness & Wellness">🏋️ Fitness &amp; Wellness</option>
                        <option value="Automotive & Car Wash">🚗 Automotive &amp; Car Wash</option>
                        <option value="Other Commercial Business">🏢 Other Commercial Business</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Loyalty Engine
                      </label>
                      <select
                        value={signupProgrammeType}
                        onChange={(e) => setSignupProgrammeType(e.target.value as "points" | "stamps")}
                        className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
                      >
                        <option value="points">Points Mode (£1 = 1 Point)</option>
                        <option value="stamps">Stamps Mode (1 Visit = 1 Stamp)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Staff Accounts
                      </label>
                      <select
                        value={signupStaffCount}
                        onChange={(e) => setSignupStaffCount(Number(e.target.value))}
                        className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
                      >
                        <option value={2}>2 Staff</option>
                        <option value={5}>5 Staff</option>
                        <option value={10}>10 Staff</option>
                        <option value={25}>25 Staff</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Managers
                      </label>
                      <select
                        value={signupManagerCount}
                        onChange={(e) => setSignupManagerCount(Number(e.target.value))}
                        className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
                      >
                        <option value={1}>1 Manager</option>
                        <option value={2}>2 Managers</option>
                        <option value={5}>5 Managers</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      Owner Email Address
                    </label>
                    <input
                      type="email"
                      placeholder="owner@yourbusiness.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      Password (min. 8 characters)
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      required
                      minLength={8}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
                    />
                  </div>

                  <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl text-amber-900 text-[10px] leading-relaxed flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Your store link will be generated automatically and emailed to your inbox.</span>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer pt-2.5"
                  >
                    {loading ? "Registering Business..." : "Register Business & Generate Storefront →"}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthPortal({ initialMode = "signin" }: AuthPortalProps) {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-lg p-10 bg-white rounded-2xl border border-slate-200 shadow-xl text-center text-slate-500 text-sm">
          Loading portal...
        </div>
      }
    >
      <AuthForm initialMode={initialMode} />
    </Suspense>
  );
}
