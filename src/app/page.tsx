"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ScanLine,
  Smartphone,
  Gift,
  LogIn,
  Search,
  BadgeCheck,
  Store,
  Settings2,
  Printer,
  Plus,
  Minus,
  Check,
  ShieldCheck,
  Megaphone,
  LineChart,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { HeroScene3D } from "@/components/marketing/HeroScene3D";
import { OwnerPreview3D } from "@/components/marketing/OwnerPreview3D";
import { Tilt } from "@/components/marketing/Tilt";

const roles = [
  {
    id: "customer",
    who: "I'm a customer",
    summary: "Collect points every time you visit and swap them for treats.",
    accent: "bg-marigold text-evergreen-deep",
    steps: [
      { icon: ScanLine, text: "Scan the QR code at the counter with your phone camera." },
      { icon: Smartphone, text: "Your card opens in the browser. Show it when you pay." },
      { icon: Gift, text: "When you have enough points, tap a reward to claim it." },
    ],
    cta: { label: "Find your shop", href: "/login" },
  },
  {
    id: "staff",
    who: "I work at the shop",
    summary: "Add points and hand out rewards in a couple of taps.",
    accent: "bg-evergreen text-white",
    steps: [
      { icon: LogIn, text: "Sign in on the shop phone or tablet with the login your manager gave you." },
      { icon: Search, text: "Scan the customer's card, or search their name or number." },
      { icon: BadgeCheck, text: "Enter the bill or tap a product. Points are added straight away." },
    ],
    cta: { label: "Staff sign in", href: "/login" },
  },
  {
    id: "owner",
    who: "I own the business",
    summary: "Set up your card, choose rewards and see who keeps coming back.",
    accent: "bg-evergreen-deep text-white",
    steps: [
      { icon: Store, text: "Create your business and pick points or stamps." },
      { icon: Settings2, text: "Add your rewards, like a free coffee at 8 stamps." },
      { icon: Printer, text: "Print your QR poster and put it by the till." },
    ],
    cta: { label: "Set up my business", href: "/signup?role=owner" },
  },
];

const faqs = [
  {
    q: "Do my customers need to download an app?",
    a: "No. They scan your QR code with their phone camera and their card opens in the browser. They can save it to their home screen so it opens like an app.",
  },
  {
    q: "How do my staff add points?",
    a: "Staff sign in on any phone or tablet, scan the customer's card (or search for them) and enter the bill amount or tap a product. It takes a few seconds.",
  },
  {
    q: "Can I run more than one shop?",
    a: "Yes. Add each location, then give staff access only to the shops they work in. You see everything from one dashboard. If your brands are separate businesses, you can also link them in a group and see their totals side by side.",
  },
  {
    q: "What about Google reviews?",
    a: "Every customer sees the same link to your Google page, whatever they think of you. Customers can also send you a private message, so you hear about problems before they become reviews.",
  },
  {
    q: "Is customer data safe?",
    a: "Rappio is built around UK GDPR. Customers can download or delete their data from their account at any time, and every points change is recorded and can't be edited.",
  },
];

const owners = [
  { icon: LineChart, title: "See who comes back", text: "Repeat visits, new members and rewards used, each with what it counts written beside it." },
  { icon: Megaphone, title: "Send offers that are tracked", text: "Email the customers who said yes, and see how many bought within a week. Test two wordings against each other." },
  { icon: ShieldCheck, title: "Every point on the record", text: "Points are never edited, only corrected with a reason, so a dispute can always be settled." },
];

