"use client";

import React, { useCallback, useEffect, useState } from "react";

interface Grant { id: string; reason: string; expiresAt: string; revokedAt: string | null }
interface Visit { id: string; action: string; createdAt: string; who: string | null; email: string | null }

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const LENGTHS: Array<{ hours: number; label: string }> = [
  { hours: 1, label: "1 hour" },
  { hours: 24, label: "1 day" },
  { hours: 168, label: "7 days" },
];

/** The owner decides when the platform's support team may look at their account, and sees every time they did. */
export function SupportAccessSettings() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState(24);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/v1/owner/support-access", { cache: "no-store" });
    if (!res.ok) return;
    const { data } = await res.json();
    setGrants(data.grants);
    setVisits(data.visits);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const open = grants.find((g) => !g.revokedAt && new Date(g.expiresAt) > new Date());

  const allow = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const res = await fetch("/api/v1/owner/support-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hours, reason }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage(json.error?.message || "Couldn't allow that.");
    setReason("");
    load();
  };
  const stop = async (id: string) => {
    await fetch(`/api/v1/owner/support-access?id=${id}`, { method: "DELETE" });
    load();
  };

  return (
    <section className="mt-6 rounded-3xl bg-white border border-zinc-200 p-5 sm:p-7">
      <h3 className="font-display text-xl font-bold text-evergreen-deep">Help from our support team</h3>
      <p className="text-sm text-zinc-600 mt-1">
        Our support team can only look at your account while you allow it, and only to read: they can&rsquo;t change points, settings or customers. It ends by itself, and you can end it sooner.
      </p>
      {open ? (
        <div className="mt-4 rounded-2xl border-2 border-evergreen bg-mist/50 p-4 text-sm">
          <p className="font-semibold text-zinc-900">Support can look until {when(open.expiresAt)}</p>
          <p className="text-zinc-700">{open.reason}</p>
          <button onClick={() => stop(open.id)} className="press mt-3 min-h-[40px] px-4 rounded-full border border-zinc-300 text-sm font-semibold hover:border-evergreen cursor-pointer">
            End access now
          </button>
        </div>
      ) : (
        <form onSubmit={allow} className="mt-4 space-y-3">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={5}
            maxLength={500}
            placeholder="What do you need help with?"
            aria-label="What do you need help with"
            className="w-full min-h-[44px] rounded-xl border border-zinc-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen"
          />
          <div className="flex flex-wrap items-center gap-2">
            {LENGTHS.map((l) => (
              <label key={l.hours} className={`cursor-pointer rounded-full border px-4 py-2 text-sm ${hours === l.hours ? "border-evergreen bg-mist/60 text-evergreen-deep font-semibold" : "border-zinc-300 text-zinc-700"}`}>
                <input type="radio" name="support-length" className="sr-only" checked={hours === l.hours} onChange={() => setHours(l.hours)} />
                {l.label}
              </label>
            ))}
            <button type="submit" className="press min-h-[44px] px-5 rounded-full bg-evergreen text-white text-sm font-semibold hover:bg-evergreen-deep cursor-pointer">
              Allow support to look
            </button>
          </div>
        </form>
      )}
      {message && <p className="mt-3 text-sm text-rose-700">{message}</p>}
      {visits.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold text-zinc-800">Who has looked ({visits.length})</summary>
          <ul className="mt-2 divide-y divide-zinc-100">
            {visits.map((v) => (
              <li key={v.id} className="py-1.5">
                {when(v.createdAt)}: {v.who || v.email || "Support"} {v.action === "support.viewed" ? "looked at your account" : v.action}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
