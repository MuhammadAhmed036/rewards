"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ensureRecentAuth } from "@/lib/security-client";

interface Settings {
  subdomain: string | null;
  domain: string | null;
  verified: boolean;
  records: { txt: { name: string; value: string }; cname: { name: string; value: string } } | null;
}

const pill = "press min-h-[44px] px-5 rounded-full border border-zinc-300 text-sm font-semibold text-zinc-800 hover:border-evergreen cursor-pointer disabled:opacity-50";

/** Give the shop its own web address, and the DNS steps to prove it is theirs (FR-014). */
export function DomainSettings() {
  const [data, setData] = useState<Settings | null>(null);
  const [input, setInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/v1/owner/domain", { cache: "no-store" });
    if (res.ok) setData((await res.json()).data);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const call = async (method: string, body?: unknown, confirmFirst = false) => {
    setMessage(null);
    if (confirmFirst && !(await ensureRecentAuth())) return;
    setBusy(true);
    const res = await fetch("/api/v1/owner/domain", { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMessage(json.error?.message || "That didn't work.");
    setData(json.data);
    if (json.data.hosting) setMessage(json.data.hosting.note);
    else if (body && (body as { action: string }).action === "verify") setMessage("Verified.");
  };

  if (!data) return null;
  return (
    <section className="mt-6 rounded-3xl bg-white border border-zinc-200 p-5 sm:p-7">
      <h3 className="font-display text-xl font-bold text-evergreen-deep">Your own web address</h3>
      {data.subdomain && (
        <p className="mt-2 text-sm text-zinc-700">
          Your page also works at <span className="font-mono">{data.subdomain}</span>.
        </p>
      )}

      {data.domain ? (
        <div className="mt-3 space-y-3 text-sm">
          <p>
            <span className="font-mono font-semibold">{data.domain}</span>{" "}
            {data.verified ? <span className="text-evergreen font-semibold">is verified</span> : <span className="text-zinc-600">is waiting to be verified</span>}
          </p>
          {!data.verified && data.records && (
            <div className="rounded-2xl bg-zinc-50 p-4 space-y-3">
              <p className="text-zinc-700">At the company where you manage {data.domain}, add these two DNS records, then press Verify:</p>
              <p>
                <strong>1. Proves it&rsquo;s yours</strong> (TXT record)
                <span className="block font-mono text-xs break-all">Name: {data.records.txt.name}</span>
                <span className="block font-mono text-xs break-all">Value: {data.records.txt.value}</span>
              </p>
              <p>
                <strong>2. Points it at your page</strong> (CNAME record)
                <span className="block font-mono text-xs break-all">Name: {data.records.cname.name}</span>
                <span className="block font-mono text-xs break-all">Value: {data.records.cname.value}</span>
              </p>
              <p className="text-xs text-zinc-500">Changes can take a few minutes, sometimes longer, to spread.</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {!data.verified && (
              <button className={`${pill} bg-evergreen text-white border-evergreen hover:bg-evergreen-deep`} disabled={busy} onClick={() => call("POST", { action: "verify" })}>
                {busy ? "Checking..." : "Verify"}
              </button>
            )}
            <button className={`${pill} text-rose-700`} disabled={busy} onClick={() => call("DELETE", undefined, true)}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <form
          className="mt-3 flex flex-col sm:flex-row gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            call("POST", { action: "set", domain: input }, true).then(() => setInput(""));
          }}
        >
          <input
            required
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="rewards.yourshop.com"
            aria-label="Your web address"
            className="min-h-[44px] flex-1 rounded-xl border border-zinc-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen"
          />
          <button type="submit" disabled={busy} className={`${pill} bg-evergreen text-white border-evergreen hover:bg-evergreen-deep`}>
            Use this address
          </button>
        </form>
      )}
      {message && <p className="pop-in mt-3 rounded-2xl bg-mist text-evergreen-deep text-sm px-4 py-3">{message}</p>}
    </section>
  );
}
