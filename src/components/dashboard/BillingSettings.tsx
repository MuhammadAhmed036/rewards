"use client";

import React, { useEffect, useState } from "react";

interface Overview {
  plan: { id: string; name: string; priceMinor: number };
  currency: string;
  state: { status: string; trialDaysLeft: number | null; daysOverdue: number; restricted: boolean; message: string | null };
  trialEndsAt: string | null;
  usage: { staff: { used: number; limit: number | null; over: boolean }; locations: { used: number; limit: number | null; over: boolean } };
  invoices: Array<{ id: string; number: string; description: string; amountMinor: number; currency: string; status: string; issuedAt: string; dueAt: string; paidAt: string | null }>;
}

const money = (minor: number, currency: string) => new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(minor / 100);
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Fetches the owner's billing picture. Shared by the banner and the settings card. */
export function useBilling() {
  const [data, setData] = useState<Overview | null>(null);
  useEffect(() => {
    fetch("/api/v1/owner/billing", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setData(j.data))
      .catch(() => undefined);
  }, []);
  return data;
}

/** A slim notice at the top of the dashboard when a trial is ending or a payment is late. Customers are never affected. */
export function BillingBanner() {
  const data = useBilling();
  if (!data?.state.message) return null;
  if (data.state.status === "trialing" && (data.state.trialDaysLeft ?? 99) > 7) return null;
  const bad = data.state.status === "past_due" || data.state.status === "canceled";
  return (
    <p role="status" className={`mb-5 rounded-2xl px-4 py-3 text-sm ${bad ? "bg-rose-50 text-rose-900 border border-rose-200" : "bg-marigold/25 text-zinc-900"}`}>
      {data.state.message}
    </p>
  );
}

export function BillingSettings() {
  const data = useBilling();
  if (!data) return null;
  const { plan, state, usage } = data;
  return (
    <section className="mt-6 rounded-3xl bg-white border border-zinc-200 p-5 sm:p-7">
      <h3 className="font-display text-xl font-bold text-evergreen-deep">Plan and billing</h3>
      <p className="mt-2 text-zinc-800">
        <strong>{plan.name}</strong> plan{plan.priceMinor > 0 ? `, ${money(plan.priceMinor, data.currency)} a month` : ""}.{" "}
        <span className="capitalize">{state.status.replace("_", " ")}</span>
        {data.trialEndsAt && state.status === "trialing" ? `, trial ends ${day(data.trialEndsAt)}` : ""}.
      </p>
      {state.message && <p className={`mt-2 text-sm ${state.status === "past_due" || state.status === "canceled" ? "text-rose-800" : "text-zinc-600"}`}>{state.message}</p>}

      <div className="mt-4 grid sm:grid-cols-2 gap-3 text-sm">
        {([["Team members", usage.staff], ["Locations", usage.locations]] as const).map(([label, u]) => (
          <div key={label} className={`rounded-2xl border p-3 ${u.over ? "border-rose-300 bg-rose-50" : "border-zinc-200"}`}>
            <p className="text-zinc-600">{label}</p>
            <p className="font-display text-2xl font-bold tabular-nums text-evergreen-deep">
              {u.used}
              {u.limit !== null && <span className="text-base font-medium text-zinc-500"> of {u.limit}</span>}
            </p>
            {u.over && <p className="text-xs text-rose-800">Over your plan. Nobody is removed, but you can&rsquo;t add more until you&rsquo;re under.</p>}
          </div>
        ))}
      </div>

      <h4 className="mt-5 font-semibold text-zinc-900">Invoices</h4>
      {data.invoices.length === 0 ? (
        <p className="mt-1 text-sm text-zinc-500">No invoices yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-zinc-100 text-sm">
          {data.invoices.map((i) => (
            <li key={i.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
              <span>
                <span className="font-mono text-xs">{i.number}</span> {i.description}
                <span className="block text-xs text-zinc-500">Issued {day(i.issuedAt)}, due {day(i.dueAt)}</span>
              </span>
              <span className="tabular-nums">
                {money(i.amountMinor, i.currency)}{" "}
                <span className={i.status === "paid" ? "text-evergreen font-semibold" : i.status === "void" ? "text-zinc-400" : new Date(i.dueAt) < new Date() ? "text-rose-700 font-semibold" : "text-zinc-600"}>
                  {i.status === "paid" ? `paid ${i.paidAt ? day(i.paidAt) : ""}` : i.status === "void" ? "void" : new Date(i.dueAt) < new Date() ? "overdue" : "due"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-zinc-500">To pay or change your plan, contact the platform team. Payments are recorded by them.</p>
    </section>
  );
}
