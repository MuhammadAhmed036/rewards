"use client";

import React, { useState } from "react";
import { DrawnCheck } from "@/components/ui/count-up";

interface HistoryItem {
  id: string;
  label: string;
  pointsDelta: number;
  occurredAt: string;
}

/** Lets a customer tell the shop something is wrong with their points (FR-054). */
export function ReportProblem({
  tenantId,
  membershipId,
  history,
  unit,
}: {
  tenantId: string;
  membershipId: string;
  history: HistoryItem[];
  unit: string;
}) {
  const [open, setOpen] = useState(false);
  const [entryId, setEntryId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return setError("Tell the shop what went wrong.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/customer/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, membershipId, ledgerEntryId: entryId || undefined, message }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Couldn't send your report.");
      setSent(true);
      setMessage("");
      setEntryId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send your report.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="pop-in mt-4 flex items-center gap-3 rounded-2xl bg-mist p-3 text-sm text-evergreen-deep">
        <DrawnCheck className="w-8 h-8 shrink-0" />
        <span>Sent. The shop will check it and fix your {unit} if something was missed.</span>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 text-sm font-semibold text-evergreen hover:text-evergreen-deep hover:underline cursor-pointer"
      >
        Something not right? Tell the shop
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="pop-in mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
      <label className="block text-sm">
        <span className="font-medium text-zinc-800">Which visit is it about?</span>
        <select
          value={entryId}
          onChange={(e) => setEntryId(e.target.value)}
          className="mt-1 w-full min-h-[44px] rounded-xl border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen"
        >
          <option value="">A visit that isn&rsquo;t listed</option>
          {history.map((h) => (
            <option key={h.id} value={h.id}>
              {h.label} ({h.pointsDelta > 0 ? "+" : ""}
              {h.pointsDelta}), {new Date(h.occurredAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="font-medium text-zinc-800">What happened?</span>
        <textarea
          rows={3}
          maxLength={2000}
          placeholder={`e.g. I bought a coffee on Tuesday but didn't get my ${unit}`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="mt-1 w-full rounded-xl border border-zinc-300 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen"
        />
      </label>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="press min-h-[40px] px-4 rounded-full bg-evergreen text-white text-sm font-semibold hover:bg-evergreen-deep cursor-pointer disabled:opacity-50"
        >
          {busy ? "Sending..." : "Send to the shop"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-[40px] px-4 rounded-full border border-zinc-300 text-sm font-semibold text-zinc-700 cursor-pointer">
          Cancel
        </button>
      </div>
    </form>
  );
}
