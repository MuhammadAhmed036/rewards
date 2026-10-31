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
  status: string;
  clicks: number;
  bounces: number;
  optOuts: number;
  scheduledAt: string | null;
  maxRecipients: number | null;
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
  // More ways to pick people (FR-091): where, which level, and recent spending
  const [places, setPlaces] = useState<Array<{ id: string; name: string }>>([]);
  const [chosenPlaces, setChosenPlaces] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [tier, setTier] = useState("");
  const [earnedPoints, setEarnedPoints] = useState("");
  const [earnedDays, setEarnedDays] = useState("30");
  const [count, setCount] = useState<{ recipients: number; totalCustomers: number } | null>(null);
  const [history, setHistory] = useState<CampaignRow[]>([]);
  const [confirming, setConfirming] = useState(false);
  // When it goes out, and an optional ceiling on how many people it may reach
  const [timing, setTiming] = useState<"now" | "later">("now");
  const [sendAtLocal, setSendAtLocal] = useState("");
  const [maxPeople, setMaxPeople] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const audience = useCallback(() => {
    const n = parseInt(days, 10);
    const a: {
      lastVisit?: { olderThanDays?: number; withinDays?: number };
      minBalance?: number;
      locationIds?: string[];
      tier?: string;
      minEarned?: { points: number; withinDays: number };
    } = {};
    if (visit === "lapsed" && n > 0) a.lastVisit = { olderThanDays: n };
    if (visit === "recent" && n > 0) a.lastVisit = { withinDays: n };
    if (parseInt(minBalance, 10) > 0) a.minBalance = parseInt(minBalance, 10);
    if (chosenPlaces.length > 0) a.locationIds = chosenPlaces;
    if (tier) a.tier = tier;
    if (parseInt(earnedPoints, 10) > 0 && parseInt(earnedDays, 10) > 0) a.minEarned = { points: parseInt(earnedPoints, 10), withinDays: parseInt(earnedDays, 10) };
    return a;
  }, [visit, days, minBalance, chosenPlaces, tier, earnedPoints, earnedDays]);

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/v1/owner/campaigns", { cache: "no-store" });
    const json = await res.json().catch(() => ({ data: [] }));
    setHistory(json.data ?? []);
  }, []);

  useEffect(() => {
    loadHistory();
    fetch("/api/v1/owner/locations", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setPlaces((j.data as Array<{ id: string; name: string; status: string }>).filter((l) => l.status === "active")))
      .catch(() => undefined);
    fetch("/api/v1/owner/programme", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const t = j?.data?.currentRule?.tiers;
        if (t?.enabled) setLevels((t.levels as Array<{ name: string }>).map((l) => l.name));
      })
      .catch(() => undefined);
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
        body: JSON.stringify({
          subject,
          body,
          audience: audience(),
          sendAt: timing === "later" && sendAtLocal ? new Date(sendAtLocal).toISOString() : undefined,
          maxRecipients: parseInt(maxPeople, 10) > 0 ? parseInt(maxPeople, 10) : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Couldn't send the offer.");
      const n = json.data.recipientCount;
      setNotice(
        json.data.status === "scheduled"
          ? `Scheduled for ${new Date(json.data.scheduledAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}, to about ${n} ${n === 1 ? "customer" : "customers"}. Who gets it is worked out when it goes out.`
          : `Sent to ${n} ${n === 1 ? "customer" : "customers"}.`
      );
      setSubject("");
      setBody("");
      setSendAtLocal("");
      setTiming("now");
      setMaxPeople("");
      setConfirming(false);
      setTimeout(loadHistory, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the offer.");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    const res = await fetch(`/api/v1/owner/campaigns?id=${id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setError(json.error?.message || "Couldn't cancel that offer.");
    loadHistory();
  };

  const laterOk = timing === "now" || (sendAtLocal !== "" && new Date(sendAtLocal).getTime() > Date.now());
  const reach = Math.min(count?.recipients ?? 0, parseInt(maxPeople, 10) > 0 ? parseInt(maxPeople, 10) : Infinity);
  const ready = subject.trim().length >= 3 && body.trim().length >= 10 && (count?.recipients ?? 0) > 0 && laterOk;

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
            <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-800">
              Earned at least
              <input type="number" min={0} placeholder="0" value={earnedPoints} onChange={(e) => setEarnedPoints(e.target.value)} aria-label={`Minimum ${unit} earned`} className="w-20 min-h-[40px] rounded-xl border border-zinc-300 px-2 text-center font-semibold focus:outline-none focus:ring-2 focus:ring-evergreen" />
              {unit} in the last
              <input type="number" min={1} value={earnedDays} onChange={(e) => setEarnedDays(e.target.value)} aria-label="Number of days earned" className="w-20 min-h-[40px] rounded-xl border border-zinc-300 px-2 text-center font-semibold focus:outline-none focus:ring-2 focus:ring-evergreen" />
              days
            </p>
            {levels.length > 0 && (
              <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-800">
                Loyalty level
                <select value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Loyalty level" className="min-h-[40px] rounded-xl border border-zinc-300 bg-white px-2 focus:outline-none focus:ring-2 focus:ring-evergreen">
                  <option value="">Any</option>
                  <option value="none">Not at a level yet</option>
                  {levels.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </p>
            )}
            {places.length > 1 && (
              <fieldset className="mt-3">
                <legend className="text-sm text-zinc-800">Only people from these locations (leave empty for all)</legend>
                <div className="mt-1 flex flex-wrap gap-2">
                  {places.map((p) => {
                    const on = chosenPlaces.includes(p.id);
                    return (
                      <label key={p.id} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${on ? "border-evergreen bg-mist/60 text-evergreen-deep font-semibold" : "border-zinc-300 text-zinc-700"}`}>
                        <input type="checkbox" className="sr-only" checked={on} onChange={() => setChosenPlaces(on ? chosenPlaces.filter((x) => x !== p.id) : [...chosenPlaces, p.id])} />
                        {p.name}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}
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
            <div className="rounded-2xl border border-zinc-200 p-4 space-y-3">
              <fieldset>
                <legend className="text-sm font-medium text-zinc-800">When</legend>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {(["now", "later"] as const).map((t) => (
                    <label
                      key={t}
                      className={`cursor-pointer rounded-full border px-4 py-2 text-sm ${timing === t ? "border-evergreen bg-mist/60 text-evergreen-deep font-semibold" : "border-zinc-300 text-zinc-700"}`}
                    >
                      <input type="radio" name="timing" className="sr-only" checked={timing === t} onChange={() => setTiming(t)} />
                      {t === "now" ? "Send now" : "Pick a time"}
                    </label>
                  ))}
                  {timing === "later" && (
                    <input
                      type="datetime-local"
                      aria-label="Send at"
                      value={sendAtLocal}
                      onChange={(e) => setSendAtLocal(e.target.value)}
                      className="min-h-[44px] rounded-xl border border-zinc-300 px-3 text-sm"
                    />
                  )}
                </div>
              </fieldset>
              <p className="flex flex-wrap items-center gap-2 text-sm text-zinc-800">
                Reach at most
                <input
                  type="number"
                  min={1}
                  placeholder="no limit"
                  value={maxPeople}
                  onChange={(e) => setMaxPeople(e.target.value)}
                  aria-label="Most people to reach"
                  className="w-24 min-h-[40px] rounded-xl border border-zinc-300 px-2 text-center font-semibold focus:outline-none focus:ring-2 focus:ring-evergreen"
                />
                people
              </p>
            </div>
            {error && <p className="text-sm text-rose-700">{error}</p>}
            {notice && <p className="pop-in rounded-2xl bg-mist text-evergreen-deep text-sm px-4 py-3">{notice}</p>}

            {confirming ? (
              <div className="pop-in rounded-2xl border-2 border-evergreen p-4">
                <p className="text-sm text-zinc-800">
                  {timing === "later" ? "Schedule" : "Send"} &ldquo;{subject}&rdquo; to <strong>{reach}</strong> customers
                  {timing === "later" ? ` on ${new Date(sendAtLocal).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : " now"}?
                  {timing === "later" ? " You can cancel it until it goes out." : " You can\u2019t unsend it."}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={send}
                    disabled={busy}
                    className="press min-h-[44px] px-5 rounded-full bg-evergreen text-white text-sm font-semibold hover:bg-evergreen-deep cursor-pointer disabled:opacity-50"
                  >
                    {busy ? "Working..." : timing === "later" ? "Yes, schedule it" : "Yes, send it"}
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
                {timing === "later" ? "Schedule for" : "Send to"} {reach === Infinity ? 0 : reach} {reach === 1 ? "customer" : "customers"}
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
        <h3 className="font-display text-lg font-bold text-evergreen-deep">Your offers</h3>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No offers yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-100">
            {history.map((c) => (
              <li key={c.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-zinc-900 truncate">{c.subject}</p>
                  <p className="text-xs text-zinc-500">
                    {c.status === "scheduled" ? "Goes out " : c.status === "cancelled" ? "Cancelled, was due " : ""}
                    {new Date((c.status === "scheduled" || c.status === "cancelled" ? c.scheduledAt : c.sentAt) || c.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {c.status === "scheduled" ? (
                  <p className="text-sm text-zinc-600 shrink-0 flex items-center gap-3">
                    <span className="tabular-nums">About {c.recipientCount} people</span>
                    <button onClick={() => cancel(c.id)} className="font-semibold text-rose-700 hover:underline cursor-pointer">
                      Cancel
                    </button>
                  </p>
                ) : c.status === "cancelled" ? (
                  <p className="text-sm text-zinc-500 shrink-0">Not sent</p>
                ) : (
                  <p className="text-sm text-zinc-600 tabular-nums shrink-0 sm:text-right">
                    {c.delivered} of {c.recipientCount} delivered
                    {c.waiting > 0 ? `, ${c.waiting} on the way` : ""}
                    {c.bounces > 0 ? `, ${c.bounces} bounced` : ""}
                    {c.failed - c.bounces > 0 ? `, ${c.failed - c.bounces} not sent` : ""}
                    <span className="block text-xs text-zinc-500">
                      {c.clicks} opened their card from it{c.optOuts > 0 ? `, ${c.optOuts} stopped offers` : ""}
                    </span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
