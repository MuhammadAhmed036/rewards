"use client";

import React, { useCallback, useEffect, useState } from "react";

interface Agent { id: string; email: string; name: string | null }

/** Platform admins decide who is on the support team. Agents can only read, and only where an owner has allowed it. */
export function SupportAgentsPanel() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/v1/admin/support-agents", { cache: "no-store" });
    if (res.ok) setAgents((await res.json()).data);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const change = async (address: string, enabled: boolean) => {
    setMessage(null);
    const res = await fetch("/api/v1/admin/support-agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: address, enabled }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage(json.error?.message || "Couldn't change that.");
    setEmail("");
    load();
  };

  return (
    <section className="mt-6 rounded-3xl bg-white border border-zinc-200 p-5 sm:p-7">
      <h3 className="font-display text-xl font-bold text-evergreen-deep">Support team</h3>
      <p className="text-sm text-zinc-600 mt-1">Support agents sign in here, then use /support. They can only read, and only for businesses that have allowed it.</p>
      <ul className="mt-3 divide-y divide-zinc-100">
        {agents.map((a) => (
          <li key={a.id} className="py-2 flex items-center justify-between gap-3 text-sm">
            <span>{a.name ? `${a.name}, ` : ""}{a.email}</span>
            <button onClick={() => change(a.email, false)} className="font-semibold text-rose-700 hover:underline cursor-pointer">
              Remove
            </button>
          </li>
        ))}
        {agents.length === 0 && <li className="py-2 text-sm text-zinc-500">Nobody yet.</li>}
      </ul>
      <form
        className="mt-3 flex flex-col sm:flex-row gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          change(email, true);
        }}
      >
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Their email (they need an account first)" aria-label="Support agent email" className="min-h-[44px] flex-1 rounded-xl border border-zinc-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen" />
        <button type="submit" className="press min-h-[44px] px-5 rounded-full bg-evergreen text-white text-sm font-semibold hover:bg-evergreen-deep cursor-pointer">
          Add agent
        </button>
      </form>
      {message && <p className="mt-2 text-sm text-rose-700">{message}</p>}
    </section>
  );
}
