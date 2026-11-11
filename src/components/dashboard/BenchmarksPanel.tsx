"use client";

import React, { useCallback, useEffect, useState } from "react";

interface Benchmarks {
  participating: boolean;
  windowDays: number;
  methodology: string[];
  note: string | null;
  peers: number;
  minPeers: number;
  metrics: Array<{
    key: string;
    label: string;
    unit: string;
    help: string;
    you: number | null;
    typical: number;
    middleHalf: [number, number];
    standing: "top" | "above" | "below" | "bottom" | null;
  }>;
}

const STANDING: Record<string, string> = {
  top: "Among the best quarter of shops",
  above: "Above the typical shop",
  below: "A little below the typical shop",
  bottom: "In the lowest quarter",
};

/**
 * How the shop compares with others that chose to take part (FR-105). It is off until the owner switches it on, and
 * the method is shown beside the numbers.
 */
export function BenchmarksPanel() {
  const [data, setData] = useState<Benchmarks | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/v1/owner/benchmarks", { cache: "no-store" });
    if (res.ok) setData((await res.json()).data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (enabled: boolean) => {
    setBusy(true);
    await fetch("/api/v1/owner/benchmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    await load();
    setBusy(false);
  };

  if (!data) return null;
  const show = (v: number, unit: string) => `${v}${unit}`;

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h4 className="font-display text-lg font-bold text-evergreen-deep">How you compare with other shops</h4>
          <p className="text-sm text-zinc-600 mt-0.5">
            Take part and your figures are counted, without your name, in what other shops see. You see the same comparison.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-zinc-800 shrink-0 cursor-pointer">
          <input
            type="checkbox"
            checked={data.participating}
            disabled={busy}
            onChange={(e) => toggle(e.target.checked)}
            className="h-4 w-4 accent-evergreen"
          />
          Take part
        </label>
      </div>

      {data.note && <p className="mt-3 rounded-2xl bg-zinc-50 border border-zinc-200 text-sm text-zinc-700 px-4 py-3">{data.note}</p>}

      {data.metrics.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-2 pr-3 font-medium">Figure</th>
                <th className="py-2 pr-3 font-medium text-right">You</th>
                <th className="py-2 pr-3 font-medium text-right">Typical shop</th>
                <th className="py-2 pr-3 font-medium text-right">Middle half of shops</th>
                <th className="py-2 font-medium">Where you are</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {data.metrics.map((m) => (
                <tr key={m.key} title={m.help}>
                  <td className="py-2.5 pr-3 text-zinc-900">{m.label}</td>
                  <td className="py-2.5 pr-3 text-right font-semibold tabular-nums">{m.you === null ? "n/a" : show(m.you, m.unit)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{show(m.typical, m.unit)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    {show(m.middleHalf[0], m.unit)} to {show(m.middleHalf[1], m.unit)}
                  </td>
                  <td className="py-2.5 text-zinc-700">{m.standing ? STANDING[m.standing] : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-zinc-500">Compared with {data.peers} other shops, over the last {data.windowDays} days.</p>
        </div>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-800">How this is worked out</summary>
        <ul className="mt-2 space-y-1.5 list-disc pl-5 text-xs text-zinc-600">
          {data.methodology.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