export default function Home() {
  const [dailyCustomers, setDailyCustomers] = useState(120);
  const [avgSpend, setAvgSpend] = useState(12);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Assumptions are shown next to the result: 42% of customers sign up, 4% leave a review, members spend 16.5% more
  const monthlyRevenue = dailyCustomers * avgSpend * 30;
  const extraRevenue = Math.round(monthlyRevenue * 0.165);
  const regulars = Math.round(dailyCustomers * 30 * 0.42);
  const reviews = Math.round(dailyCustomers * 30 * 0.04);

  return (
    <div className="min-h-screen bg-paper text-zinc-900 overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-paper/85 backdrop-blur-md border-b border-zinc-200/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Logo className="h-7 sm:h-8" />
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-600">
            <a href="#how-it-works" className="hover:text-evergreen transition-colors">How it works</a>
            <a href="#owners" className="hover:text-evergreen transition-colors">For owners</a>
            <a href="#calculator" className="hover:text-evergreen transition-colors">What you could earn</a>
            <a href="#questions" className="hover:text-evergreen transition-colors">Questions</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden sm:inline-flex text-sm font-semibold text-evergreen-deep px-3.5 py-2 rounded-full hover:bg-mist transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/signup?role=owner"
              className="press inline-flex text-sm font-semibold bg-evergreen text-white px-4 py-2 rounded-full hover:bg-evergreen-deep transition-colors"
            >
              Start free
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-16 sm:pt-16 sm:pb-24 grid lg:grid-cols-[1fr_1.05fr] gap-8 lg:gap-4 items-center">
        <div className="relative z-10">
          <h1 className="font-display text-[2.5rem] leading-[1.04] sm:text-6xl lg:text-[4.2rem] font-bold text-evergreen-deep">
            The stamp card your customers never lose.
          </h1>
          <p className="mt-6 text-lg text-zinc-600 max-w-[30rem] leading-relaxed">
            Customers scan a QR code at your counter and collect points on their phone. No app, no
            paper cards. You see who comes back, and they get rewarded for it.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/signup?role=owner"
              className="press inline-flex items-center justify-center min-h-[52px] px-7 rounded-full bg-evergreen text-white font-semibold shadow-[0_14px_30px_-12px_rgba(0,86,249,0.7)] hover:bg-evergreen-deep transition-colors"
            >
              Set up my business, free
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center min-h-[52px] px-6 rounded-full border-2 border-evergreen/25 text-evergreen-deep font-semibold hover:border-evergreen hover:bg-white transition-colors"
            >
              I have an account
            </Link>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-600">
            {["Nothing to download", "Works on any phone", "Ready in about 5 minutes"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check className="w-4 h-4 text-evergreen" strokeWidth={2.5} />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <HeroScene3D />
      </section>

      {/* Roles */}
      <section id="how-it-works" className="bg-white border-y border-zinc-200/70 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl sm:text-5xl font-bold text-evergreen-deep leading-tight">
              Pick who you are. Here&rsquo;s what to do.
            </h2>
            <p className="mt-4 text-zinc-600 text-lg">
              Three people use Rappio, and each one only needs three steps.
            </p>
          </div>

          <div className="mt-12 grid md:grid-cols-3 gap-5">
            {roles.map((role) => (
              <Tilt
                key={role.id}
                as="article"
                className="flex flex-col rounded-[1.75rem] bg-paper p-6 sm:p-7 border border-zinc-200/70 hover:shadow-[0_34px_60px_-34px_rgba(1,30,90,0.45)]"
              >
                <span className={`self-start text-sm font-bold px-3 py-1 rounded-full ${role.accent}`}>
                  {role.who}
                </span>
                <p className="mt-4 font-display text-xl font-semibold text-evergreen-deep leading-snug">
                  {role.summary}
                </p>

                <ol className="mt-6 space-y-4 flex-1">
                  {role.steps.map((step, i) => {
                    const Icon = step.icon;
                    return (
                      <li key={i} className="flex gap-3.5">
                        <span className="shrink-0 w-9 h-9 rounded-full bg-white border border-zinc-200 flex items-center justify-center font-display font-bold text-evergreen">
                          {i + 1}
                        </span>
                        <div className="pt-1.5 text-[15px] text-zinc-700 leading-snug">
                          <Icon className="inline w-4 h-4 mr-1.5 -mt-0.5 text-evergreen" />
                          {step.text}
                        </div>
                      </li>
                    );
                  })}
                </ol>

                <Link
                  href={role.cta.href}
                  className="press mt-7 inline-flex items-center justify-center min-h-[48px] rounded-full bg-white border border-zinc-300 font-semibold text-evergreen-deep hover:border-evergreen hover:bg-mist transition-colors"
                >
                  {role.cta.label}
                </Link>
              </Tilt>
            ))}
          </div>
        </div>
      </section>

      {/* Points vs stamps */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-evergreen-deep max-w-xl leading-tight">
          Works the way your shop already works.
        </h2>
        <div className="mt-10 grid md:grid-cols-2 gap-5">
          <Tilt className="rounded-[1.75rem] bg-brand-gradient text-white p-7 sm:p-9 shadow-[0_40px_70px_-40px_rgba(0,86,249,0.8)]">
            <p className="font-display text-2xl font-bold">Stamps</p>
            <p className="mt-2 text-white/85 max-w-sm">
              One visit, one stamp. Best for cafés, bakeries and car washes.
            </p>
            <div className="mt-7 flex gap-2" aria-label="7 of 8 stamps collected">
              {Array.from({ length: 8 }).map((_, i) => (
                <span
                  key={i}
                  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full ${
                    i < 7 ? "bg-marigold shadow-[0_5px_10px_-4px_rgba(1,30,90,0.6)]" : "border-2 border-dashed border-marigold"
                  }`}
                />
              ))}
            </div>
            <p className="mt-4 text-sm text-white/85">8th coffee free</p>
          </Tilt>
          <Tilt className="rounded-[1.75rem] bg-white border border-zinc-200/70 p-7 sm:p-9">
            <p className="font-display text-2xl font-bold text-evergreen-deep">Points</p>
            <p className="mt-2 text-zinc-600 max-w-sm">
              Points for every pound spent. Best for restaurants, salons and barbers.
            </p>
            <div className="mt-7">
              <div className="flex items-baseline justify-between">
                <span className="font-display text-4xl font-bold text-evergreen-deep tabular-nums">340</span>
                <span className="text-sm text-zinc-500">of 500 points</span>
              </div>
              <div className="mt-3 h-3 rounded-full bg-zinc-100 overflow-hidden">
                <div className="h-full w-[68%] rounded-full bg-marigold" />
              </div>
              <p className="mt-4 text-sm text-zinc-600">£10 off at 500 points</p>
            </div>
          </Tilt>
        </div>
      </section>

      {/* For owners */}
      <section id="owners" className="bg-white border-y border-zinc-200/70 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 grid lg:grid-cols-[0.9fr_1.1fr] gap-12 lg:gap-16 items-center">
          <div>
            <h2 className="font-display text-3xl sm:text-5xl font-bold text-evergreen-deep leading-tight">
              Your regulars, at a glance.
            </h2>
            <p className="mt-4 text-zinc-600 text-lg max-w-md">
              One dashboard for the owner. Staff only see the till, and customers only see their own card.
            </p>
            <ul className="mt-8 space-y-6">
              {owners.map((o) => (
                <li key={o.title} className="flex gap-4">
                  <span className="shrink-0 w-11 h-11 rounded-2xl bg-mist text-evergreen flex items-center justify-center">
                    <o.icon className="w-5 h-5" />
                  </span>
                  <div>
                    <p className="font-semibold text-evergreen-deep">{o.title}</p>
                    <p className="mt-1 text-[15px] text-zinc-600 leading-snug max-w-[44ch]">{o.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <OwnerPreview3D />
        </div>
      </section>

      {/* Calculator */}
      <section id="calculator" className="bg-evergreen-deep text-white scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="font-display text-3xl sm:text-5xl font-bold leading-tight">
              What could regulars be worth to you?
            </h2>
            <p className="mt-4 text-white/70 text-lg max-w-md">
              Move the sliders to match your shop. It is an estimate from the assumptions below, not a promise.
            </p>

            <div className="mt-10 space-y-8">
              <label className="block">
                <span className="flex justify-between text-sm font-medium">
                  <span className="text-white/80">Customers a day</span>
                  <span className="font-display text-lg font-bold tabular-nums">{dailyCustomers}</span>
                </span>
                <input
                  type="range"
                  min={20}
                  max={500}
                  step={10}
                  value={dailyCustomers}
                  onChange={(e) => setDailyCustomers(Number(e.target.value))}
                  className="mt-3 w-full accent-marigold cursor-pointer"
                />
              </label>
              <label className="block">
                <span className="flex justify-between text-sm font-medium">
                  <span className="text-white/80">Average spend</span>
                  <span className="font-display text-lg font-bold tabular-nums">£{avgSpend}</span>
                </span>
                <input
                  type="range"
                  min={3}
                  max={150}
                  step={1}
                  value={avgSpend}
                  onChange={(e) => setAvgSpend(Number(e.target.value))}
                  className="mt-3 w-full accent-marigold cursor-pointer"
                />
              </label>
            </div>
            <p className="mt-8 text-sm text-white/60 max-w-md leading-relaxed">
              Assumes 42% of your customers join, members spend 16.5% more over a month, and 4% leave a Google review. Your own results will differ.
            </p>
          </div>

          <div className="rounded-[1.75rem] bg-white text-evergreen-deep p-7 sm:p-10 shadow-[0_50px_90px_-40px_rgba(0,0,0,0.7)]">
            <p className="text-zinc-600">Extra each month, estimated</p>
            <p className="mt-1 font-display text-5xl sm:text-6xl font-bold tabular-nums text-brand-gradient">
              £{extraRevenue.toLocaleString("en-GB")}
            </p>
            <dl className="mt-8 grid grid-cols-2 gap-4">
              <div className="rounded-2xl bg-paper p-4">
                <dt className="text-sm text-zinc-600">Regulars signed up</dt>
                <dd className="mt-1 font-display text-2xl font-bold tabular-nums">{regulars.toLocaleString("en-GB")}</dd>
              </div>
              <div className="rounded-2xl bg-paper p-4">
                <dt className="text-sm text-zinc-600">New Google reviews</dt>
                <dd className="mt-1 font-display text-2xl font-bold tabular-nums">{reviews}</dd>
              </div>
            </dl>
            <Link
              href="/signup?role=owner"
              className="press mt-8 flex items-center justify-center min-h-[52px] rounded-full bg-marigold text-evergreen-deep font-bold hover:brightness-95 transition"
            >
              Start my loyalty card
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="questions" className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24 scroll-mt-16">
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-evergreen-deep">Questions people ask</h2>
        <div className="mt-8 divide-y divide-zinc-200 border-y border-zinc-200">
          {faqs.map((item, idx) => {
            const open = openFaq === idx;
            return (
              <div key={idx}>
                <button
                  type="button"
                  onClick={() => setOpenFaq(open ? null : idx)}
                  aria-expanded={open}
                  className="w-full py-5 flex items-center justify-between gap-4 text-left cursor-pointer"
                >
                  <span className="font-semibold text-lg text-evergreen-deep">{item.q}</span>
                  <span className="shrink-0 w-8 h-8 rounded-full bg-mist text-evergreen flex items-center justify-center">
                    {open ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  </span>
                </button>
                {open && <p className="pb-6 -mt-1 text-zinc-600 leading-relaxed max-w-[62ch]">{item.a}</p>}
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-evergreen-deep text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 flex flex-col md:flex-row gap-8 md:items-center justify-between">
          <div>
            <Logo tone="light" className="h-8" />
            <p className="mt-3 text-sm text-white/65">Digital loyalty cards for UK high-street businesses.</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-white/80">
            <Link href="/login" className="hover:text-white">Sign in</Link>
            <Link href="/signup?role=owner" className="hover:text-white">Create a business</Link>
            <Link href="/dashboard" className="hover:text-white">Owner dashboard</Link>
            <Link href="/staff" className="hover:text-white">Staff scanner</Link>
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
          </nav>
        </div>
        <p className="max-w-6xl mx-auto px-4 sm:px-6 pb-8 text-xs text-white/45">
          &copy; {new Date().getFullYear()} Rappio.
        </p>
      </footer>
    </div>
  );
}
