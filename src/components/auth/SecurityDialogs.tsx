"use client";

import React, { useState, useSyncExternalStore } from "react";
import { securityDialogStore, type SecurityDialog } from "@/lib/security-client";

const field =
  "w-full min-h-[44px] rounded-xl border border-zinc-300 bg-white px-3 text-base focus:outline-none focus:ring-2 focus:ring-evergreen";
const primary =
  "press min-h-[44px] px-5 rounded-full bg-evergreen text-white font-semibold hover:bg-evergreen-deep cursor-pointer disabled:opacity-50";
const secondary = "min-h-[44px] px-4 rounded-full border border-zinc-300 text-zinc-800 font-semibold hover:border-evergreen cursor-pointer";

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-evergreen-deep/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div className="pop-in w-full max-w-sm rounded-3xl bg-white border border-zinc-200 shadow-2xl p-6 space-y-4">
        <h3 className="font-display text-xl font-bold text-evergreen-deep">{title}</h3>
        {children}
      </div>
    </div>
  );
}

/** Asks for the six-digit code that finishes a sign-in. */
function LoginCodeDialog({ dialog }: { dialog: Extract<NonNullable<SecurityDialog>, { kind: "login-code" }> }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/v1/auth/login/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge: dialog.challenge, code }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) return dialog.done({ res: { ok: true, status: res.status }, json });
    setError(json.error?.message || "That code did not work.");
  };

  return (
    <Frame title="Enter your sign-in code">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-zinc-600">We emailed a 6-digit code to {dialog.emailHint}. It works for 10 minutes.</p>
        <input
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          aria-label="6-digit code"
          className={`${field} text-center text-2xl tracking-[0.4em] font-semibold`}
        />
        {error && <p className="text-sm text-rose-700">{error}</p>}
        <div className="flex gap-2.5">
          <button
            type="button"
            className={`${secondary} flex-1`}
            onClick={() => dialog.done({ res: { ok: false, status: 401 }, json: { error: { message: "Sign-in cancelled." } } })}
          >
            Cancel
          </button>
          <button type="submit" disabled={busy || code.length !== 6} className={`${primary} flex-1`}>
            {busy ? "Checking..." : "Sign in"}
          </button>
        </div>
      </form>
    </Frame>
  );
}

/** Asks for the password (or an emailed code) before a sensitive action. */
function ReauthDialog({ dialog }: { dialog: Extract<NonNullable<SecurityDialog>, { kind: "reauth" }> }) {
  const [useCode, setUseCode] = useState(!dialog.hasPassword);
  const [sentCode, setSentCode] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/v1/auth/reauth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, json: await res.json().catch(() => ({})) };
  };

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    const { ok, json } = await post({ sendCode: true });
    setBusy(false);
    if (!ok) return setError(json.error?.message || "Could not send the code.");
    setUseCode(true);
    setSentCode(true);
    setValue("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { ok, json } = await post(useCode ? { code: value } : { password: value });
    setBusy(false);
    if (ok) return dialog.done(true);
    setError(json.error?.message || "That did not work.");
  };

  return (
    <Frame title="Confirm it is you">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-zinc-600">
          {useCode
            ? sentCode
              ? "We emailed you a 6-digit code. Enter it below."
              : "We will email you a 6-digit code to confirm."
            : "This is a sensitive action. Enter your password to continue."}
        </p>
        {useCode && !sentCode ? (
          <button type="button" onClick={sendCode} disabled={busy} className={`${primary} w-full`}>
            {busy ? "Sending..." : "Email me a code"}
          </button>
        ) : (
          <input
            autoFocus
            type={useCode ? "text" : "password"}
            inputMode={useCode ? "numeric" : undefined}
            autoComplete={useCode ? "one-time-code" : "current-password"}
            maxLength={useCode ? 6 : 128}
            value={value}
            onChange={(e) => setValue(useCode ? e.target.value.replace(/\D/g, "") : e.target.value)}
            aria-label={useCode ? "6-digit code" : "Password"}
            className={field}
          />
        )}
        {error && <p className="text-sm text-rose-700">{error}</p>}
        {!useCode && dialog.hasPassword && (
          <button type="button" onClick={sendCode} disabled={busy} className="text-sm font-semibold text-evergreen hover:underline cursor-pointer">
            Email me a code instead
          </button>
        )}
        <div className="flex gap-2.5">
          <button type="button" className={`${secondary} flex-1`} onClick={() => dialog.done(false)}>
            Cancel
          </button>
          {(!useCode || sentCode) && (
            <button type="submit" disabled={busy || !value} className={`${primary} flex-1`}>
              {busy ? "Checking..." : "Confirm"}
            </button>
          )}
        </div>
      </form>
    </Frame>
  );
}

/** Mounted once in the root layout; shows whichever dialog a page asked for. */
export function SecurityDialogs() {
  const dialog = useSyncExternalStore(securityDialogStore.subscribe, securityDialogStore.get, () => null);
  if (!dialog) return null;
  return dialog.kind === "login-code" ? <LoginCodeDialog dialog={dialog} /> : <ReauthDialog dialog={dialog} />;
}
