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
  TrendingUp,
  CreditCard,
  Percent,
  Calculator,
  MessageSquare,
  HelpCircle,
} from "lucide-react";

export default function Home() {
  // Industry Solutions Tab State
  const [activeIndustry, setActiveIndustry] = useState<"restaurants" | "coffee" | "barbers" | "auto">("restaurants");

  // Interactive ROI Calculator State
  const [dailyCustomers, setDailyCustomers] = useState(120);
  const [avgSpend, setAvgSpend] = useState(25);

  // Calculated Metrics
  const monthlyRevenue = dailyCustomers * avgSpend * 30;
  const projectedExtraRevenue = Math.round(monthlyRevenue * 0.165);
  const projectedNewReviews = Math.round(dailyCustomers * 30 * 0.04);
  const projectedRepeatMembers = Math.round(dailyCustomers * 30 * 0.42);

  // Interactive FAQ State
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const faqs = [
    {
      q: "Do customers need to download a mobile app from the App Store?",
      a: "No app downloads are required. Customers simply scan your table or counter QR code using their iPhone or Android camera. Their digital pass opens instantly in mobile safari/chrome, and they can save it to Apple Wallet or Google Wallet with one tap.",
    },
    {
      q: "How does the Anti-Gating Review engine comply with Google and UK CMA rules?",
      a: "Unlike unethical tools that hide Google review links from unhappy customers, our engine presents the direct Google review link equally to 100% of customers. Concurrently, customers are offered a private feedback channel to management, resolving service friction without violating review guidelines.",
    },
    {
      q: "What makes the Double-Entry Ledger financially and legally compliant?",
      a: "Every point awarded, reversed, or redeemed is recorded in an immutable PostgreSQL database ledger. Database triggers strictly prohibit UPDATE and DELETE actions. In addition, all calculations run in minor units (pence) to eliminate floating-point arithmetic errors.",
    },
    {
      q: "Can I run multiple branches and assign different staff permissions?",
      a: "Yes. The platform supports multi-location businesses natively. Business owners have full ERP dashboard visibility, while frontline staff and cashiers have secure terminal access restricted to their assigned location branch.",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-600 selection:text-white">
      {/* Top Utility Announcement Bar */}
      <div className="bg-white border-b border-slate-200/80 text-xs py-2 px-4 text-center flex items-center justify-center gap-2.5 shadow-2xs">
        <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span className="text-slate-600 font-medium">
          <strong className="text-slate-900">LoyaltyPlatform Enterprise:</strong> Multi-Tenant QR Loyalty, Anti-Gating Review Growth & Immutable Audit Ledger.
        </span>
        <span className="text-slate-300 hidden sm:inline">•</span>
        <Link
          href="/signup?role=owner"
          className="text-indigo-600 hover:text-indigo-700 font-bold hover:underline inline-flex items-center gap-1"
        >
          Deploy Your Business Free <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Main Navigation Header */}
      <header className="border-b border-slate-200/80 bg-white/95 backdrop-blur-md sticky top-0 z-50 transition-all shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-xl shadow-md shadow-indigo-600/20">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg text-slate-950 tracking-tight">
                  LoyaltyPlatform<span className="text-indigo-600">.cloud</span>
                </span>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  UK ERP
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block font-medium">
                Autonomous Loyalty & Review Infrastructure
              </p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-7 text-xs font-semibold text-slate-600">
            <a href="#solutions" className="hover:text-indigo-600 transition-colors">
              Industry Solutions
            </a>
            <a href="#calculator" className="hover:text-indigo-600 transition-colors">
              Revenue Calculator
            </a>
            <a href="#architecture" className="hover:text-indigo-600 transition-colors">
              Ledger Architecture
            </a>
            <a href="#sandboxes" className="hover:text-indigo-600 transition-colors">
              Live Sandboxes
            </a>
            <Link
              href="/admin"
              className="text-slate-500 hover:text-indigo-600 transition-colors flex items-center gap-1.5"
            >
              <Building2 className="w-3.5 h-3.5" />
              Platform Admin
            </Link>
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center gap-2.5">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-300 px-3.5 py-2 rounded-xl transition-all shadow-2xs"
            >
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              Sign In
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl transition-all shadow-md shadow-indigo-600/25 hover:scale-[1.02]"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              Get Started Free
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-14 pb-20 sm:pt-20 sm:pb-28 border-b border-slate-200/80 bg-gradient-to-b from-white via-slate-50/60 to-white">
        {/* Subtle light background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-100/60 blur-[120px] pointer-events-none rounded-full" />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          {/* Tagline Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-200 text-slate-700 text-xs font-semibold mb-6 shadow-xs animate-float">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>ENTERPRISE B2B SAAS • MULTI-TENANT LOYALTY PLATFORM</span>
            <span className="text-slate-300">|</span>
            <span className="text-indigo-600 font-bold">UK High-Street Edition</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-slate-950 tracking-tight leading-[1.08] max-w-4xl mx-auto">
            Turn First-Time Walk-Ins Into{" "}
            <span className="text-indigo-600 underline decoration-indigo-200 underline-offset-8">
              Lifetime VIP Regulars.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-base sm:text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
            Zero customer app downloads. 3-second cashier QR scans.
            PostgreSQL double-entry ledger, anti-gating Google Review acceleration, and strict UK GDPR compliance built into every checkout.
          </p>

          {/* Primary Action Buttons */}
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3.5">
            <Link
              href="/signup?role=owner"
              className="inline-flex items-center gap-2.5 bg-indigo-600 hover:bg-indigo-700 text-white px-7 py-4 rounded-2xl font-bold shadow-xl shadow-indigo-600/20 transition-all hover:-translate-y-0.5 text-sm"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Deploy Business Programme (Sign Up)</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 px-6 py-4 rounded-2xl font-bold transition-all hover:-translate-y-0.5 text-sm shadow-xs"
            >
              <LayoutDashboard className="w-4 h-4 text-indigo-600" />
              <span>Business ERP Dashboard</span>
            </Link>

            <Link
              href="/staff"
              className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-6 py-4 rounded-2xl font-bold transition-all hover:-translate-y-0.5 text-sm shadow-xs"
            >
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <span>Staff POS Scanner</span>
            </Link>
          </div>

          {/* Live Trust Badges */}
          <div className="mt-12 pt-8 border-t border-slate-200/80 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs text-slate-600">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Zero Customer App Downloads</span>
            </div>
            <div className="flex items-center gap-2 font-medium">
              <Receipt className="w-4 h-4 text-indigo-600" />
              <span>Immutable Double-Entry Ledger</span>
            </div>
            <div className="flex items-center gap-2 font-medium">
              <Scale className="w-4 h-4 text-amber-600" />
              <span>Anti-Gating Review Certified</span>
            </div>
            <div className="flex items-center gap-2 font-medium">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>UK GDPR & ICO Compliant</span>
            </div>
          </div>
        </div>

        {/* Interactive Live ERP Command Center Showcase */}
        <div className="mt-14 max-w-6xl mx-auto px-4 sm:px-6">
          <div className="rounded-3xl border border-slate-200/90 bg-white shadow-2xl overflow-hidden">
            {/* Top Window Bar */}
            <div className="bg-slate-100/80 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-400"></div>
                <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
                <span className="text-xs font-mono text-slate-500 ml-2 font-medium">
                  https://loyaltyplatform.cloud/dashboard (Enterprise Live Console)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                  PostgreSQL RLS Active
                </span>
              </div>
            </div>

            {/* Dashboard Mockup Interior */}
            <div className="p-6 sm:p-8 space-y-6 bg-slate-50/50">
              {/* Executive Metric Cards Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs hover:border-slate-300 transition-all">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-bold uppercase tracking-wider text-[10px]">Active Members</span>
                    <span className="text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">+18.4%</span>
                  </div>
                  <div className="text-3xl font-black text-slate-900 mt-1 tabular-nums">2,840</div>
                  <p className="text-[11px] text-slate-500 mt-1">Unique customer profiles</p>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs hover:border-slate-300 transition-all">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-bold uppercase tracking-wider text-[10px]">30-Day Velocity</span>
                    <span className="text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.5 rounded">+24.1%</span>
                  </div>
                  <div className="text-3xl font-black text-slate-900 mt-1 tabular-nums">1,120</div>
                  <p className="text-[11px] text-slate-500 mt-1">Repeat visits recorded</p>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs hover:border-slate-300 transition-all">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-bold uppercase tracking-wider text-[10px]">Ledger Volume</span>
                    <span className="text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.5 rounded">Reconciled</span>
                  </div>
                  <div className="text-3xl font-black text-indigo-700 mt-1 tabular-nums">£46,850</div>
                  <p className="text-[11px] text-slate-500 mt-1">Minor units integer math</p>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs hover:border-slate-300 transition-all">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-bold uppercase tracking-wider text-[10px]">Google Reviews</span>
                    <span className="text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded">4.9 ★</span>
                  </div>
                  <div className="text-3xl font-black text-amber-700 mt-1 tabular-nums">418</div>
                  <p className="text-[11px] text-slate-500 mt-1">Anti-gating compliant</p>
                </div>
              </div>

              {/* Live Simulated Activity Feed */}
              <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-indigo-600" />
                    Live Transaction Activity Feed (Simulated)
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">Stream: Active</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-900">Bella Italia Bistro</p>
                      <p className="text-[11px] text-slate-500">£45.00 bill • Table 4</p>
                    </div>
                    <span className="text-xs font-black text-emerald-600">+45 pts</span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-900">Artisan Roast Coffee</p>
                      <p className="text-[11px] text-slate-500">Flat White • Counter</p>
                    </div>
                    <span className="text-xs font-black text-amber-600">+1 Stamp (8/8)</span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-900">Classic Fade Barbers</p>
                      <p className="text-[11px] text-slate-500">Hot Towel Shave Redeemed</p>
                    </div>
                    <span className="text-xs font-black text-purple-600">-50 pts</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Revenue & ROI Calculator Section */}
      <section id="calculator" className="py-20 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 border-b border-slate-200/80">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold mb-3">
            <Calculator className="w-3.5 h-3.5" />
            Interactive ROI Calculator
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-950 tracking-tight">
            Calculate Your Extra Monthly Revenue
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Slide the controls below to project how a structured loyalty and review engine boosts repeat visits.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 sm:p-10 shadow-lg grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Sliders Side */}
          <div className="lg:col-span-7 space-y-6">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-bold text-slate-800">
                  Average Daily Customers
                </label>
                <span className="text-base font-black text-indigo-600 font-mono bg-indigo-50 px-3 py-1 rounded-lg">
                  {dailyCustomers} customers / day
                </span>
              </div>
              <input
                type="range"
                min="20"
                max="500"
                step="10"
                value={dailyCustomers}
                onChange={(e) => setDailyCustomers(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
              <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                <span>20 (Boutique)</span>
                <span>250 (Busy cafe)</span>
                <span>500+ (High volume)</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-bold text-slate-800">
                  Average Spend per Customer (£)
                </label>
                <span className="text-base font-black text-indigo-600 font-mono bg-indigo-50 px-3 py-1 rounded-lg">
                  £{avgSpend}.00
                </span>
              </div>
              <input
                type="range"
                min="3"
                max="150"
                step="1"
                value={avgSpend}
                onChange={(e) => setAvgSpend(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
              <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                <span>£3 (Espresso)</span>
                <span>£35 (Dinner/Haircut)</span>
                <span>£150 (Auto Detail)</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <p>
                <strong>The Multiplier Effect:</strong> High-street loyalty members visit 32% more frequently and spend 18% more per ticket than anonymous customers.
              </p>
            </div>
          </div>

          {/* Projection Card Side */}
          <div className="lg:col-span-5 rounded-2xl bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-950 text-white p-6 sm:p-7 shadow-xl">
            <span className="text-[11px] uppercase tracking-wider font-extrabold text-indigo-300 block mb-1">
              Projected Monthly Lift
            </span>
            <div className="text-4xl font-black tracking-tight text-white mt-1 tabular-nums">
              +£{projectedExtraRevenue.toLocaleString()}
              <span className="text-sm font-normal text-indigo-200 block">estimated extra monthly revenue</span>
            </div>

            <div className="mt-6 pt-5 border-t border-indigo-800/80 space-y-3.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-indigo-200">New Google Reviews</span>
                <span className="font-black text-amber-300 font-mono text-sm">+{projectedNewReviews} / mo</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-indigo-200">Enrolled Regulars</span>
                <span className="font-black text-emerald-400 font-mono text-sm">{projectedRepeatMembers} members</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-indigo-200">Customer Repeat Rate</span>
                <span className="font-black text-white font-mono text-sm">+32% increase</span>
              </div>
            </div>

            <Link
              href="/signup?role=owner"
              className="mt-6 w-full py-3 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all hover:scale-[1.02]"
            >
              <span>Unlock This Growth Now</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Industry Solutions Switcher */}
      <section id="solutions" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-b border-slate-200/80">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-bold mb-3">
            <Layers className="w-3.5 h-3.5" />
            Configurable Engine
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-950 tracking-tight">
            Engineered for Your Specific Retail Model
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            One platform that configures into spend-based points, visit stamps, or service milestones.
          </p>

          {/* Industry Pills */}
          <div className="flex flex-wrap justify-center gap-2 mt-8">
            {[
              { id: "restaurants", label: "Restaurants & Dining", icon: ShoppingBag },
              { id: "coffee", label: "Coffee Shops & Cafes", icon: Coffee },
              { id: "barbers", label: "Barbershops & Salons", icon: Scissors },
              { id: "auto", label: "Car Washes & Auto", icon: Car },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeIndustry === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveIndustry(tab.id as typeof activeIndustry)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25"
                      : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Industry Preview Container */}
        <div className="rounded-3xl border border-slate-200 bg-white p-8 max-w-4xl mx-auto shadow-md">
          {activeIndustry === "restaurants" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                  Spend-Based Points Engine
                </span>
                <h3 className="text-2xl font-black text-slate-900 mt-1">Full Service Dining & Bistros</h3>
                <p className="text-xs text-slate-600 mt-3 leading-relaxed">
                  Customers earn 1 point per £1 spent on food and beverages. Waiters enter bill totals at checkout, tips are cleanly separated, and guests redeem £10, £25, or complimentary dessert rewards.
                </p>
                <div className="mt-5 space-y-2 text-xs font-semibold text-slate-700">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Bill-total spend calculation with minor pence precision</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Automated Google Review invitation after dinner</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Table and server attribution on every transaction</span>
                  </div>
                </div>
              </div>
              <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center">
                <div className="text-xs text-slate-500 font-bold uppercase mb-2">Simulated Receipt</div>
                <div className="text-3xl font-black text-slate-900">£54.50 Bill</div>
                <div className="text-xs text-emerald-600 font-bold mt-1">+54 Points Credited</div>
                <div className="mt-4 pt-4 border-t border-slate-200 text-xs text-slate-500">
                  Server: <span className="text-slate-900 font-semibold">Elena (Table 7)</span>
                </div>
              </div>
            </div>
          )}

          {activeIndustry === "coffee" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-600">
                  Digital Punch Card Engine
                </span>
                <h3 className="text-2xl font-black text-slate-900 mt-1">Speciality Coffee & Bakeries</h3>
                <p className="text-xs text-slate-600 mt-3 leading-relaxed">
                  Replace easily lost paper stamp cards with a friction-free digital pass. 1 hot drink = 1 stamp. After 8 stamps, the customer unlocks a free coffee or pastry of their choice.
                </p>
                <div className="mt-5 space-y-2 text-xs font-semibold text-slate-700">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-amber-600" />
                    <span>1-second camera QR tap at counter</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-amber-600" />
                    <span>Duplicate visit guard prevents accidental double taps</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-amber-600" />
                    <span>Counter tent card and sticker QR graphic downloads</span>
                  </div>
                </div>
              </div>
              <div className="p-6 rounded-2xl bg-amber-50/50 border border-amber-200 text-center">
                <div className="text-xs text-amber-800 font-bold uppercase mb-2">Digital Punch Card</div>
                <div className="grid grid-cols-4 gap-2 my-3">
                  {[1, 2, 3, 4, 5, 6, 7].map((s) => (
                    <div key={s} className="h-10 rounded-lg bg-amber-600 text-white font-bold flex items-center justify-center text-xs shadow-xs">
                      ✓
                    </div>
                  ))}
                  <div className="h-10 rounded-lg border-2 border-dashed border-amber-400 text-amber-700 font-bold flex items-center justify-center text-xs bg-white">
                    Free
                  </div>
                </div>
                <span className="text-xs text-amber-800 font-bold">1 stamp away from Free Coffee!</span>
              </div>
            </div>
          )}

          {activeIndustry === "barbers" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                  Service Milestones Engine
                </span>
                <h3 className="text-2xl font-black text-slate-900 mt-1">Barbershops & Hair Salons</h3>
                <p className="text-xs text-slate-600 mt-3 leading-relaxed">
                  Reward repeat grooming appointments and pomade/product sales. Incentivize recurring 3-week bookings with VIP tier perks and complimentary hot towel treatments.
                </p>
                <div className="mt-5 space-y-2 text-xs font-semibold text-slate-700">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-600" />
                    <span>Barber attribution on every cut</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-600" />
                    <span>Private feedback channel protects Google rating</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-indigo-600" />
                    <span>Automated re-booking reminders</span>
                  </div>
                </div>
              </div>
              <div className="p-6 rounded-2xl bg-indigo-50/50 border border-indigo-200 text-center">
                <div className="text-xs text-indigo-800 font-bold uppercase mb-2">Member Grooming Pass</div>
                <div className="text-xl font-bold text-slate-900">Skin Fade & Beard Sculpt</div>
                <div className="text-xs text-indigo-600 font-bold mt-1">120 Lifetime Points</div>
                <div className="mt-4 pt-4 border-t border-indigo-200 text-xs text-slate-600">
                  Unlocked Perk: <span className="text-emerald-600 font-bold">Free Beard Oil Treatment</span>
                </div>
              </div>
            </div>
          )}

          {activeIndustry === "auto" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-700">
                  Fleet & Wash Passes
                </span>
                <h3 className="text-2xl font-black text-slate-900 mt-1">Car Washes & Auto Valeting</h3>
                <p className="text-xs text-slate-600 mt-3 leading-relaxed">
                  Track wash visits, valeting packages, and corporate fleet accounts. Bay operators scan windshield QR codes or customer mobile phones in seconds.
                </p>
                <div className="mt-5 space-y-2 text-xs font-semibold text-slate-700">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-600" />
                    <span>High-contrast scanner for outdoor valeting bays</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-600" />
                    <span>Package upgrade prompts at checkout</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-600" />
                    <span>Multi-location fleet billing support</span>
                  </div>
                </div>
              </div>
              <div className="p-6 rounded-2xl bg-cyan-50/50 border border-cyan-200 text-center">
                <div className="text-xs text-cyan-800 font-bold uppercase mb-2">Bay Terminal Scan</div>
                <div className="text-xl font-bold text-slate-900">Full Valet & Polish</div>
                <div className="text-xs text-cyan-700 font-bold mt-1">Bay #2 Operator Scan</div>
                <div className="mt-4 pt-4 border-t border-cyan-200 text-xs text-slate-600">
                  Status: <span className="text-emerald-600 font-bold">Pass Validated ✓</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Live Interactive Sandboxes Grid */}
      <section id="sandboxes" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-b border-slate-200/80">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-bold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            Live Product Demos
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-950 tracking-tight">
            Test Every Role in Real Time
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Click on any live sandbox below to test the full end-to-end customer, cashier, owner, and admin flows.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: Barber Customer Hub */}
          <Link
            href="/b/demo-barber"
            className="p-6 rounded-3xl bg-white border border-slate-200 hover:border-indigo-400 hover:shadow-xl transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Scissors className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600">
                Points Engine
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-1">Barber Customer Hub</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Mobile loyalty card with real-time balance, OTP redemption codes, and review links.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-indigo-600">
              <span>Launch Pass</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* Card 2: Coffee Customer Hub */}
          <Link
            href="/b/demo-coffee"
            className="p-6 rounded-3xl bg-white border border-slate-200 hover:border-amber-400 hover:shadow-xl transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 border border-amber-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Coffee className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700">
                Stamps Engine
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-1">Coffee Customer Hub</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Digital punch card interface with visit progress ring and reward catalogue.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-amber-700">
              <span>Launch Pass</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* Card 3: Frontline Staff Terminal */}
          <Link
            href="/staff"
            className="p-6 rounded-3xl bg-white border border-slate-200 hover:border-emerald-400 hover:shadow-xl transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Smartphone className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600">
                Frontline POS
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-1">Cashier Scanner Terminal</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Camera QR scanner, spend converter, and 1-tap reward validation at checkout.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-emerald-600">
              <span>Open Scanner</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* Card 4: Platform Super Admin */}
          <Link
            href="/admin"
            className="p-6 rounded-3xl bg-white border border-slate-200 hover:border-rose-400 hover:shadow-xl transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-600">
                Super Admin
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-1">Platform Admin Console</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Multi-tenant onboarding wizard, system health telemetry, and tamper-proof global audit.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-rose-600">
              <span>Open Console</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        </div>
      </section>

      {/* Architecture & Engineering Pillars */}
      <section id="architecture" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-b border-slate-200/80">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-full">
            Engineering Integrity
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-950 mt-3 tracking-tight">
            Financial & Legal Architecture You Can Trust
          </h2>
          <p className="mt-3 text-sm text-slate-600 leading-relaxed">
            Unlike legacy loyalty apps that leak customer data or store balances as mutable counters, LoyaltyPlatform Enterprise runs on strict financial and legal foundations.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center mb-4">
              <Receipt className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Immutable Ledger</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              PostgreSQL database triggers strictly prohibit UPDATE and DELETE actions. Every point is permanently auditable with staff attribution.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center mb-4">
              <Scale className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">UK Minor Units (Pence)</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Monetary values are calculated exclusively in minor integer units (pence). Floating-point rounding errors and fractional balance discrepancies are mathematically eliminated.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center mb-4">
              <Star className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Anti-Gating Review Policy</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              100% compliant with Google Review Guidelines and UK Competition & Markets Authority (CMA) policies. Review links are never filtered by sentiment or conditioned on rewards.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center mb-4">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">UK GDPR Compliance</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Automated Subject Access Requests (SAR JSON export), Article 7 consent tracking, and cryptographic Right to Erasure anonymisation ensure complete legal compliance.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Accordion Section */}
      <section className="py-20 max-w-4xl mx-auto px-4 sm:px-6 border-b border-slate-200/80">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold mb-3">
            <HelpCircle className="w-3.5 h-3.5" />
            Frequently Asked Questions
          </div>
          <h2 className="text-3xl font-black text-slate-950 tracking-tight">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-3">
          {faqs.map((item, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs transition-all"
            >
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                className="w-full p-5 text-left text-sm font-bold text-slate-900 flex justify-between items-center cursor-pointer hover:bg-slate-50"
              >
                <span>{item.q}</span>
                <ChevronRight
                  className={`w-4 h-4 text-slate-400 transition-transform ${
                    openFaq === idx ? "rotate-90 text-indigo-600" : ""
                  }`}
                />
              </button>
              {openFaq === idx && (
                <div className="px-5 pb-5 text-xs text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Final Call to Action */}
      <section className="py-20 max-w-5xl mx-auto px-4 sm:px-6 text-center">
        <div className="p-10 sm:p-14 rounded-3xl bg-gradient-to-tr from-indigo-900 via-indigo-950 to-slate-950 text-white shadow-2xl relative overflow-hidden">
          <div className="relative z-10 max-w-2xl mx-auto space-y-4">
            <span className="text-xs uppercase font-extrabold tracking-widest text-indigo-300">
              Zero Upfront Risk • 60-Second Setup
            </span>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
              Ready to Upgrade Your High-Street Loyalty?
            </h2>
            <p className="text-sm text-indigo-200 leading-relaxed">
              Launch your branded loyalty programme today. Customers scan at the counter, earn points, and leave verified Google reviews.
            </p>

            <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/signup?role=owner"
                className="inline-flex items-center gap-2 bg-white hover:bg-slate-100 text-slate-950 font-extrabold px-7 py-4 rounded-2xl text-xs shadow-xl transition-all hover:scale-[1.02]"
              >
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>Create Business Account (Sign Up Free)</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 bg-indigo-800/60 hover:bg-indigo-800 text-white border border-indigo-700 font-bold px-6 py-4 rounded-2xl text-xs transition-all"
              >
                <Lock className="w-4 h-4 text-indigo-300" />
                <span>Sign In to Existing Account</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Enterprise Footer */}
      <footer className="py-12 bg-white border-t border-slate-200 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-8 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black">
                <QrCode className="w-4 h-4" />
              </div>
              <div>
                <span className="font-extrabold text-slate-900 text-sm">LoyaltyPlatform Enterprise</span>
                <span className="text-slate-400 block text-[10px]">UK High-Street Loyalty & Review Infrastructure</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 font-semibold text-slate-600">
              <Link href="/login" className="hover:text-indigo-600 transition-colors">
                Sign In
              </Link>
              <Link href="/signup" className="hover:text-indigo-600 transition-colors">
                Sign Up
              </Link>
              <Link href="/dashboard" className="hover:text-indigo-600 transition-colors">
                Owner ERP Dashboard
              </Link>
              <Link href="/staff" className="hover:text-indigo-600 transition-colors">
                Staff Terminal
              </Link>
              <Link href="/admin" className="hover:text-indigo-600 transition-colors">
                Platform Admin
              </Link>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-400">
            <p>© {new Date().getFullYear()} LoyaltyPlatform Ltd. Engineered in the United Kingdom. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <span>Strict RLS Multi-Tenant Isolation</span>
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
