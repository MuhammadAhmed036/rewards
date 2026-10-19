"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  QrCode,
  Sparkles,
  ShieldCheck,
  LayoutDashboard,
  Smartphone,
  ExternalLink,
  Lock,
  ArrowRight,
  CheckCircle2,
  Receipt,
  Scale,
  Award,
  ChevronRight,
  Coffee,
  Scissors,
  Building2,
  Users,
  BarChart3,
  Database,
  Zap,
  Check,
  Globe,
  RefreshCw,
  Sliders,
  Star,
  Activity,
  Layers,
  ShoppingBag,
  Car,
} from "lucide-react";

export default function Home() {
  const [activeIndustryTab, setActiveIndustryTab] = useState<"restaurants" | "coffee" | "barbers" | "auto">("restaurants");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Enterprise Banner */}
      <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 border-b border-indigo-900/40 text-xs py-2 px-4 text-center flex items-center justify-center gap-3">
        <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span className="text-slate-300 font-medium">
          <strong className="text-white">LoyaltyPlatform Enterprise 2.0:</strong> Next-Gen QR Loyalty, Anti-Gating Review Engine & Double-Entry Ledger.
        </span>
        <Link
          href="/signup?role=owner"
          className="text-indigo-400 hover:text-indigo-300 font-bold underline inline-flex items-center gap-1 ml-1"
        >
          Deploy in 60s <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Main Top Navigation */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 text-white flex items-center justify-center font-black text-xl shadow-lg shadow-indigo-600/30 border border-indigo-400/20">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-lg text-white tracking-tight">
                  LoyaltyPlatform<span className="text-indigo-400">.cloud</span>
                </span>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  ERP Edition
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block font-medium">
                Multi-Tenant High-Street Loyalty & Review Infrastructure
              </p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center gap-6 text-xs font-semibold text-slate-300">
            <a href="#architecture" className="hover:text-white transition-colors">
              Architecture
            </a>
            <a href="#industries" className="hover:text-white transition-colors">
              Industry Solutions
            </a>
            <a href="#anti-gating" className="hover:text-white transition-colors">
              Anti-Gating Policy
            </a>
            <a href="#demos" className="hover:text-white transition-colors">
              Live Sandboxes
            </a>
            <Link href="/admin" className="text-slate-400 hover:text-indigo-300 transition-colors flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5" />
              Platform Admin
            </Link>
          </nav>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2.5">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-200 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700/80 px-3.5 py-2 rounded-xl transition-all shadow-sm"
            >
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              Sign In
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-1.5 text-xs font-bold bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-600 text-white px-4 py-2 rounded-xl transition-all shadow-md shadow-indigo-600/30 border border-indigo-400/30 hover:scale-[1.02]"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              Deploy Free
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-20 sm:pt-24 sm:pb-28 border-b border-slate-800/80">
        {/* Subtle background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-indigo-600/10 blur-[140px] pointer-events-none rounded-full" />
        <div className="absolute -top-40 right-10 w-[400px] h-[400px] bg-violet-600/10 blur-[120px] pointer-events-none rounded-full" />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900 border border-slate-700/80 text-slate-300 text-xs font-semibold mb-6 shadow-inner">
            <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
            <span>ENTERPRISE B2B SAAS • MULTI-TENANT LOYALTY INFRASTRUCTURE</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white tracking-tight leading-[1.08] max-w-4xl mx-auto">
            The Autonomous Loyalty Cloud for{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-300">
              Modern High-Street Enterprise.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-base sm:text-xl text-slate-400 max-w-3xl mx-auto leading-relaxed font-normal">
            Zero customer app downloads. 3-second staff QR scans at checkout.
            Double-entry financial ledger, anti-gating Google Review acceleration, and strict UK GDPR compliance built into every transaction.
          </p>

          {/* Primary Action Buttons */}
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3.5">
            <Link
              href="/signup?role=owner"
              className="inline-flex items-center gap-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white px-7 py-4 rounded-2xl font-bold shadow-xl shadow-indigo-600/30 transition-all hover:scale-[1.02] text-sm border border-indigo-400/30"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Deploy Business Programme (Sign Up)</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 px-6 py-4 rounded-2xl font-bold transition-all hover:scale-[1.02] text-sm shadow-sm"
            >
              <LayoutDashboard className="w-4 h-4 text-indigo-400" />
              <span>Open Business ERP Dashboard</span>
            </Link>

            <Link
              href="/staff"
              className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 px-6 py-4 rounded-2xl font-bold transition-all hover:scale-[1.02] text-sm shadow-sm"
            >
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <span>Staff Terminal</span>
            </Link>
          </div>

          {/* Live System Operational Status */}
          <div className="mt-12 pt-8 border-t border-slate-800/80 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span className="text-slate-300 font-semibold">99.99% Cloud SLA</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-300 font-semibold">UK GDPR & ICO Compliant</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span className="text-slate-300 font-semibold">Anti-Gating Review Certified</span>
            </div>
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-violet-400" />
              <span className="text-slate-300 font-semibold">PostgreSQL Immutable Ledger</span>
            </div>
          </div>
        </div>

        {/* Interactive ERP Mockup Preview */}
        <div className="mt-14 max-w-6xl mx-auto px-4 sm:px-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 shadow-2xl overflow-hidden backdrop-blur-xl">
            {/* Window header */}
            <div className="bg-slate-900/90 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
                <span className="text-[11px] font-mono text-slate-400 ml-2">
                  https://loyaltyplatform.cloud/dashboard (Enterprise Command Console)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded-full">
                  PostgreSQL RLS Active
                </span>
              </div>
            </div>

            {/* Mockup Dashboard Content */}
            <div className="p-6 sm:p-8 space-y-6">
              {/* Executive Metric Cards Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold uppercase tracking-wider text-[10px]">Active Members</span>
                    <span className="text-emerald-400 font-bold">+18.4%</span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-white mt-1 tabular-nums">2,840</div>
                  <p className="text-[11px] text-slate-500 mt-1">Unique customer profiles</p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold uppercase tracking-wider text-[10px]">30-Day Velocity</span>
                    <span className="text-indigo-400 font-bold">+24.1%</span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-white mt-1 tabular-nums">1,120</div>
                  <p className="text-[11px] text-slate-500 mt-1">Repeat visits recorded</p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold uppercase tracking-wider text-[10px]">Ledger Volume</span>
                    <span className="text-violet-400 font-bold">100% Audited</span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-white mt-1 tabular-nums">£46,850</div>
                  <p className="text-[11px] text-slate-500 mt-1">Reconciled in minor pence</p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold uppercase tracking-wider text-[10px]">Google Reviews</span>
                    <span className="text-amber-400 font-bold">4.9 ★</span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-white mt-1 tabular-nums">418</div>
                  <p className="text-[11px] text-slate-500 mt-1">Zero-gated direct reviews</p>
                </div>
              </div>

              {/* Mockup Quick Launch Row */}
              <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-900/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-500/40 text-indigo-400 flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Experience the Live Multi-Tenant ERP Sandbox</h4>
                    <p className="text-xs text-slate-400">
                      Switch between Barbers (Points), Coffee Shops (Stamps), Cashier Terminal, or Admin Console.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href="/b/demo-barber"
                    className="px-3.5 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                  >
                    Demo Barber
                  </Link>
                  <Link
                    href="/b/demo-coffee"
                    className="px-3.5 py-2 text-xs font-bold rounded-xl bg-amber-700 hover:bg-amber-600 text-white transition-colors"
                  >
                    Demo Coffee
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Architecture & Engineering Pillars */}
      <section id="architecture" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-b border-slate-800/80">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-950/60 border border-indigo-800 px-3 py-1 rounded-full">
            Enterprise Architecture
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-white mt-3 tracking-tight">
            Built for Integrity, Scalability & Compliance
          </h2>
          <p className="mt-3 text-sm text-slate-400 leading-relaxed">
            Unlike legacy loyalty apps that leak customer data or store balances as mutable counters, LoyaltyPlatform Enterprise runs on strict financial and legal foundations.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Pillar 1 */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all">
            <div className="w-12 h-12 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center mb-4">
              <Receipt className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">Immutable Double-Entry Ledger</h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              PostgreSQL database triggers strictly prohibit <code className="text-indigo-300">UPDATE</code> and <code className="text-indigo-300">DELETE</code> operations. Every point earned, reversed, or redeemed is permanently auditable with staff attribution.
            </p>
          </div>

          {/* Pillar 2 */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all">
            <div className="w-12 h-12 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mb-4">
              <Scale className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">UK Minor Units (Pence)</h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Monetary values are calculated exclusively in minor integer units (pence). Floating-point rounding errors and fractional balance discrepancies are mathematically eliminated.
            </p>
          </div>

          {/* Pillar 3 */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all">
            <div className="w-12 h-12 rounded-xl bg-amber-600/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mb-4">
              <Star className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">Anti-Gating Review Policy</h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              100% compliant with Google Review Guidelines and UK Competition & Markets Authority (CMA) policies. Review links are never filtered by sentiment or conditioned on reward incentives.
            </p>
          </div>

          {/* Pillar 4 */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all">
            <div className="w-12 h-12 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center mb-4">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">UK GDPR & Data Portability</h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Automated Subject Access Requests (SAR JSON export), Article 7 consent tracking, and cryptographic Right to Erasure anonymisation ensure complete legal compliance.
            </p>
          </div>
        </div>
      </section>

      {/* Industry Solutions Switcher */}
      <section id="industries" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-b border-slate-800/80">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-950/60 border border-indigo-800 px-3 py-1 rounded-full">
            Configurable Engine
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-white mt-3 tracking-tight">
            Tailored for High-Street Retail & Hospitality
          </h2>
          <p className="mt-3 text-sm text-slate-400">
            A single engine that flexes to your exact business model — whether spend-based points, visit stamps, or tiered packages.
          </p>

          {/* Tabs */}
          <div className="flex flex-wrap justify-center gap-2 mt-8">
            {[
              { id: "restaurants", label: "Restaurants & Dining", icon: ShoppingBag },
              { id: "coffee", label: "Coffee Shops & Cafes", icon: Coffee },
              { id: "barbers", label: "Barbershops & Salons", icon: Scissors },
              { id: "auto", label: "Car Washes & Auto", icon: Car },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeIndustryTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveIndustryTab(tab.id as typeof activeIndustryTab)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                      : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content Display */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8 max-w-4xl mx-auto">
          {activeIndustryTab === "restaurants" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <span className="text-xs font-bold uppercase text-indigo-400">Spend-Based Points Engine</span>
                <h3 className="text-2xl font-black text-white mt-1">Full Service Dining & Bistros</h3>
                <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                  Customers earn 1 point per £1 spent on food and beverages. Staff enter bill totals at checkout; tips are tracked separately. Customers unlock £5, £15, or £30 voucher rewards directly on their mobile pass.
                </p>
                <div className="mt-5 space-y-2 text-xs font-semibold text-slate-300">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Bill-total spend calculation with minor pence precision</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Direct Google Review link on checkout completion</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Cashier shift transaction audit trail</span>
                  </div>
                </div>
              </div>
              <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                <div className="text-xs text-slate-400 font-bold uppercase mb-2">Checkout Simulation</div>
                <div className="text-3xl font-black text-white">£45.50 Bill</div>
                <div className="text-xs text-emerald-400 font-bold mt-1">+45 Points Credited</div>
                <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-400">
                  Staff attribution: <span className="text-white font-semibold">Sarah (Table 4)</span>
                </div>
              </div>
            </div>
          )}

          {activeIndustryTab === "coffee" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <span className="text-xs font-bold uppercase text-amber-400">Digital Stamp Card Engine</span>
                <h3 className="text-2xl font-black text-white mt-1">Speciality Coffee & Bakeries</h3>
                <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                  Replace paper punch cards that get lost or laundered. 1 visit = 1 stamp. After 8 stamps, the customer unlocks a complimentary hot drink or pastry.
                </p>
                <div className="mt-5 space-y-2 text-xs font-semibold text-slate-300">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-amber-400" />
                    <span>1-second QR tap at counter</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-amber-400" />
                    <span>Duplicate visit guard blocks multiple credits within 30 mins</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-amber-400" />
                    <span>Printable tent cards and counter display QR assets</span>
                  </div>
                </div>
              </div>
              <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                <div className="text-xs text-slate-400 font-bold uppercase mb-2">Punch Card Status</div>
                <div className="grid grid-cols-4 gap-2 my-3">
                  {[1, 2, 3, 4, 5, 6, 7].map((s) => (
                    <div key={s} className="h-10 rounded-lg bg-amber-600 text-white font-bold flex items-center justify-center text-xs">
                      ✓
                    </div>
                  ))}
                  <div className="h-10 rounded-lg border border-dashed border-amber-500/50 text-amber-400 font-bold flex items-center justify-center text-xs">
                    Free
                  </div>
                </div>
                <span className="text-xs text-amber-300 font-semibold">1 stamp until Free Coffee!</span>
              </div>
            </div>
          )}

          {activeIndustryTab === "barbers" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <span className="text-xs font-bold uppercase text-indigo-400">Service Milestones Engine</span>
                <h3 className="text-2xl font-black text-white mt-1">Barbershops & Hair Salons</h3>
                <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                  Reward repeat grooming appointments and product retail purchases. Encourage client retention with tier bonuses and complimentary beard trims or treatments.
                </p>
                <div className="mt-5 space-y-2 text-xs font-semibold text-slate-300">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-400" />
                    <span>Barber attribution on every transaction</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-400" />
                    <span>Client retention tracking & lapse reminders</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-400" />
                    <span>Private escalation channel for customer feedback</span>
                  </div>
                </div>
              </div>
              <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                <div className="text-xs text-slate-400 font-bold uppercase mb-2">Client Card</div>
                <div className="text-xl font-bold text-white">Classic Fade & Beard Trim</div>
                <div className="text-xs text-indigo-400 font-bold mt-1">120 Lifetime Points</div>
                <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-400">
                  Reward Available: <span className="text-emerald-400 font-bold">Complimentary Hot Towel Treatment</span>
                </div>
              </div>
            </div>
          )}

          {activeIndustryTab === "auto" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <span className="text-xs font-bold uppercase text-cyan-400">Fleet & Wash Passes</span>
                <h3 className="text-2xl font-black text-white mt-1">Car Washes & Auto Care</h3>
                <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                  Track wash visits, valeting packages, and recurring maintenance. Bay operators scan windshield QR codes or customer mobile phones in seconds.
                </p>
                <div className="mt-5 space-y-2 text-xs font-semibold text-slate-300">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400" />
                    <span>Rugged scanner interface designed for outdoor bays</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400" />
                    <span>Multi-location fleet account support</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400" />
                    <span>Valet package upgrades & VIP tier perks</span>
                  </div>
                </div>
              </div>
              <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 text-center">
                <div className="text-xs text-slate-400 font-bold uppercase mb-2">Wash Bay Scanner</div>
                <div className="text-xl font-bold text-white">Platinum Wash & Wax</div>
                <div className="text-xs text-cyan-400 font-bold mt-1">Bay #2 Operator Scan</div>
                <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-400">
                  Status: <span className="text-emerald-400 font-bold">Pass Validated</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Live Sandbox Launch Grid */}
      <section id="demos" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-b border-slate-800/80">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-3 py-1 rounded-full">
            Instant Test Sandboxes
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-white mt-3 tracking-tight">
            Test Every Role in Real Time
          </h2>
          <p className="mt-3 text-sm text-slate-400">
            Click any sandbox below to test the full lifecycle: customer join, staff checkout scan, owner dashboard, or super admin console.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: Customer Points */}
          <Link
            href="/b/demo-barber"
            className="p-6 rounded-3xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-900/90 transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Scissors className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-400">Points Model</span>
              <h3 className="text-lg font-bold text-white mt-1">Barber Customer Hub</h3>
              <p className="text-xs text-slate-400 mt-2">
                Mobile loyalty card with real-time balance, OTP redemption codes, and review links.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs font-bold text-indigo-400">
              <span>Launch Pass</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* Card 2: Customer Stamps */}
          <Link
            href="/b/demo-coffee"
            className="p-6 rounded-3xl bg-slate-900 border border-slate-800 hover:border-amber-500/50 hover:bg-slate-900/90 transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-amber-600/20 text-amber-400 border border-amber-500/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Coffee className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400">Stamps Model</span>
              <h3 className="text-lg font-bold text-white mt-1">Coffee Customer Hub</h3>
              <p className="text-xs text-slate-400 mt-2">
                Digital punch card interface with visit progress ring and reward catalogue.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs font-bold text-amber-400">
              <span>Launch Pass</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* Card 3: Staff Terminal */}
          <Link
            href="/staff"
            className="p-6 rounded-3xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-900/90 transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Smartphone className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400">Frontline POS</span>
              <h3 className="text-lg font-bold text-white mt-1">Staff Scanner Terminal</h3>
              <p className="text-xs text-slate-400 mt-2">
                Camera QR scanner, spend converter, and 1-tap reward validation at checkout.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs font-bold text-emerald-400">
              <span>Open Scanner</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* Card 4: Platform Admin */}
          <Link
            href="/admin"
            className="p-6 rounded-3xl bg-slate-900 border border-slate-800 hover:border-rose-500/50 hover:bg-slate-900/90 transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-rose-600/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-400">Cross-Tenant</span>
              <h3 className="text-lg font-bold text-white mt-1">Platform Super Admin</h3>
              <p className="text-xs text-slate-400 mt-2">
                Multi-tenant onboarding wizard, system health telemetry, and tamper-proof global audit.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs font-bold text-rose-400">
              <span>Open Console</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        </div>
      </section>

      {/* Enterprise Footer */}
      <footer className="py-14 bg-slate-950 border-t border-slate-800/80 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-8 border-b border-slate-800/80">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black">
                <QrCode className="w-4 h-4" />
              </div>
              <div>
                <span className="font-extrabold text-white text-sm">LoyaltyPlatform Enterprise</span>
                <span className="text-slate-500 block text-[10px]">Cloud Loyalty & ERP Infrastructure</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 font-medium">
              <Link href="/login" className="hover:text-white transition-colors">
                Sign In
              </Link>
              <Link href="/signup" className="hover:text-white transition-colors">
                Create Account
              </Link>
              <Link href="/dashboard" className="hover:text-white transition-colors">
                Owner Dashboard
              </Link>
              <Link href="/staff" className="hover:text-white transition-colors">
                Staff Terminal
              </Link>
              <Link href="/admin" className="hover:text-white transition-colors">
                Platform Admin
              </Link>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
            <p>© {new Date().getFullYear()} LoyaltyPlatform Ltd. Engineered in the United Kingdom. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <span>Strict RLS Tenant Isolation</span>
              <span>•</span>
              <span>PostgreSQL Double-Entry</span>
              <span>•</span>
              <span>Anti-Gating Compliant</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
