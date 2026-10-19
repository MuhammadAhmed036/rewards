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
} from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Top Navigation */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-50 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xl shadow-md shadow-indigo-200">
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <span className="font-bold text-lg text-slate-900 tracking-tight flex items-center gap-2">
                LoyaltyPlatform
                <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                  UK Edition
                </span>
              </span>
              <p className="text-xs text-slate-500 hidden sm:block">
                Anti-Gating Multi-Tenant QR Loyalty & Review Platform
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/b/demo-barber"
              className="text-xs sm:text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors px-3 py-1.5"
            >
              Customer Hub
            </Link>
            <Link
              href="/staff"
              className="text-xs sm:text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors px-3 py-1.5"
            >
              Staff Terminal
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors shadow-xs"
            >
              <LayoutDashboard className="w-4 h-4" />
              Owner Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-indigo-50/70 via-white to-slate-50 pt-12 pb-16 sm:pt-20 sm:pb-24 border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-100/80 border border-indigo-200 text-indigo-800 text-xs font-semibold mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            Production-Ready Multi-Tenant Loyalty Engine
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-950 tracking-tight leading-tight">
            Independent UK Retail Loyalty,{" "}
            <span className="text-indigo-600">Engineered with Integrity.</span>
          </h1>

          <p className="mt-5 text-base sm:text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed">
            Zero app downloads for customers. 3-second staff scan & earn at checkout.
            Anti-gating Google Review growth, immutable double-entry ledger, and strict UK GDPR compliance.
          </p>

          {/* Quick Portal Launch Buttons */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/b/demo-barber"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-xl font-semibold shadow-md shadow-indigo-200 transition-all hover:scale-[1.02]"
            >
              <Scissors className="w-4 h-4" />
              Launch Demo Barber (Points Mode)
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="/b/demo-coffee"
              className="inline-flex items-center gap-2 bg-amber-700 hover:bg-amber-800 text-white px-5 py-3 rounded-xl font-semibold shadow-md shadow-amber-200 transition-all hover:scale-[1.02]"
            >
              <Coffee className="w-4 h-4" />
              Launch Demo Coffee (Stamps Mode)
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="/staff"
              className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-3 rounded-xl font-semibold transition-all hover:scale-[1.02]"
            >
              <Smartphone className="w-4 h-4" />
              Open Staff Terminal
            </Link>
          </div>

          {/* Badges / Guarantees */}
          <div className="mt-10 pt-8 border-t border-slate-200/80 grid grid-cols-2 sm:grid-cols-4 gap-4 text-left">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-slate-900">Anti-Gating Review Policy</p>
                <p className="text-[11px] text-slate-500">Google review links never conditioned on feedback</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Receipt className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-slate-900">Immutable Ledger</p>
                <p className="text-[11px] text-slate-500">PostgreSQL DB trigger blocks updates & deletes</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Scale className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-slate-900">UK Minor Units (Pence)</p>
                <p className="text-[11px] text-slate-500">Strictly integer arithmetic with 0 float drift</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-slate-900">UK GDPR Compliance</p>
                <p className="text-[11px] text-slate-500">Subject Access Request JSON & Right to Erasure</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Portal Switcher */}
      <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            Explore All 5 Interactive Platform Portals
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Click on any portal card below to test the live user flows.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Card 1: Customer Loyalty Hub */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mb-4">
                <QrCode className="w-6 h-6" />
              </div>
              <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
                Mobile Web Experience
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-1">Customer Loyalty Hub</h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Customers join with one tap, view HMAC-signed Member QR, track live points & stamp cards,
                request rewards, and access Google Review buttons.
              </p>

              <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-slate-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <strong>Demo Barber:</strong> Points mode (£1 = 1 point)
                </div>
                <div className="flex items-center gap-1.5 text-slate-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <strong>Demo Coffee:</strong> Stamps mode (1 visit = 1 stamp)
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2">
              <Link
                href="/b/demo-barber"
                className="flex-1 text-center bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold py-2 px-3 rounded-lg text-xs transition-colors"
              >
                Open Barber Hub →
              </Link>
              <Link
                href="/b/demo-coffee"
                className="flex-1 text-center bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold py-2 px-3 rounded-lg text-xs transition-colors"
              >
                Open Coffee Hub →
              </Link>
            </div>
          </div>

          {/* Card 2: Staff Terminal */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 text-slate-800 flex items-center justify-center mb-4">
                <Smartphone className="w-6 h-6" />
              </div>
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                Counter Checkout Tool
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-1">Staff Terminal</h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                In-store staff scanner with live camera QR recognition, manual Crockford Base32 ID lookup,
                real-time earn preview, duplicate-visit guard, and 1-time code redemption confirmation.
              </p>

              <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-600 border border-slate-200/60">
                <p className="font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-slate-500" /> Demo Staff Login:
                </p>
                <p>Email: <code className="bg-white px-1 py-0.5 rounded border border-slate-200 text-slate-800">barber-staff@platform.local</code></p>
                <p className="mt-1">Password: <code className="bg-white px-1 py-0.5 rounded border border-slate-200 text-slate-800">Password123!</code></p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100">
              <Link
                href="/staff"
                className="w-full inline-flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 px-4 rounded-lg text-xs transition-colors"
              >
                Launch Staff Terminal <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Card 3: Business Owner Dashboard */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-purple-50 border border-purple-100 text-purple-600 flex items-center justify-center mb-4">
                <LayoutDashboard className="w-6 h-6" />
              </div>
              <span className="text-[11px] font-bold text-purple-600 uppercase tracking-wider">
                Store Operations & Control
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-1">Business Owner Dashboard</h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Overview metrics, member directory, audited transaction ledger, team management
                (Owner/Manager/Staff), review links customiser, and printable Join QR kits in PNG/SVG/PDF.
              </p>

              <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-600 border border-slate-200/60">
                <p className="font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-slate-500" /> Demo Owner Login:
                </p>
                <p>Email: <code className="bg-white px-1 py-0.5 rounded border border-slate-200 text-slate-800">barber-owner@platform.local</code></p>
                <p className="mt-1">Password: <code className="bg-white px-1 py-0.5 rounded border border-slate-200 text-slate-800">Password123!</code></p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100">
              <Link
                href="/dashboard"
                className="w-full inline-flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2.5 px-4 rounded-lg text-xs transition-colors shadow-xs"
              >
                Enter Owner Dashboard <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Card 4: Platform Admin Console */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center mb-4">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider">
                Super Administrator
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-1">Platform Admin Console</h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Cross-tenant multi-tenant overview, tenant detail auditing, one-click tenant suspension
                with instant staff session invalidation, and platform health telemetry.
              </p>

              <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-600 border border-slate-200/60">
                <p className="font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-slate-500" /> Platform Admin Login:
                </p>
                <p>Email: <code className="bg-white px-1 py-0.5 rounded border border-slate-200 text-slate-800">admin@platform.local</code></p>
                <p className="mt-1">Password: <code className="bg-white px-1 py-0.5 rounded border border-slate-200 text-slate-800">Password123!</code></p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100">
              <Link
                href="/admin"
                className="w-full inline-flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold py-2.5 px-4 rounded-lg text-xs transition-colors shadow-xs"
              >
                Open Admin Console <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Card 5: UK GDPR Customer Privacy Hub */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center mb-4">
                <Scale className="w-6 h-6" />
              </div>
              <span className="text-[11px] font-bold text-teal-600 uppercase tracking-wider">
                UK GDPR Compliance
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-1">Customer Privacy Center</h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Self-service customer portal under UK GDPR: Subject Access Request (SAR) JSON data export,
                marketing consent management with audit history, and Right to Erasure account anonymisation.
              </p>

              <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-600 border border-slate-200/60">
                <p className="font-semibold text-slate-900 mb-1">Privacy Highlights:</p>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  <li>Article 15 SAR Download</li>
                  <li>Consent Audit Logs</li>
                  <li>PII Pseudonymisation</li>
                </ul>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100">
              <Link
                href="/me"
                className="w-full inline-flex items-center justify-center gap-1.5 bg-teal-700 hover:bg-teal-800 text-white font-semibold py-2.5 px-4 rounded-lg text-xs transition-colors shadow-xs"
              >
                Access Privacy Hub <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Card 6: API Health & Telemetry */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
                <Award className="w-6 h-6" />
              </div>
              <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">
                System Telemetry
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-1">Health & Scheduled Crons</h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Deep system health checks for PostgreSQL and Mailpit, automated balance reconciliation
                engine, and redemption expiry workers secured by bearer secrets.
              </p>

              <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-600 border border-slate-200/60 space-y-1">
                <p className="flex justify-between">
                  <span>Database:</span>
                  <span className="font-semibold text-emerald-600">Connected (PostgreSQL 16)</span>
                </p>
                <p className="flex justify-between">
                  <span>Balance Engine:</span>
                  <span className="font-semibold text-emerald-600">100% Reconciled (0 Err)</span>
                </p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100">
              <a
                href="/api/health"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold py-2.5 px-4 rounded-lg text-xs transition-colors"
              >
                Inspect Health Endpoint <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Credentials Quick Reference */}
      <section className="bg-slate-900 text-white py-12 border-t border-slate-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-5 h-5 text-indigo-400" />
            <h3 className="text-lg font-bold">Seed Dataset & Demo Credentials Cheat Sheet</h3>
          </div>
          <p className="text-xs text-slate-400 mb-6">
            All accounts are seeded into the local PostgreSQL database and ready for immediate testing.
            The universal dev password for all seeded accounts is <strong className="text-indigo-300">Password123!</strong>.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700">
              <p className="font-bold text-slate-200 mb-2 flex items-center gap-1.5">
                <Scissors className="w-3.5 h-3.5 text-indigo-400" /> Demo Barber (Points)
              </p>
              <p className="text-slate-400">Owner: <span className="text-slate-200 font-mono">barber-owner@platform.local</span></p>
              <p className="text-slate-400 mt-1">Manager: <span className="text-slate-200 font-mono">barber-mgr@platform.local</span></p>
              <p className="text-slate-400 mt-1">Staff: <span className="text-slate-200 font-mono">barber-staff@platform.local</span></p>
            </div>

            <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700">
              <p className="font-bold text-slate-200 mb-2 flex items-center gap-1.5">
                <Coffee className="w-3.5 h-3.5 text-amber-400" /> Demo Coffee (Stamps)
              </p>
              <p className="text-slate-400">Owner: <span className="text-slate-200 font-mono">coffee-owner@platform.local</span></p>
              <p className="text-slate-400 mt-1">Manager: <span className="text-slate-200 font-mono">coffee-mgr@platform.local</span></p>
              <p className="text-slate-400 mt-1">Staff: <span className="text-slate-200 font-mono">coffee-staff@platform.local</span></p>
            </div>

            <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700">
              <p className="font-bold text-slate-200 mb-2 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-rose-400" /> Super Administration
              </p>
              <p className="text-slate-400">Platform Admin: <span className="text-slate-200 font-mono">admin@platform.local</span></p>
              <p className="text-slate-400 mt-1">Customer Member: <span className="text-slate-200 font-mono">barber-member-1@demo.local</span></p>
              <p className="text-slate-400 mt-1">Password: <span className="text-slate-200 font-mono">Password123!</span></p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 text-slate-500 py-8 text-center text-xs border-t border-slate-800">
        <p>© 2026 UK Multi-Tenant QR Loyalty Platform. Engineered for Independent High Street Retail.</p>
        <p className="mt-1">
          Built with Next.js 15 App Router · React 19 · PostgreSQL 16 · Drizzle ORM · Tailwind CSS
        </p>
      </footer>
    </div>
  );
}
