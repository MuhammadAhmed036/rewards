"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  QrCode,
  ShieldCheck,
  ArrowRight,
  Receipt,
  Scale,
  ChevronRight,
  Coffee,
  Scissors,
  BarChart3,
  Check,
  ShoppingBag,
  Car,
  TrendingUp,
  Calculator,
  HelpCircle,
  Activity,
  Layers,
  Lock,
  Star,
  CheckCircle2,
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
    <div className="min-h-screen bg-[#fafafa] text-zinc-900 font-sans selection:bg-zinc-900 selection:text-white">
      {/* Top Refined Announcement Bar */}
      <div className="bg-zinc-950 text-zinc-300 text-xs py-2 px-4 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto flex items-center justify-between sm:justify-center gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-800/90 text-zinc-200 text-[11px] font-semibold border border-zinc-700/60">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              v2.4 Live
            </span>
            <span className="text-zinc-400 hidden sm:inline">
              Enterprise Multi-Tenant QR Loyalty &amp; Double-Entry Ledger.
            </span>
          </div>
          <Link
            href="/signup?role=owner"
            className="text-zinc-100 hover:text-white font-medium inline-flex items-center gap-1 text-xs transition-colors group"
          >
            <span>Deploy Programme</span>
            <ArrowRight className="w-3 h-3 text-zinc-400 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </div>

      {/* Main Navigation Header */}
      <header className="border-b border-zinc-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-50 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-zinc-950 text-white flex items-center justify-center font-bold text-lg shadow-xs ring-1 ring-zinc-900/10 group-hover:bg-zinc-800 transition-colors">
              <QrCode className="w-4.5 h-4.5 stroke-[1.8]" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-base text-zinc-950 tracking-tight">
                Loyalty<span className="text-zinc-500 font-normal">Platform</span>
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200/80">
                UK Enterprise
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-8 text-xs font-medium text-zinc-600">
            <a href="#solutions" className="hover:text-zinc-950 transition-colors">
              Solutions
            </a>
            <a href="#calculator" className="hover:text-zinc-950 transition-colors">
              ROI Calculator
            </a>
            <a href="#architecture" className="hover:text-zinc-950 transition-colors">
              Ledger Architecture
            </a>
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center gap-2.5">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700 hover:text-zinc-950 px-3.5 py-2 rounded-lg hover:bg-zinc-100 transition-colors"
            >
              <Lock className="w-3.5 h-3.5 text-zinc-400 stroke-[1.8]" />
              Sign In
            </Link>
            <Link
              href="/signup?role=owner"
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-zinc-950 hover:bg-zinc-800 text-white px-4 py-2 rounded-lg transition-all shadow-xs ring-1 ring-zinc-900/10 hover:shadow-sm"
            >
              <span>Get Started Free</span>
              <ArrowRight className="w-3.5 h-3.5 text-zinc-400 stroke-[1.8]" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-20 sm:pt-24 sm:pb-28 border-b border-zinc-200/80 bg-white">
        {/* Subtle engineered grid pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(#e4e4e7_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          {/* Subtle Tagline Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-50 border border-zinc-200/90 text-zinc-700 text-xs font-medium mb-6 shadow-2xs">
            <ShieldCheck className="w-3.5 h-3.5 text-zinc-900 stroke-[1.8]" />
            <span className="font-semibold text-zinc-900">Enterprise B2B Loyalty Engine</span>
            <span className="text-zinc-300">•</span>
            <span className="text-zinc-500">UK High-Street Edition</span>
          </div>

          {/* Clean, High-Contrast Headline */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-zinc-950 max-w-4xl mx-auto leading-[1.08]">
            Turn first-time walk-ins into{" "}
            <span className="bg-gradient-to-r from-zinc-950 via-zinc-800 to-zinc-600 bg-clip-text text-transparent">
              lifetime regulars.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-base sm:text-lg text-zinc-600 max-w-2xl mx-auto leading-relaxed">
            Zero customer app downloads. 3-second cashier QR scans. Powered by an immutable
            PostgreSQL double-entry ledger, anti-gating Google Review growth, and native multi-tenant isolation.
          </p>

          {/* Enterprise Trust Row */}
          <div className="mt-10 pt-8 border-t border-zinc-200/70 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs text-zinc-600">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-zinc-900 stroke-[1.8]" />
              <span>Zero App Downloads Required</span>
            </div>
            <div className="flex items-center gap-2 font-medium">
              <Receipt className="w-4 h-4 text-zinc-900 stroke-[1.8]" />
              <span>Immutable Double-Entry Ledger</span>
            </div>
            <div className="flex items-center gap-2 font-medium">
              <Scale className="w-4 h-4 text-zinc-900 stroke-[1.8]" />
              <span>Anti-Gating Review Certified</span>
            </div>
            <div className="flex items-center gap-2 font-medium">
              <ShieldCheck className="w-4 h-4 text-zinc-900 stroke-[1.8]" />
              <span>UK GDPR &amp; ICO Compliant</span>
            </div>
          </div>
        </div>

        {/* Interactive Live ERP Command Center Showcase */}
        <div className="mt-14 max-w-6xl mx-auto px-4 sm:px-6">
          <div className="rounded-2xl border border-zinc-200/90 bg-white shadow-xl shadow-zinc-950/5 overflow-hidden">
            {/* Window Chrome Header Bar */}
            <div className="bg-zinc-100/70 px-4 py-3 border-b border-zinc-200/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-300"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-300"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-300"></div>
                <span className="text-[11px] font-mono text-zinc-500 ml-2 font-medium">
                  loyaltyplatform.cloud/dashboard/live
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-zinc-500 hidden sm:inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  PostgreSQL RLS Active
                </span>
                <span className="text-[10px] font-mono text-zinc-400">Latency: 14ms</span>
              </div>
            </div>

            {/* Dashboard Mockup Interior */}
            <div className="p-6 sm:p-8 space-y-6 bg-zinc-50/40">
              {/* Executive Metric Cards Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-white border border-zinc-200/80 shadow-2xs">
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span className="font-semibold uppercase tracking-wider text-[10px]">Active Members</span>
                    <span className="text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded text-[11px] flex items-center gap-0.5">
                      <TrendingUp className="w-3 h-3" />
                      +18.4%
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-zinc-950 mt-1.5 tabular-nums">2,840</div>
                  <p className="text-[11px] text-zinc-500 mt-1">Unique enrolled customer passes</p>
                </div>

                <div className="p-4 rounded-xl bg-white border border-zinc-200/80 shadow-2xs">
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span className="font-semibold uppercase tracking-wider text-[10px]">30-Day Velocity</span>
                    <span className="text-zinc-700 font-semibold bg-zinc-100 border border-zinc-200/60 px-1.5 py-0.5 rounded text-[11px] flex items-center gap-0.5">
                      <TrendingUp className="w-3 h-3 text-zinc-600" />
                      +24.1%
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-zinc-950 mt-1.5 tabular-nums">1,120</div>
                  <p className="text-[11px] text-zinc-500 mt-1">Repeat verified transactions</p>
                </div>

                <div className="p-4 rounded-xl bg-white border border-zinc-200/80 shadow-2xs">
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span className="font-semibold uppercase tracking-wider text-[10px]">Reconciled Volume</span>
                    <span className="text-zinc-700 font-semibold bg-zinc-100 border border-zinc-200/60 px-1.5 py-0.5 rounded text-[11px]">
                      Minor Units
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-zinc-950 mt-1.5 tabular-nums">£46,850</div>
                  <p className="text-[11px] text-zinc-500 mt-1">Pence-level ledger reconciliation</p>
                </div>

                <div className="p-4 rounded-xl bg-white border border-zinc-200/80 shadow-2xs">
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span className="font-semibold uppercase tracking-wider text-[10px]">Google Reviews</span>
                    <span className="text-amber-700 font-semibold bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 rounded text-[11px] flex items-center gap-0.5">
                      <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                      4.9 / 5.0
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-zinc-950 mt-1.5 tabular-nums">418</div>
                  <p className="text-[11px] text-zinc-500 mt-1">Anti-gating compliant acceleration</p>
                </div>
              </div>

              {/* Live Simulated Activity Feed */}
              <div className="p-5 rounded-xl bg-white border border-zinc-200/80 shadow-2xs">
                <div className="flex items-center justify-between mb-3 border-b border-zinc-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-zinc-700 stroke-[1.8]" />
                    <span className="text-xs font-semibold text-zinc-900 tracking-tight">
                      Live Transaction Audit Stream
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400">Stream Status: Synchronized</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3.5 rounded-lg bg-zinc-50/80 border border-zinc-200/60 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-zinc-900">Bella Italia Bistro</p>
                      <p className="text-[11px] text-zinc-500">£45.00 bill • Server Elena</p>
                    </div>
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">
                      +45 pts
                    </span>
                  </div>

                  <div className="p-3.5 rounded-lg bg-zinc-50/80 border border-zinc-200/60 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-zinc-900">Artisan Roast Coffee</p>
                      <p className="text-[11px] text-zinc-500">Flat White • Counter Tap</p>
                    </div>
                    <span className="text-xs font-semibold text-zinc-800 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                      +1 Stamp (8/8)
                    </span>
                  </div>

                  <div className="p-3.5 rounded-lg bg-zinc-50/80 border border-zinc-200/60 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-zinc-900">Classic Fade Barbers</p>
                      <p className="text-[11px] text-zinc-500">Perk Redeemed • Hot Shave</p>
                    </div>
                    <span className="text-xs font-semibold text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                      -50 pts
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Revenue & ROI Calculator Section */}
      <section id="calculator" className="py-20 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 border-b border-zinc-200/80">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100 border border-zinc-200 text-zinc-800 text-xs font-semibold mb-3">
            <Calculator className="w-3.5 h-3.5 stroke-[1.8]" />
            <span>Interactive ROI Calculator</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-zinc-950 tracking-tight">
            Calculate Your Extra Monthly Revenue
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            Adjust the sliders below to model how structured loyalty and verified reviews compound monthly store earnings.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200/90 bg-white p-6 sm:p-10 shadow-sm grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Sliders Side */}
          <div className="lg:col-span-7 space-y-6">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold text-zinc-800 uppercase tracking-wider">
                  Average Daily Customers
                </label>
                <span className="text-sm font-semibold text-zinc-950 font-mono bg-zinc-100 px-2.5 py-1 rounded-md border border-zinc-200">
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
                className="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-zinc-900"
              />
              <div className="flex justify-between text-[11px] text-zinc-400 mt-1 font-mono">
                <span>20 (Boutique)</span>
                <span>250 (Busy cafe)</span>
                <span>500+ (High volume)</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold text-zinc-800 uppercase tracking-wider">
                  Average Spend per Customer (£)
                </label>
                <span className="text-sm font-semibold text-zinc-950 font-mono bg-zinc-100 px-2.5 py-1 rounded-md border border-zinc-200">
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
                className="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-zinc-900"
              />
              <div className="flex justify-between text-[11px] text-zinc-400 mt-1 font-mono">
                <span>£3 (Espresso)</span>
                <span>£35 (Dining/Haircut)</span>
                <span>£150 (Auto Detail)</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/70 text-xs text-zinc-600 flex items-start gap-3">
              <BarChart3 className="w-4 h-4 text-zinc-700 shrink-0 mt-0.5 stroke-[1.8]" />
              <p className="leading-relaxed">
                <strong className="text-zinc-900 font-semibold">The Multiplier Effect:</strong> High-street loyalty members visit
                32% more frequently and spend 18% more per ticket than anonymous customers.
              </p>
            </div>
          </div>

          {/* Projection Card Side */}
          <div className="lg:col-span-5 rounded-xl bg-zinc-950 text-white p-6 sm:p-7 shadow-lg border border-zinc-800">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-zinc-400 block mb-1">
              Projected Monthly Lift
            </span>
            <div className="text-4xl font-bold tracking-tight text-white mt-1 tabular-nums">
              +£{projectedExtraRevenue.toLocaleString()}
              <span className="text-xs font-normal text-zinc-400 block mt-1">estimated additional monthly revenue</span>
            </div>

            <div className="mt-6 pt-5 border-t border-zinc-800 space-y-3 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">New Google Reviews</span>
                <span className="font-semibold text-zinc-200 font-mono text-sm">+{projectedNewReviews} / mo</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Enrolled Regulars</span>
                <span className="font-semibold text-zinc-200 font-mono text-sm">{projectedRepeatMembers} members</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Customer Repeat Rate</span>
                <span className="font-semibold text-emerald-400 font-mono text-sm">+32% increase</span>
              </div>
            </div>

            <Link
              href="/signup?role=owner"
              className="mt-6 w-full py-3 px-4 rounded-lg bg-white hover:bg-zinc-100 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <span>Unlock This Growth Now</span>
              <ArrowRight className="w-3.5 h-3.5 stroke-[1.8]" />
            </Link>
          </div>
        </div>
      </section>

      {/* Configurable Industry Solutions Switcher */}
      <section id="solutions" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-b border-zinc-200/80">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100 border border-zinc-200 text-zinc-800 text-xs font-semibold mb-3">
            <Layers className="w-3.5 h-3.5 stroke-[1.8]" />
            <span>Configurable Engine</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-zinc-950 tracking-tight">
            Engineered for Your Specific Retail Model
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
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
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? "bg-zinc-950 text-white shadow-xs"
                      : "bg-white text-zinc-700 hover:bg-zinc-100 border border-zinc-200"
                  }`}
                >
                  <Icon className="w-4 h-4 stroke-[1.8]" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Industry Preview Container */}
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-6 sm:p-8 max-w-4xl mx-auto shadow-sm">
          {activeIndustry === "restaurants" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Spend-Based Points Engine
                </span>
                <h3 className="text-xl font-bold text-zinc-950 mt-1">Full Service Dining &amp; Bistros</h3>
                <p className="text-xs text-zinc-600 mt-2.5 leading-relaxed">
                  Customers earn 1 point per £1 spent on food and beverages. Waiters enter bill totals at checkout, tips are cleanly separated, and guests redeem £10, £25, or complimentary dessert rewards.
                </p>
                <div className="mt-4 space-y-2 text-xs text-zinc-700 font-medium">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 stroke-[2]" />
                    <span>Bill-total spend calculation with minor pence precision</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 stroke-[2]" />
                    <span>Automated Google Review invitation after dinner</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 stroke-[2]" />
                    <span>Table and server attribution on every transaction</span>
                  </div>
                </div>
              </div>
              <div className="p-6 rounded-xl bg-zinc-50 border border-zinc-200/70 text-center">
                <div className="text-[11px] text-zinc-500 font-semibold uppercase mb-1.5">Simulated Receipt</div>
                <div className="text-3xl font-bold text-zinc-950">£54.50 Bill</div>
                <div className="text-xs text-emerald-700 font-semibold mt-1">+54 Points Credited</div>
                <div className="mt-4 pt-4 border-t border-zinc-200 text-xs text-zinc-500">
                  Server: <span className="text-zinc-900 font-semibold">Elena (Table 7)</span>
                </div>
              </div>
            </div>
          )}

          {activeIndustry === "coffee" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Digital Punch Card Engine
                </span>
                <h3 className="text-xl font-bold text-zinc-950 mt-1">Speciality Coffee &amp; Bakeries</h3>
                <p className="text-xs text-zinc-600 mt-2.5 leading-relaxed">
                  Replace easily lost paper stamp cards with a friction-free digital pass. 1 hot drink = 1 stamp. After 8 stamps, the customer unlocks a free coffee or pastry of their choice.
                </p>
                <div className="mt-4 space-y-2 text-xs text-zinc-700 font-medium">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 stroke-[2]" />
                    <span>1-second camera QR tap at counter</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 stroke-[2]" />
                    <span>12-hour cooldown prevents accidental repeat scans</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 stroke-[2]" />
                    <span>Counter tent card and sticker QR graphic downloads</span>
                  </div>
                </div>
              </div>
              <div className="p-6 rounded-xl bg-zinc-50 border border-zinc-200/70 text-center">
                <div className="text-[11px] text-zinc-500 font-semibold uppercase mb-2">Digital Punch Card</div>
                <div className="grid grid-cols-4 gap-2 my-3 max-w-[240px] mx-auto">
                  {[1, 2, 3, 4, 5, 6, 7].map((s) => (
                    <div key={s} className="h-9 rounded-lg bg-zinc-950 text-white font-semibold flex items-center justify-center text-xs shadow-2xs">
                      ✓
                    </div>
                  ))}
                  <div className="h-9 rounded-lg border border-dashed border-zinc-400 text-zinc-800 font-semibold flex items-center justify-center text-xs bg-white">
                    Free
                  </div>
                </div>
                <span className="text-xs text-zinc-800 font-semibold">1 stamp away from Free Coffee</span>
              </div>
            </div>
          )}

          {activeIndustry === "barbers" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Service Milestones Engine
                </span>
                <h3 className="text-xl font-bold text-zinc-950 mt-1">Barbershops &amp; Hair Salons</h3>
                <p className="text-xs text-zinc-600 mt-2.5 leading-relaxed">
                  Reward repeat grooming appointments and pomade/product sales. Incentivize recurring 3-week bookings with VIP tier perks and complimentary hot towel treatments.
                </p>
                <div className="mt-4 space-y-2 text-xs text-zinc-700 font-medium">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 stroke-[2]" />
                    <span>Barber attribution on every cut</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 stroke-[2]" />
                    <span>Private feedback channel protects Google rating</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 stroke-[2]" />
                    <span>Automated re-booking reminders</span>
                  </div>
                </div>
              </div>
              <div className="p-6 rounded-xl bg-zinc-50 border border-zinc-200/70 text-center">
                <div className="text-[11px] text-zinc-500 font-semibold uppercase mb-1.5">Member Grooming Pass</div>
                <div className="text-xl font-bold text-zinc-950">Skin Fade &amp; Beard Sculpt</div>
                <div className="text-xs text-zinc-700 font-semibold mt-1">120 Lifetime Points</div>
                <div className="mt-4 pt-4 border-t border-zinc-200 text-xs text-zinc-600">
                  Unlocked Perk: <span className="text-emerald-700 font-semibold">Free Beard Oil Treatment</span>
                </div>
              </div>
            </div>
          )}

          {activeIndustry === "auto" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Fleet &amp; Wash Passes
                </span>
                <h3 className="text-xl font-bold text-zinc-950 mt-1">Car Washes &amp; Auto Valeting</h3>
                <p className="text-xs text-zinc-600 mt-2.5 leading-relaxed">
                  Track wash visits, valeting packages, and corporate fleet accounts. Bay operators scan windshield QR codes or customer mobile phones in seconds.
                </p>
                <div className="mt-4 space-y-2 text-xs text-zinc-700 font-medium">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 stroke-[2]" />
                    <span>High-contrast scanner for outdoor valeting bays</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 stroke-[2]" />
                    <span>Package upgrade prompts at checkout</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 stroke-[2]" />
                    <span>Multi-location fleet billing support</span>
                  </div>
                </div>
              </div>
              <div className="p-6 rounded-xl bg-zinc-50 border border-zinc-200/70 text-center">
                <div className="text-[11px] text-zinc-500 font-semibold uppercase mb-1.5">Bay Terminal Scan</div>
                <div className="text-xl font-bold text-zinc-950">Full Valet &amp; Polish</div>
                <div className="text-xs text-zinc-700 font-semibold mt-1">Bay #2 Operator Scan</div>
                <div className="mt-4 pt-4 border-t border-zinc-200 text-xs text-zinc-600">
                  Status: <span className="text-emerald-700 font-semibold">Pass Validated ✓</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Architecture & Engineering Pillars */}
      <section id="architecture" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-b border-zinc-200/80">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-700 bg-zinc-100 border border-zinc-200 px-3 py-1 rounded-full">
            Engineering Integrity
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-zinc-950 mt-3 tracking-tight">
            Financial &amp; Legal Architecture You Can Trust
          </h2>
          <p className="mt-3 text-sm text-zinc-600 leading-relaxed">
            Unlike legacy loyalty apps that leak customer data or store balances as mutable counters, LoyaltyPlatform Enterprise runs on strict financial and legal foundations.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="p-5 rounded-xl bg-white border border-zinc-200/90 shadow-2xs">
            <div className="w-10 h-10 rounded-lg bg-zinc-100 text-zinc-900 border border-zinc-200/60 flex items-center justify-center mb-4">
              <Receipt className="w-5 h-5 stroke-[1.8]" />
            </div>
            <h3 className="text-sm font-bold text-zinc-950">Immutable Ledger</h3>
            <p className="text-xs text-zinc-600 mt-2 leading-relaxed">
              PostgreSQL database triggers strictly prohibit UPDATE and DELETE actions. Every point is permanently auditable with staff attribution.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-white border border-zinc-200/90 shadow-2xs">
            <div className="w-10 h-10 rounded-lg bg-zinc-100 text-zinc-900 border border-zinc-200/60 flex items-center justify-center mb-4">
              <Scale className="w-5 h-5 stroke-[1.8]" />
            </div>
            <h3 className="text-sm font-bold text-zinc-950">UK Minor Units (Pence)</h3>
            <p className="text-xs text-zinc-600 mt-2 leading-relaxed">
              Monetary values are calculated exclusively in minor integer units (pence). Floating-point rounding errors and fractional discrepancies are mathematically eliminated.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-white border border-zinc-200/90 shadow-2xs">
            <div className="w-10 h-10 rounded-lg bg-zinc-100 text-zinc-900 border border-zinc-200/60 flex items-center justify-center mb-4">
              <Star className="w-5 h-5 stroke-[1.8]" />
            </div>
            <h3 className="text-sm font-bold text-zinc-950">Anti-Gating Review Policy</h3>
            <p className="text-xs text-zinc-600 mt-2 leading-relaxed">
              100% compliant with Google Review Guidelines and UK Competition &amp; Markets Authority (CMA) policies. Review links are never filtered by sentiment or conditioned on rewards.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-white border border-zinc-200/90 shadow-2xs">
            <div className="w-10 h-10 rounded-lg bg-zinc-100 text-zinc-900 border border-zinc-200/60 flex items-center justify-center mb-4">
              <ShieldCheck className="w-5 h-5 stroke-[1.8]" />
            </div>
            <h3 className="text-sm font-bold text-zinc-950">UK GDPR Compliance</h3>
            <p className="text-xs text-zinc-600 mt-2 leading-relaxed">
              Automated Subject Access Requests (SAR JSON export), Article 7 consent tracking, and cryptographic Right to Erasure anonymisation ensure complete legal compliance.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Accordion Section */}
      <section className="py-20 max-w-4xl mx-auto px-4 sm:px-6 border-b border-zinc-200/80">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100 text-zinc-700 text-xs font-semibold mb-3">
            <HelpCircle className="w-3.5 h-3.5 stroke-[1.8]" />
            <span>Frequently Asked Questions</span>
          </div>
          <h2 className="text-3xl font-bold text-zinc-950 tracking-tight">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-3">
          {faqs.map((item, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-zinc-200/90 bg-white overflow-hidden shadow-2xs transition-all"
            >
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                className="w-full p-4 sm:p-5 text-left text-sm font-semibold text-zinc-950 flex justify-between items-center cursor-pointer hover:bg-zinc-50"
              >
                <span>{item.q}</span>
                <ChevronRight
                  className={`w-4 h-4 text-zinc-400 transition-transform ${
                    openFaq === idx ? "rotate-90 text-zinc-900" : ""
                  }`}
                />
              </button>
              {openFaq === idx && (
                <div className="px-5 pb-5 text-xs text-zinc-600 leading-relaxed border-t border-zinc-100 pt-3">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Final Call to Action */}
      <section className="py-20 max-w-5xl mx-auto px-4 sm:px-6 text-center">
        <div className="p-8 sm:p-14 rounded-2xl bg-zinc-950 text-white shadow-xl relative overflow-hidden border border-zinc-800">
          <div className="relative z-10 max-w-2xl mx-auto space-y-4">
            <span className="text-xs uppercase font-semibold tracking-widest text-zinc-400">
              Zero Upfront Risk • 60-Second Setup
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              Ready to Upgrade Your High-Street Loyalty?
            </h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Launch your branded loyalty programme today. Customers scan at the counter, earn points, and leave verified Google reviews.
            </p>

            <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/signup?role=owner"
                className="inline-flex items-center gap-2 bg-white hover:bg-zinc-100 text-zinc-950 font-semibold px-6 py-3.5 rounded-xl text-xs shadow-xs transition-colors"
              >
                <span>Create Business Account (Sign Up Free)</span>
                <ArrowRight className="w-3.5 h-3.5 stroke-[1.8]" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/80 font-medium px-5 py-3.5 rounded-xl text-xs transition-colors"
              >
                <Lock className="w-3.5 h-3.5 text-zinc-400 stroke-[1.8]" />
                <span>Sign In to Existing Account</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Enterprise Footer */}
      <footer className="py-12 bg-white border-t border-zinc-200/80 text-xs text-zinc-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-8 border-b border-zinc-100">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-zinc-950 text-white flex items-center justify-center font-bold">
                <QrCode className="w-3.5 h-3.5 stroke-[1.8]" />
              </div>
              <div>
                <span className="font-bold text-zinc-950 text-sm">LoyaltyPlatform Enterprise</span>
                <span className="text-zinc-400 block text-[11px]">UK High-Street Loyalty &amp; Review Infrastructure</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 font-medium text-zinc-600">
              <Link href="/login" className="hover:text-zinc-950 transition-colors">
                Sign In
              </Link>
              <Link href="/signup" className="hover:text-zinc-950 transition-colors">
                Sign Up
              </Link>
              <Link href="/dashboard" className="hover:text-zinc-950 transition-colors">
                Owner ERP Dashboard
              </Link>
              <Link href="/staff" className="hover:text-zinc-950 transition-colors">
                Staff Terminal
              </Link>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-zinc-400">
            <p>© {new Date().getFullYear()} LoyaltyPlatform Ltd. Engineered in the United Kingdom. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <span>Strict RLS Isolation</span>
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
