"use client";

import React, { useCallback, useEffect, useState } from "react";

interface Overview {
  plan: { id: string; name: string };
  currency: string;
  state: { status: string; daysOverdue: number; restricted: boolean; message: string | null; trialDaysLeft: number | null };
  usage: { staff: { used: number; limit: number | null }; locations: { used: number; limit: number | null } };
  invoices: Array<{ id: string; number: string; description: string; amountMinor: number; currency: string; status: string; dueAt: string }>;
}

const money = (minor: number, currency: string) => new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(minor / 100);
const field = "min-h-[40px] rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-evergreen";

/** Platform admin: change a business's plan, start a trial, raise an invoice, and record that it was paid. */
export function TenantBillingModal({ tenantId, tenantName, onClose }: { tenantId: string; tenantName: string; onClose: () => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [plan, setPlan] = useState<"free" | "pro">("pro");
  const [trialDays, setTrialDays] = useState("0");
  const [reason, setReason] = useState("");
  const [desc, setDesc] = useState("Pro plan, one month");
  const [amount, setAmount] = useState("29.00");
  const [dueDays, setDueDays] = useState("14");
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/admin/tenants/${tenantId}/billing`, { cache: "no-store" });
    if (res.ok) {
      const { data: d } = await res.json();
      setData(d);
      setPlan(d.plan.id);
    }
  }, [tenantId]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (body: Record<string, unknown>) => {
    setMessage(null);
    const res = await fetch(`/api/v1/admin/tenants/${tenantId}/billing`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage(json.error?.message || "That didn't work.");
    if (body.action === "plan" && json.data.overLimit?.length) setMessage(`Done. Note: they are over the new plan (${json.data.overLimit.join(", ")}). Nobody is removed; they just can't add more.`);
    else setMessage("Done.");
    load();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-label={`Billing for ${tenantName}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-auto rounded-3xl bg-white p-6 shadow-2xl space-y-5 text-zinc-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-bold">Billing: {tenantName}</h3>
            {data && (
              <p className="text-sm text-zinc-600">
                {data.plan.name} plan, {data.state.status.replace("_", " ")}
                {data.state.daysOverdue > 0 ? `, ${data.state.daysOverdue} days overdue` : ""}
                {data.state.restricted ? " (growth features paused)" : ""}. Team {data.usage.staff.used}/{data.usage.staff.limit ?? "no limit"}, locations {data.usage.locations.used}/{data.usage.locations.limit ?? "no limit"}.
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-sm font-semibold text-zinc-600 hover:underline cursor-pointer">
            Close
          </button>
        </div>

        <div className="rounded-2xl border border-zinc-200 p-4 space-y-3">
          <p className="font-semibold">Plan and trial</p>
          <div className="flex flex-wrap items-center gap-2">
            <select value={plan} onChange={(e) => setPlan(e.target.value as "free" | "pro")} aria-label="Plan" className={field}>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
            </select>
            <label className="text-sm flex items-center gap-1">
              Free trial days <input type="number" min={0} max={90} value={trialDays} onChange={(e) => setTrialDays(e.target.value)} className={`${field} w-20`} />
            </label>
          </div>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for the change" aria-label="Reason" className={`${field} w-full`} />
          <button onClick={() => act({ action: "plan", plan, trialDays: parseInt(trialDays || "0", 10), reason })} disabled={!reason.trim()} className="min-h-[40px] px-4 rounded-full bg-evergreen text-white text-sm font-semibold cursor-pointer disabled:opacity-50">
            Change plan
          </button>
        </div>

        <div className="rounded-2xl border border-zinc-200 p-4 space-y-3">
          <p className="font-semibold">New invoice</p>
          <div className="flex flex-wrap gap-2">
            <input value={desc} onChange={(e) => setDesc(e.target.value)} aria-label="Description" className={`${field} flex-1 min-w-[12rem]`} />
            <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} aria-label="Amount" className={`${field} w-24`} />
            <label className="text-sm flex items-center gap-1">
              Due in <input type="number" min={0} max={90} value={dueDays} onChange={(e) => setDueDays(e.target.value)} className={`${field} w-16`} /> days
            </label>
          </div>
          <button onClick={() => act({ action: "invoice", description: desc, amountMinor: Math.round(parseFloat(amount || "0") * 100), dueInDays: parseInt(dueDays || "0", 10) })} className="min-h-[40px] px-4 rounded-full border border-zinc-300 text-sm font-semibold hover:border-evergreen cursor-pointer">
            Raise invoice
          </button>
        </div>

        {data && data.invoices.length > 0 && (
          <ul className="divide-y divide-zinc-100 text-sm">
            {data.invoices.map((i) => (
              <li key={i.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-mono text-xs">{i.number}</span> {i.description}, {money(i.amountMinor, i.currency)}, {i.status}
                  {i.status === "open" && new Date(i.dueAt) < new Date() ? " (overdue)" : ""}
                </span>
                {i.status === "open" && (
                  <span className="flex gap-3">
                    <button onClick={() => act({ action: "paid", invoiceId: i.id })} className="font-semibold text-evergreen hover:underline cursor-pointer">
                      Mark paid
                    </button>
                    <button onClick={() => act({ action: "void", invoiceId: i.id })} className="font-semibold text-rose-700 hover:underline cursor-pointer">
                      Void
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between">
          <button
            onClick={() => reason.trim() && confirm("End this business's plan? Growth features pause; customers and points are kept.") && act({ action: "cancel", reason })}
            disabled={!reason.trim()}
            className="text-sm font-semibold text-rose-700 hover:underline cursor-pointer disabled:opacity-40"
            title="Needs a reason above"
          >
            End plan
          </button>
          {message && <p className="text-sm text-zinc-700">{message}</p>}
        </div>
      </div>
    </div>
  );
}
