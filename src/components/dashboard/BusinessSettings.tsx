"use client";

import React, { useEffect, useState } from "react";
import { formatMoney } from "@/lib/money";

export interface BusinessSettingsValue {
  name: string;
  brandPrimaryHex: string | null;
  industry?: string | null;
  timezone?: string | null;
  currency?: string | null;
  locale?: string | null;
}

const CURRENCIES = [
  ["GBP", "British pound (£)"],
  ["EUR", "Euro (€)"],
  ["USD", "US dollar ($)"],
  ["PKR", "Pakistani rupee (Rs)"],
  ["AED", "UAE dirham"],
  ["SAR", "Saudi riyal"],
  ["INR", "Indian rupee (₹)"],
  ["CAD", "Canadian dollar"],
  ["AUD", "Australian dollar"],
] as const;

const LOCALES = [
  ["en-GB", "English (UK)"],
  ["en-US", "English (US)"],
  ["en-IE", "English (Ireland)"],
  ["en-AU", "English (Australia)"],
  ["en-CA", "English (Canada)"],
  ["en-PK", "English (Pakistan)"],
  ["en-IN", "English (India)"],
  ["en-AE", "English (UAE)"],
] as const;

const ZONES = [
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kolkata",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Toronto",
  "Australia/Sydney",
];

const field = "w-full min-h-[44px] rounded-xl border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen";

/** Owner settings for the business profile: name, brand colour, time zone, currency and language (FR-011). */
export function BusinessSettings({ value, onSaved }: { value: BusinessSettingsValue | null; onSaved: (v: BusinessSettingsValue) => void }) {
  const [form, setForm] = useState({
    name: "",
    brandPrimaryHex: "#495e57",
    industry: "",
    timezone: "Europe/London",
    currency: "GBP",
    locale: "en-GB",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!value) return;
    setForm({
      name: value.name,
      brandPrimaryHex: value.brandPrimaryHex || "#495e57",
      industry: value.industry || "",
      timezone: value.timezone || "Europe/London",
      currency: value.currency || "GBP",
      locale: value.locale || "en-GB",
    });
  }, [value]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/business", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Couldn't save your settings.");
      onSaved(json.data);
      setNotice("Saved. Customers and staff see the changes straight away.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your settings.");
    } finally {
      setBusy(false);
    }
  };

  const zones = ZONES.includes(form.timezone) ? ZONES : [form.timezone, ...ZONES];

  return (
    <form onSubmit={save} className="grid lg:grid-cols-12 gap-6 items-start">
      <section className="lg:col-span-7 rounded-3xl bg-white border border-zinc-200 p-5 sm:p-7 space-y-5">
        <h3 className="font-display text-xl font-bold text-evergreen-deep">Business details</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="font-medium text-zinc-800">Business name</span>
            <input required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${field} mt-1`} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-800">Type of business</span>
            <input
              maxLength={80}
              placeholder="e.g. Coffee shop"
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
              className={`${field} mt-1`}
            />
          </label>
        </div>

        <div className="text-sm">
          <span className="font-medium text-zinc-800">Card colour</span>
          <div className="mt-1 flex items-center gap-3">
            <input
              type="color"
              aria-label="Card colour"
              value={form.brandPrimaryHex}
              onChange={(e) => setForm({ ...form, brandPrimaryHex: e.target.value })}
              className="w-12 h-11 rounded-xl border border-zinc-300 bg-white cursor-pointer"
            />
            <input
              aria-label="Card colour code"
              value={form.brandPrimaryHex}
              onChange={(e) => setForm({ ...form, brandPrimaryHex: e.target.value })}
              className={`${field} max-w-[9rem] font-mono`}
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <label className="block text-sm">
            <span className="font-medium text-zinc-800">Time zone</span>
            <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className={`${field} mt-1`}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-800">Currency</span>
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={`${field} mt-1`}>
              {CURRENCIES.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-800">Dates and numbers</span>
            <select value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })} className={`${field} mt-1`}>
              {LOCALES.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-sm text-zinc-500">
          Changing the currency doesn&rsquo;t convert prices. Check your menu prices and earning rules after you change it.
        </p>

        {error && <p className="text-sm text-rose-700">{error}</p>}
        {notice && <p className="pop-in rounded-2xl bg-mist text-evergreen-deep text-sm px-4 py-3">{notice}</p>}
        <button
          type="submit"
          disabled={busy}
          className="press min-h-[48px] px-6 rounded-full bg-evergreen text-white font-semibold hover:bg-evergreen-deep cursor-pointer disabled:opacity-50"
        >
          {busy ? "Saving..." : "Save settings"}
        </button>
      </section>

      <aside className="lg:col-span-5 rounded-3xl bg-white border border-zinc-200 p-5 sm:p-7">
        <h3 className="font-display text-lg font-bold text-evergreen-deep">How it looks</h3>
        <div
          className="mt-4 aspect-[1.586/1] rounded-2xl p-5 text-white flex flex-col justify-between shadow-[0_20px_40px_-24px_rgba(38,48,45,0.7)]"
          style={{ backgroundColor: /^#[0-9a-f]{6}$/i.test(form.brandPrimaryHex) ? form.brandPrimaryHex : "#495e57" }}
        >
          <span className="font-display font-bold text-lg truncate">{form.name || "Your business"}</span>
          <span className="font-display font-bold text-4xl">120</span>
        </div>
        <dl className="mt-5 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">A price</dt>
            <dd className="font-semibold text-zinc-900">{formatMoney(1870, form.currency, form.locale)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">A date</dt>
            <dd className="font-semibold text-zinc-900">
              {new Date().toLocaleDateString(form.locale, { day: "numeric", month: "long", year: "numeric", timeZone: form.timezone })}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Time there now</dt>
            <dd className="font-semibold text-zinc-900">
              {new Date().toLocaleTimeString(form.locale, { hour: "2-digit", minute: "2-digit", timeZone: form.timezone })}
            </dd>
          </div>
        </dl>
      </aside>
    </form>
  );
}
