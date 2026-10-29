"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell, fieldClass, primaryButtonClass } from "@/components/auth/AuthShell";
import { DrawnCheck } from "@/components/ui/count-up";

function ResetForm() {
  const token = useSearchParams().get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Couldn't reset your password.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reset your password.");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthShell title="This link is incomplete" intro="Open the link from your email again, or ask for a new one.">
        <Link href="/forgot-password" className={`${primaryButtonClass} inline-flex items-center justify-center`}>
          Get a new link
        </Link>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Password changed" intro="You've been signed out on every device. Sign in with your new password.">
        <div className="text-evergreen mb-6">
          <DrawnCheck className="w-14 h-14" />
        </div>
        <Link href="/login" className={`${primaryButtonClass} inline-flex items-center justify-center`}>
          Sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" intro="Use at least 8 characters.">
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-zinc-800">New password</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${fieldClass} mt-1`}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-zinc-800">Type it again</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={`${fieldClass} mt-1`}
          />
        </label>
        {error && (
          <p className="text-sm text-rose-700">
            {error}{" "}
            {error.includes("expired") && (
              <Link href="/forgot-password" className="font-semibold underline">
                Get a new link
              </Link>
            )}
          </p>
        )}
        <button type="submit" disabled={busy} className={primaryButtonClass}>
          {busy ? "Saving..." : "Save new password"}
        </button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
