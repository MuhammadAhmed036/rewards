"use client";

import React, { useEffect, useState } from "react";

type Totals = { newMembers: number; activeMembers: number; purchases: number; pointsAwarded: number; redemptions: number };

interface Insights {
  timezone: string;
  attributionDays: number;
  comparison: { current: Totals; previous: Totals | null };
  repeat: { buyers: number; repeaters: number; ratePercent: number | null };
  earnToRedeem: { earners: number; redeemers: number; ratePercent: number | null };
  breakage: { awarded: number; expired: number; redeemed: number; ratePercent: number | null };
  cohorts: Array<{ month: string; size: number; month1: number | null; month2: number | null; month3: number | null }>;
  campaigns: Array<{ id: string; subject: string; sentAt: string; reached: number; converted: number; ratePercent: number | null }>;
  locations: Array<{ id: string; name: string; purchases: number; points: number; customers: number; redemptions: number }>;
  definitions: Record<string, string>;
}

const percent = (v: number | null) => (v === null ? "n/a" : `${v}%`);

/** "up 12%" / "down 5%" / "no change", against the period just before. */
function change(now: number, before: number | undefined) {
  if (before === undefined) return null;
  if (before === 0) return now === 0 ? "no change" : "new";
  const d = Math.round(((now - before) / before) * 100);
  return d === 0 ? "no change" : `${d > 0 ? "up" : "down"} ${Math.abs(d)}%`;
}

function Stat({ label, value, hint, delta }: { label: string; value: string; hint: string; delta?: string | null }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4" title={hint}>
      <p className="text-sm text-zinc-600">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold tabular-nums text-evergreen-deep">{value}</p>
      {delta && <p className="text-xs text-zinc-500 mt-0.5">{delta} on the period before</p>}
      <p className="mt-2 text-xs text-zinc-500">{hint}</p>
    </div>
  );
}

/**
 * Repeat visits, who comes back, rewards that expire unused, how offers worked and how each location is doing.
 * Each figure has its meaning beside it, and everything is counted in the shop's own time zone (FR-101 to FR-103).
 */
export function InsightsPanel({ range, unit = "points" }: { range: "7d" | "30d" | "90d" | "12m" | "all"; unit?: string }) {
  const [data, setData] = useState<Insights | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null);
    setFailed(false);
    fetch(`/api/v1/owner/analytics?range=${range}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!live) return;
        if (r.ok) setData(j.data);
        else setFailed(true);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [range]);

  if (failed) return <p className="text-sm text-zinc-500">Couldn&rsquo;t load your insights right now.</p>;
  if (!data) return <p className="text-sm text-zinc-500">Loading your insights...</p>;

  const cur = data.comparison.current;
  const prev = data.comparison.previous ?? undefined;
  const hasCohorts = data.cohorts.some((c) => c.size > 0);

  return (
    <section className="space-y-6" aria-label="Insights">
      <div>
        <h3 className="font-display text-2xl font-bold text-evergreen-deep">How it&rsquo;s going</h3>
        <p className="text-sm text-zinc-600 mt-1">Counted in {data.timezone} time. {data.definitions.purchase}</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Customers who came back" value={percent(data.repeat.ratePercent)} hint={data.definitions.repeatRate} />
        <Stat label="Used a reward" value={percent(data.earnToRedeem.ratePercent)} hint={data.definitions.earnToRedeem} />
        <Stat label={`${unit[0].toUpperCase()}${unit.slice(1)} that expired`} value={percent(data.breakage.ratePercent)} hint={data.definitions.breakage} />
        <Stat label="Visits" value={String(cur.purchases)} hint="Purchases in this period." delta={change(cur.purchases, prev?.purchases)} />
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Stat label="New customers" value={String(cur.newMembers)} hint="Joined in this period." delta={change(cur.newMembers, prev?.newMembers)} />
        <Stat label="Active customers" value={String(cur.activeMembers)} hint="Had any activity in this period." delta={change(cur.activeMembers, prev?.activeMembers)} />
        <Stat label="Rewards used" value={String(cur.redemptions)} hint="Rewards and items given for points." delta={change(cur.redemptions, prev?.redemptions)} />
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
        <h4 className="font-display text-lg font-bold text-evergreen-deep">Do new customers come back?</h4>
        <p className="text-sm text-zinc-600 mt-0.5">{data.definitions.cohort}</p>
        {hasCohorts ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="py-2 pr-4 font-semibold">Joined</th>
                  <th className="py-2 pr-4 font-semibold">Customers</th>
                  <th className="py-2 pr-4 font-semibold">Next month</th>
                  <th className="py-2 pr-4 font-semibold">2 months on</th>
                  <th className="py-2 font-semibold">3 months on</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 tabular-nums">
                {data.cohorts.map((c) => (
                  <tr key={c.month}>
                    <td className="py-2 pr-4 font-medium text-zinc-900">{c.month}</td>
                    <td className="py-2 pr-4">{c.size}</td>
                    <td className="py-2 pr-4">{c.month1 === null ? <span className="text-zinc-400">not yet</span> : `${c.month1}%`}</td>
                    <td className="py-2 pr-4">{c.month2 === null ? <span className="text-zinc-400">not yet</span> : `${c.month2}%`}</td>
                    <td className="py-2">{c.month3 === null ? <span className="text-zinc-400">not yet</span> : `${c.month3}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">Nobody has joined in the last six months yet.</p>
        )}
      </div>

      {data.locations.length > 1 && (
        <div className="rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
          <h4 className="font-display text-lg font-bold text-evergreen-deep">Your locations</h4>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="py-2 pr-4 font-semibold">Location</th>
                  <th className="py-2 pr-4 font-semibold">Visits</th>
                  <th className="py-2 pr-4 font-semibold">Customers</th>
                  <th className="py-2 pr-4 font-semibold">{unit[0].toUpperCase() + unit.slice(1)} given</th>
                  <th className="py-2 font-semibold">Rewards used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 tabular-nums">
                {data.locations.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 pr-4 font-medium text-zinc-900">{l.name}</td>
                    <td className="py-2 pr-4">{l.purchases}</td>
                    <td className="py-2 pr-4">{l.customers}</td>
                    <td className="py-2 pr-4">{l.points}</td>
                    <td className="py-2">{l.redemptions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.campaigns.length > 0 && (
        <div className="rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
          <h4 className="font-display text-lg font-bold text-evergreen-deep">Did your offers work?</h4>
          <p className="text-sm text-zinc-600 mt-0.5">{data.definitions.campaign}</p>
          <ul className="mt-3 divide-y divide-zinc-100">
            {data.campaigns.map((c) => (
              <li key={c.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="min-w-0">
                  <span className="block font-semibold text-zinc-900 truncate">{c.subject}</span>
                  <span className="block text-xs text-zinc-500">{new Date(c.sentAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                </span>
                <span className="text-sm text-zinc-700 tabular-nums">
                  {c.converted} of {c.reached} bought ({percent(c.ratePercent)})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
