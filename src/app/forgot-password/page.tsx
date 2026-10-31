"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell, fieldClass, primaryButtonClass } from "@/components/auth/AuthShell";

function ForgotPasswordForm() {
  const roleParam = useSearchParams().get("role");
  const role = roleParam === "owner" || roleParam === "staff" ? roleParam : "customer";
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Couldn't send the email. Try again.");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the email. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthShell title="Check your email" intro={<>We&rsquo;ve sent a link to <strong>{email}</strong> to choose a new password. It works for 30 minutes.</>}>
        <p className="text-sm text-zinc-600">Nothing there? Check your spam folder, or try again in a few minutes.</p>
        <Link href="/login" className={`${primaryButtonClass} mt-6 inline-flex items-center justify-center`}>
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Forgot your password?" intro="Enter the email you sign in with and we'll send you a link to choose a new one.">
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-zinc-800">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${fieldClass} mt-1`}
          />
        </label>
        {error && (
          <p className="text-sm text-rose-700">
            {error}
            {error.includes("register") && role === "customer" && (
              <>
                {" "}
                <Link href="/login" className="font-semibold underline">
                  Create an account
                </Link>
              </>
            )}
          </p>
        )}
        <button type="submit" disabled={busy} className={primaryButtonClass}>
          {busy ? "Sending..." : "Send reset link"}
        </button>
        <p className="text-center text-sm text-zinc-600">
          Remembered it?{" "}
          <Link href="/login" className="font-semibold text-evergreen hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
