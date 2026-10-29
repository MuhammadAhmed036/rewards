"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Megaphone, Users } from "lucide-react";

interface CampaignRow {
  id: string;
  subject: string;
  recipientCount: number;
  delivered: number;
  waiting: number;
  failed: number;
  sentAt: string | null;
  createdAt: string;
}

type VisitFilter = "any" | "lapsed" | "recent";

const field = "w-full min-h-[44px] rounded-xl border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen";

/**
 * Owner screen for email offers: pick who gets it, see how many people that is, preview it as a
 * phone would show it, then send. Only customers who agreed to offers are counted (FR-090 to FR-094).
 */
export function CampaignsManager({ businessName, unit = "points" }: { businessName: string; unit?: string }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [visit, setVisit] = useState<VisitFilter>("any");
  const [days, setDays] = useState("30");
  const [minBalance, setMinBalance] = useState("");
  const [count, setCount] = useState<{ recipients: number; totalCustomers: number } | null>(null);
  const [history, setHistory] = useState<CampaignRow[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const audience = useCallback(() => {
    const n = parseInt(days, 10);
    const a: { lastVisit?: { olderThanDays?: number; withinDays?: number }; minBalance?: number } = {};
    if (visit === "lapsed" && n > 0) a.lastVisit = { olderThanDays: n };
    if (visit === "recent" && n > 0) a.lastVisit = { withinDays: n };
    if (parseInt(minBalance, 10) > 0) a.minBalance = parseInt(minBalance, 10);
    return a;
  }, [visit, days, minBalance]);

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/v1/owner/campaigns", { cache: "no-store" });
    const json = await res.json().catch(() => ({ data: [] }));
    setHistory(json.data ?? []);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Recount whenever the filters change
  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await fetch("/api/v1/owner/campaigns/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience: audience() }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setCount(json.data);
    }, 300);
    return () => clearTimeout(t);
  }, [audience]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/owner/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body, audience: audience() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Couldn't send the offer.");
      setNotice(`Sent to ${json.data.recipientCount} ${json.data.recipientCount === 1 ? "customer" : "customers"}.`);
      setSubject("");
      setBody("");
      setConfirming(false);
      setTimeout(loadHistory, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the offer.");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const ready = subject.trim().length >= 3 && body.trim().length >= 10 && (count?.recipients ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 rounded-3xl bg-white border border-zinc-200 p-5 sm:p-7 space-y-6">
          <div>
            <h3 className="font-display text-xl font-bold text-evergreen-deep flex items-center gap-2">
              <Users className="w-5 h-5 text-evergreen" />
              Who gets it
            </h3>
            <div className="mt-4 grid sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Which customers">
              {([
                ["any", "Everyone", "All customers who said yes to offers"],
                ["lapsed", "Haven't been back", "To win back quiet customers"],
                ["recent", "Visited lately", "To thank your regulars"],
              ] as const).map(([v, title, hint]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={visit === v}
                  onClick={() => setVisit(v)}
                  className={`press text-left rounded-2xl border-2 p-3 cursor-pointer ${visit === v ? "border-evergreen bg-mist/60" : "border-zinc-200 hover:border-zinc-300"}`}
                >
                  <span className="block font-semibold text-sm text-zinc-900">{title}</span>
                  <span className="block text-xs text-zinc-500">{hint}</span>
                </button>
              ))}
            </div>
            {visit !== "any" && (
              <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-800">
                {visit === "lapsed" ? "Last visit more than" : "Visited in the last"}
                <input
                  type="number"
                  min={1}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  aria-label="Number of days"
                  className="w-20 min-h-[40px] rounded-xl border border-zinc-300 px-2 text-center font-semibold focus:outline-none focus:ring-2 focus:ring-evergreen"
                />
                days{visit === "lapsed" ? " ago" : ""}
              </p>
            )}
            <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-800">
              Only people with at least
              <input
                type="number"
                min={0}
                placeholder="0"
                value={minBalance}
                onChange={(e) => setMinBalance(e.target.value)}
                aria-label={`Minimum ${unit}`}
                className="w-20 min-h-[40px] rounded-xl border border-zinc-300 px-2 text-center font-semibold focus:outline-none focus:ring-2 focus:ring-evergreen"
              />
              {unit}
            </p>
            <p className="mt-4 rounded-2xl bg-marigold/25 px-4 py-3 text-sm text-zinc-900" aria-live="polite">
              {count ? (
                <>
                  <strong className="tabular-nums">{count.recipients}</strong> of your {count.totalCustomers} customers will get this. Only people who
                  said yes to offers are included.
                </>
              ) : (
                "Counting..."
              )}
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="font-display text-xl font-bold text-evergreen-deep flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-evergreen" />
              What it says
            </h3>
            <label className="block text-sm">
              <span className="font-medium text-zinc-800">Subject</span>
              <input
                maxLength={150}
                placeholder="e.g. Double points this weekend"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className={`${field} mt-1`}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-zinc-800">Message</span>
              <textarea
                rows={6}
                maxLength={3000}
                placeholder={`Come in this Saturday or Sunday and every purchase earns double ${unit}.`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-300 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen"
              />
            </label>
            {error && <p className="text-sm text-rose-700">{error}</p>}
            {notice && <p className="pop-in rounded-2xl bg-mist text-evergreen-deep text-sm px-4 py-3">{notice}</p>}

            {confirming ? (
              <div className="pop-in rounded-2xl border-2 border-evergreen p-4">
                <p className="text-sm text-zinc-800">
                  Send &ldquo;{subject}&rdquo; to <strong>{count?.recipients}</strong> customers now? You can&rsquo;t unsend it.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={send}
                    disabled={busy}
                    className="press min-h-[44px] px-5 rounded-full bg-evergreen text-white text-sm font-semibold hover:bg-evergreen-deep cursor-pointer disabled:opacity-50"
                  >
                    {busy ? "Sending..." : "Yes, send it"}
                  </button>
                  <button onClick={() => setConfirming(false)} className="min-h-[44px] px-5 rounded-full border border-zinc-300 text-sm font-semibold text-zinc-700 cursor-pointer">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setNotice(null);
                  setConfirming(true);
                }}
                disabled={!ready}
                className="press min-h-[48px] px-6 rounded-full bg-evergreen text-white font-semibold hover:bg-evergreen-deep cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Send to {count?.recipients ?? 0} {count?.recipients === 1 ? "customer" : "customers"}
              </button>
            )}
          </div>
        </section>

        {/* Phone preview */}
        <aside className="lg:col-span-5">
          <div className="mx-auto max-w-[320px] rounded-[2.2rem] border-[10px] border-evergreen-deep bg-white shadow-[0_30px_60px_-30px_rgba(38,48,45,0.6)] overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-100">
              <p className="text-xs text-zinc-500">{businessName}</p>
              <p className="font-semibold text-zinc-900 truncate">{subject || "Your subject line"}</p>
            </div>
            <div className="px-4 py-4 min-h-[260px] text-sm text-zinc-700 whitespace-pre-wrap">
              {body || "Your message appears here, just as customers will see it on their phone."}
              <span className="mt-5 block w-fit rounded-full bg-evergreen text-white text-xs font-semibold px-4 py-2">Open my card</span>
              <span className="mt-5 block text-[11px] text-zinc-500">
                You&rsquo;re getting this because you said yes to offers from {businessName}. Stop offers from this shop.
              </span>
            </div>
          </div>
        </aside>
      </div>

      <section className="rounded-3xl bg-white border border-zinc-200 p-5 sm:p-7">
        <h3 className="font-display text-lg font-bold text-evergreen-deep">Sent offers</h3>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">Nothing sent yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-100">
            {history.map((c) => (
              <li key={c.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-zinc-900 truncate">{c.subject}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(c.sentAt || c.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <p className="text-sm text-zinc-600 tabular-nums shrink-0">
                  {c.delivered} of {c.recipientCount} delivered
                  {c.waiting > 0 ? `, ${c.waiting} on the way` : ""}
                  {c.failed > 0 ? `, ${c.failed} bounced` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
