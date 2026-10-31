"use client";

import React, { useCallback, useEffect, useState } from "react";

interface Tenant { tenantId: string; name: string; slug: string; reason: string; expiresAt: string }
interface View {
  tenant: { name: string; slug: string; status: string; plan: string; timezone: string };
  grant: { expiresAt: string; reason: string };
  counts: { members: number; suspended: number };
  stuckRedemptions: Array<{ id: string; status: string; costPoints: number; createdAt: string; expiresAt: string; memberNumber: string }>;
  emailProblems: Array<{ id: string; template: string; status: string; attempts: number; lastError: string | null; createdAt: string }>;
  openReports: Array<{ id: string; message: string; createdAt: string; memberNumber: string | null }>;
  failingWebhookDeliveries: number;
  member: null | { memberNumber: string; status: string; balance: number; lifetimeEarned: number; history: Array<{ at: string; type: string; points: number; reason: string | null; note: string | null }> };
}

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Read-only help desk: only businesses that have opened their account to support, only until the time they chose. */
export default function SupportPage() {
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [memberQuery, setMemberQuery] = useState("");

  useEffect(() => {
    fetch("/api/v1/support/tenants", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (r.ok) setTenants(j.data);
        else setError(r.status === 401 || r.status === 403 ? "Sign in as a support agent at /login (platform team)." : j.error?.message || "Couldn't load.");
      })
      .catch(() => setError("Couldn't load."));
  }, []);

  const open = useCallback(async (tenantId: string, member?: string) => {
    setError(null);
    const res = await fetch(`/api/v1/support/tenants/${tenantId}${member ? `?member=${encodeURIComponent(member)}` : ""}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) {
      setView(null);
      return setError(json.error?.message || "Couldn't load.");
    }
    setSelected(tenantId);
    setView(json.data);
  }, []);

  return (
    <main className="min-h-screen bg-paper">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <header>
          <h1 className="font-display text-3xl font-bold text-evergreen-deep">Support</h1>
          <p className="text-zinc-600 mt-1">Read-only. You can look, but not change anything. Every visit is shown to the shop&rsquo;s owner.</p>
        </header>

        {error && <p className="rounded-2xl bg-rose-50 text-rose-800 text-sm px-4 py-3">{error}</p>}

        {tenants && tenants.length === 0 && <p className="text-zinc-600">No business has opened its account to support right now.</p>}
        {tenants && tenants.length > 0 && (
          <ul className="grid sm:grid-cols-2 gap-3">
            {tenants.map((t) => (
              <li key={t.tenantId}>
                <button
                  onClick={() => open(t.tenantId)}
                  className={`w-full text-left rounded-2xl border p-4 cursor-pointer ${selected === t.tenantId ? "border-evergreen bg-mist/60" : "border-zinc-200 bg-white hover:border-zinc-300"}`}
                >
                  <p className="font-semibold text-zinc-900">{t.name}</p>
                  <p className="text-sm text-zinc-600">{t.reason}</p>
                  <p className="text-xs text-zinc-500 mt-1">Access until {when(t.expiresAt)}</p>
                </button>
              </li>
            ))}
          </ul>
        )}

        {view && selected && (
          <section className="space-y-5">
            <div className="rounded-3xl border border-zinc-200 bg-white p-5">
              <h2 className="font-display text-2xl font-bold text-evergreen-deep">{view.tenant.name}</h2>
              <p className="text-sm text-zinc-600">
                {view.tenant.status}, {view.tenant.plan} plan, {view.counts.members} customers ({view.counts.suspended} suspended), {view.tenant.timezone}. Webhook deliveries failing: {view.failingWebhookDeliveries}.
              </p>
              <form
                className="mt-4 flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  open(selected, memberQuery);
                }}
              >
                <input
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                  placeholder="Customer ID, e.g. ABCD1234"
                  aria-label="Customer ID"
                  className="min-h-[44px] rounded-xl border border-zinc-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen"
                />
                <button type="submit" className="press min-h-[44px] px-5 rounded-full bg-evergreen text-white text-sm font-semibold cursor-pointer">
                  Look up
                </button>
              </form>
              {view.member && (
                <div className="mt-4 rounded-2xl bg-zinc-50 p-4 text-sm">
                  <p className="font-semibold text-zinc-900">
                    #{view.member.memberNumber}, {view.member.status}: balance {view.member.balance}, earned in total {view.member.lifetimeEarned}
                  </p>
                  <ul className="mt-2 divide-y divide-zinc-200">
                    {view.member.history.map((h, i) => (
                      <li key={i} className="py-1.5 flex justify-between gap-3">
                        <span>
                          {when(h.at)} {h.type}
                          {h.reason ? ` (${h.reason})` : ""}
                          {h.note ? `: ${h.note}` : ""}
                        </span>
                        <span className="tabular-nums font-semibold">{h.points > 0 ? `+${h.points}` : h.points}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="rounded-3xl border border-zinc-200 bg-white p-5">
                <h3 className="font-semibold text-zinc-900">Stuck reward codes</h3>
                <p className="text-xs text-zinc-500">Asked for but never used, and now expired.</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {view.stuckRedemptions.map((r) => (
                    <li key={r.id}>
                      #{r.memberNumber}, {r.costPoints} points, {when(r.createdAt)}
                    </li>
                  ))}
                  {view.stuckRedemptions.length === 0 && <li className="text-zinc-500">None.</li>}
                </ul>
              </div>
              <div className="rounded-3xl border border-zinc-200 bg-white p-5">
                <h3 className="font-semibold text-zinc-900">Emails that didn&rsquo;t go</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {view.emailProblems.map((m) => (
                    <li key={m.id}>
                      {m.template}, {m.status} after {m.attempts} tries{m.lastError ? `: ${m.lastError}` : ""}
                    </li>
                  ))}
                  {view.emailProblems.length === 0 && <li className="text-zinc-500">None.</li>}
                </ul>
              </div>
              <div className="rounded-3xl border border-zinc-200 bg-white p-5">
                <h3 className="font-semibold text-zinc-900">Open customer reports</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {view.openReports.map((r) => (
                    <li key={r.id}>
                      {r.memberNumber ? `#${r.memberNumber}: ` : ""}
                      {r.message}
                    </li>
                  ))}
                  {view.openReports.length === 0 && <li className="text-zinc-500">None.</li>}
                </ul>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
