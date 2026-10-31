"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ensureRecentAuth } from "@/lib/security-client";

/**
 * Lets someone who works for a business (or an admin) ask for a code emailed to them every time they sign in.
 * Turning it on first sends a code, so it can only be switched on with an inbox that works.
 */
export function SecuritySettings() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"idle" | "code">("idle");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/v1/auth/mfa", { cache: "no-store" });
    if (!res.ok) return;
    const { data } = await res.json();
    setEnabled(data.enabled);
    setEmail(data.email ?? "");
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const call = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/v1/auth/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setMessage(json.error?.message || "That did not work. Try again.");
    return res.ok ? json.data : null;
  };

  const sendCode = async () => {
    if (await call({ action: "send" })) {
      setStep("code");
      setCode("");
      setMessage(`We emailed a code to ${email}.`);
    }
  };

  const turnOn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await call({ action: "enable", code })) {
      setEnabled(true);
      setStep("idle");
      setMessage("Done. From now on you will be emailed a code each time you sign in.");
    }
  };

  const turnOff = async () => {
    if (!(await ensureRecentAuth())) return;
    if (await call({ action: "disable" })) {
      setEnabled(false);
      setMessage("Sign-in codes are off.");
    }
  };

  if (enabled === null) return null;

  return (
    <section className="mt-6 rounded-3xl bg-white border border-zinc-200 p-5 sm:p-7">
      <h3 className="font-display text-xl font-bold text-evergreen-deep">Sign-in code</h3>
      <p className="text-sm text-zinc-600 mt-1">
        Extra protection for your login: after your password, we email a 6-digit code to {email}. Someone who steals your password still can not get in.
      </p>
      <p className="mt-3 text-sm font-semibold text-zinc-900">{enabled ? "On" : "Off"}</p>

      {step === "code" ? (
        <form onSubmit={turnOn} className="mt-3 flex flex-col sm:flex-row gap-2">
          <input
            autoFocus
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            aria-label="6-digit code"
            placeholder="6-digit code"
            className="min-h-[44px] rounded-xl border border-zinc-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-evergreen"
          />
          <button type="submit" disabled={busy || code.length !== 6} className="press min-h-[44px] px-5 rounded-full bg-evergreen text-white font-semibold hover:bg-evergreen-deep cursor-pointer disabled:opacity-50">
            Turn on
          </button>
        </form>
      ) : enabled ? (
        <button onClick={turnOff} disabled={busy} className="press mt-3 min-h-[44px] px-5 rounded-full border border-zinc-300 text-zinc-800 font-semibold hover:border-evergreen cursor-pointer disabled:opacity-50">
          Turn off
        </button>
      ) : (
        <button onClick={sendCode} disabled={busy} className="press mt-3 min-h-[44px] px-5 rounded-full bg-evergreen text-white font-semibold hover:bg-evergreen-deep cursor-pointer disabled:opacity-50">
          {busy ? "Sending..." : "Email me a code to turn on"}
        </button>
      )}
      {message && <p className="pop-in mt-3 rounded-2xl bg-mist text-evergreen-deep text-sm px-4 py-3">{message}</p>}
    </section>
  );
}
