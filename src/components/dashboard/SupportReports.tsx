"use client";

import React, { useCallback, useEffect, useState } from "react";
import { LifeBuoy } from "lucide-react";

interface Report {
  id: string;
  message: string;
  contactInfo: string | null;
  status: "open" | "resolved" | string;
  createdAt: string;
  resolvedAt: string | null;
  customerName: string | null;
  memberNumber: string | null;
  entryType: string | null;
  entryPoints: number | null;
  entryNote: string | null;
  entryOccurredAt: string | null;
}

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Customers' "something's wrong with my points" reports, with a way to fix and close each one (FR-054). */
export function SupportReports({ unit = "points", onChange }: { unit?: string; onChange?: () => void }) {
  const [filter, setFilter] = useState<"open" | "resolved">("open");
  const [reports, setReports] = useState<Report[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/owner/support?status=${filter}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({ data: [] }));
    setReports(json.data ?? []);
    setLoaded(true);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const resolve = async (report: Report) => {
    setError(null);
    const add = parseInt(points || "0", 10);
    const res = await fetch("/api/v1/owner/support", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportId: report.id,
        ...(add > 0 ? { issueManualPoints: add, reasonCode: "correction" } : {}),
        note: note.trim() || undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setError(json.error?.message || "Couldn't close the report.");
    setResolving(null);
    setPoints("");
    setNote("");
    load();
    onChange?.();
  };

  return (
    <section className="rounded-3xl bg-white border border-zinc-200 p-5 sm:p-7">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-bold text-evergreen-deep flex items-center gap-2">
            <LifeBuoy className="w-5 h-5 text-evergreen" />
            Problems customers reported
          </h3>
          <p className="text-sm text-zinc-600 mt-0.5">For example a visit that didn&rsquo;t get its {unit}. Fix it here, then close the report.</p>
        </div>
        <div className="grid grid-cols-2 gap-1 p-1 rounded-full bg-zinc-100 shrink-0">
          {(["open", "resolved"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold cursor-pointer ${filter === f ? "bg-evergreen text-white" : "text-zinc-600"}`}
            >
              {f === "open" ? "To do" : "Closed"}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-rose-700">{error}</p>}

      {loaded && reports.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500">{filter === "open" ? "Nothing to sort out. Nice." : "No closed reports yet."}</p>
      ) : (
        <ul className="mt-5 divide-y divide-zinc-100">
          {reports.map((r) => (
            <li key={r.id} className="py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-zinc-900">
                  {r.customerName || "Customer"} {r.memberNumber && <span className="text-zinc-500 font-normal">({r.memberNumber})</span>}
                </p>
                <span className="text-xs text-zinc-500">{when(r.createdAt)}</span>
              </div>
              <p className="mt-1 text-zinc-800 whitespace-pre-wrap">{r.message}</p>
              {r.entryType && (
                <p className="mt-2 text-sm text-zinc-600 rounded-xl bg-zinc-50 px-3 py-2">
                  About: {r.entryNote || r.entryType} ({(r.entryPoints ?? 0) > 0 ? "+" : ""}
                  {r.entryPoints} {unit}){r.entryOccurredAt ? ` on ${when(r.entryOccurredAt)}` : ""}
                </p>
              )}
              {r.contactInfo && <p className="mt-1 text-sm text-zinc-500">Contact: {r.contactInfo}</p>}

              {r.status === "open" &&
                (resolving === r.id ? (
                  <div className="pop-in mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
                    <div className="grid sm:grid-cols-[10rem_1fr] gap-3">
                      <label className="block text-sm">
                        <span className="text-zinc-700">Add {unit} (optional)</span>
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={points}
                          disabled={!r.memberNumber}
                          onChange={(e) => setPoints(e.target.value)}
                          className="mt-1 w-full min-h-[44px] rounded-xl border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="text-zinc-700">Note for your records</span>
                        <input
                          maxLength={500}
                          placeholder="e.g. Checked the till receipt, added the missing visit"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          className="mt-1 w-full min-h-[44px] rounded-xl border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen"
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => resolve(r)}
                        className="press min-h-[40px] px-4 rounded-full bg-evergreen text-white text-sm font-semibold hover:bg-evergreen-deep cursor-pointer"
                      >
                        {parseInt(points || "0", 10) > 0 ? `Add ${points} ${unit} and close` : "Close report"}
                      </button>
                      <button onClick={() => setResolving(null)} className="min-h-[40px] px-4 rounded-full border border-zinc-300 text-sm font-semibold text-zinc-700 cursor-pointer">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setResolving(r.id);
                      setPoints("");
                      setNote("");
                    }}
                    className="press mt-3 min-h-[40px] px-4 rounded-full border border-zinc-300 text-sm font-semibold text-zinc-700 hover:border-evergreen cursor-pointer"
                  >
                    Sort it out
                  </button>
                ))}
              {r.status !== "open" && r.resolvedAt && <p className="mt-2 text-xs text-evergreen">Closed {when(r.resolvedAt)}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
