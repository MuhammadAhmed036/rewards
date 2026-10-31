"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ensureRecentAuth } from "@/lib/security-client";

interface Hook { id: string; url: string; events: string[]; active: boolean; createdAt: string }
interface Delivery { id: string; endpointId: string; status: string; attempts: number; lastStatusCode: number | null; lastError: string | null; createdAt: string; eventName: string }
interface KeyRow { id: string; name: string; prefix: string; scopes: string[]; lastUsedAt: string | null; expiresAt: string | null; revokedAt: string | null }

const field = "min-h-[44px] rounded-xl border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen";
const pill = "press min-h-[40px] px-4 rounded-full border border-zinc-300 text-sm font-semibold text-zinc-800 hover:border-evergreen cursor-pointer disabled:opacity-50";

const SCOPE_LABEL: Record<string, string> = {
  "earn:write": "Report sales from a till (give points)",
  "events:read": "Read what has happened (events)",
};

/** Owner screen for connecting other systems: webhooks that are told about events, and keys for a till or POS. */
export function IntegrationsSettings() {
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [eventNames, setEventNames] = useState<string[]>([]);
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [scopes, setScopes] = useState<string[]>([]);
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [keyName, setKeyName] = useState("");
  const [keyScopes, setKeyScopes] = useState<string[]>(["earn:write"]);
  const [secretShown, setSecretShown] = useState<{ label: string; value: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [h, k] = await Promise.all([fetch("/api/v1/owner/webhooks", { cache: "no-store" }), fetch("/api/v1/owner/api-keys", { cache: "no-store" })]);
    if (h.ok) {
      const { data } = await h.json();
      setHooks(data.endpoints);
      setDeliveries(data.recent);
      setEventNames(data.eventNames);
    }
    if (k.ok) {
      const { data } = await k.json();
      setKeys(data.keys);
      setScopes(data.scopes);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const call = async (path: string, method: string, body?: unknown, needsConfirm = false) => {
    setMessage(null);
    if (needsConfirm && !(await ensureRecentAuth())) return null;
    const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(json.error?.message || "That didn't work. Try again.");
      return null;
    }
    return json.data;
  };

  const addHook = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = await call("/api/v1/owner/webhooks", "POST", { url, events: picked }, true);
    if (data) {
      setSecretShown({ label: "Signing secret for your webhook", value: data.secret });
      setUrl("");
      setPicked([]);
      load();
    }
  };

  const addKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = await call("/api/v1/owner/api-keys", "POST", { name: keyName, scopes: keyScopes }, true);
    if (data) {
      setSecretShown({ label: `Your new key "${data.name}"`, value: data.key });
      setKeyName("");
      load();
    }
  };

  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <section className="mt-6 rounded-3xl bg-white border border-zinc-200 p-5 sm:p-7 space-y-8" aria-label="Integrations">
      <div>
        <h3 className="font-display text-xl font-bold text-evergreen-deep">Connect other systems</h3>
        <p className="text-sm text-zinc-600 mt-1">
          Webhooks tell your own software when something happens, such as points earned. Keys let a till or POS give points for a sale. Both are for developers;
          see the guide in the project&rsquo;s docs.
        </p>
      </div>

      {secretShown && (
        <div className="pop-in rounded-2xl border-2 border-marigold bg-marigold/20 p-4">
          <p className="font-semibold text-zinc-900">{secretShown.label}</p>
          <p className="text-sm text-zinc-700">Copy it now. For your security it isn&rsquo;t shown again.</p>
          <p className="mt-2 break-all rounded-xl bg-white px-3 py-2 font-mono text-sm">{secretShown.value}</p>
          <button className={`${pill} mt-3`} onClick={() => setSecretShown(null)}>
            I&rsquo;ve copied it
          </button>
        </div>
      )}
      {message && <p className="text-sm text-rose-700">{message}</p>}

      <div>
        <h4 className="font-semibold text-zinc-900">Webhooks</h4>
        <ul className="mt-3 space-y-2">
          {hooks.map((h) => (
            <li key={h.id} className="rounded-2xl border border-zinc-200 p-3 text-sm">
              <p className="break-all font-mono text-zinc-900">{h.url}</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {h.events.length === 0 ? "All events" : h.events.join(", ")}
                {h.active ? "" : " (paused)"}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button className={pill} onClick={async () => (await call("/api/v1/owner/webhooks", "PATCH", { action: "active", id: h.id, active: !h.active })) && load()}>
                  {h.active ? "Pause" : "Resume"}
                </button>
                <button
                  className={pill}
                  onClick={async () => {
                    const d = await call("/api/v1/owner/webhooks", "PATCH", { action: "rotate", id: h.id }, true);
                    if (d) setSecretShown({ label: "New signing secret", value: d.secret });
                  }}
                >
                  New secret
                </button>
                <button className={`${pill} text-rose-700`} onClick={async () => (await call(`/api/v1/owner/webhooks?id=${h.id}`, "DELETE", undefined, true)) && load()}>
                  Remove
                </button>
              </div>
            </li>
          ))}
          {hooks.length === 0 && <li className="text-sm text-zinc-500">No webhooks yet.</li>}
        </ul>

        <form onSubmit={addHook} className="mt-4 space-y-3">
          <input type="url" required placeholder="https://example.com/hooks" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Webhook address" className={`${field} w-full`} />
          <details className="text-sm">
            <summary className="cursor-pointer text-zinc-700">Only some events? (leave all unticked for every event)</summary>
            <div className="mt-2 grid sm:grid-cols-2 gap-1.5">
              {eventNames.map((n) => (
                <label key={n} className="flex items-center gap-2">
                  <input type="checkbox" checked={picked.includes(n)} onChange={() => toggle(picked, setPicked, n)} className="accent-evergreen" />
                  <span className="font-mono text-xs">{n}</span>
                </label>
              ))}
            </div>
          </details>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={`${pill} bg-evergreen text-white border-evergreen hover:bg-evergreen-deep`}>
              Add webhook
            </button>
            {hooks.length > 0 && (
              <button type="button" className={pill} onClick={async () => (await call("/api/v1/owner/webhooks", "PATCH", { action: "test" })) && setTimeout(load, 1500)}>
                Send a test event
              </button>
            )}
          </div>
        </form>

        {deliveries.length > 0 && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-semibold text-zinc-800">Recent deliveries</summary>
            <ul className="mt-2 divide-y divide-zinc-100">
              {deliveries.map((d) => (
                <li key={d.id} className="py-2 flex items-center justify-between gap-3">
                  <span className="font-mono text-xs">{d.eventName}</span>
                  <span className={d.status === "sent" ? "text-evergreen font-semibold" : d.status === "dead" ? "text-rose-700 font-semibold" : "text-zinc-600"}>
                    {d.status === "sent" ? "Delivered" : d.status === "dead" ? "Gave up" : d.status === "failed" ? `Retrying (try ${d.attempts})` : "Waiting"}
                    {d.lastError ? `: ${d.lastError}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div>
        <h4 className="font-semibold text-zinc-900">Keys for a till or POS</h4>
        <ul className="mt-3 space-y-2">
          {keys.map((k) => (
            <li key={k.id} className="rounded-2xl border border-zinc-200 p-3 text-sm flex flex-wrap items-center justify-between gap-2">
              <span>
                <span className="font-semibold text-zinc-900">{k.name}</span> <span className="font-mono text-xs text-zinc-500">{k.prefix}...</span>
                <span className="block text-xs text-zinc-500">
                  {k.scopes.map((s) => SCOPE_LABEL[s] ?? s).join(", ")}
                  {k.lastUsedAt ? `, last used ${new Date(k.lastUsedAt).toLocaleDateString("en-GB")}` : ", never used"}
                  {k.revokedAt ? ", revoked" : ""}
                </span>
              </span>
              {!k.revokedAt && (
                <button className={`${pill} text-rose-700`} onClick={async () => (await call(`/api/v1/owner/api-keys?id=${k.id}`, "DELETE", undefined, true)) && load()}>
                  Revoke
                </button>
              )}
            </li>
          ))}
          {keys.length === 0 && <li className="text-sm text-zinc-500">No keys yet.</li>}
        </ul>
        <form onSubmit={addKey} className="mt-4 space-y-3">
          <input required placeholder="Name, e.g. Front till" value={keyName} onChange={(e) => setKeyName(e.target.value)} maxLength={80} aria-label="Key name" className={`${field} w-full`} />
          <div className="space-y-1.5 text-sm">
            {scopes.map((s) => (
              <label key={s} className="flex items-center gap-2">
                <input type="checkbox" checked={keyScopes.includes(s)} onChange={() => toggle(keyScopes, setKeyScopes, s)} className="accent-evergreen" />
                {SCOPE_LABEL[s] ?? s}
              </label>
            ))}
          </div>
          <button type="submit" disabled={keyScopes.length === 0} className={`${pill} bg-evergreen text-white border-evergreen hover:bg-evergreen-deep`}>
            Make a key
          </button>
        </form>
      </div>
    </section>
  );
}
