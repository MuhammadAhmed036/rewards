"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell, fieldClass, primaryButtonClass } from "@/components/auth/AuthShell";
import { DrawnCheck } from "@/components/ui/count-up";

interface Invite {
  businessName: string;
  email: string;
  role: string;
  name: string;
}

function AcceptInvite() {
  const token = useSearchParams().get("token") || "";
  const [invite, setInvite] = useState<Invite | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(token ? null : "This invite link is incomplete. Open it from the email again.");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/v1/auth/invite?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error?.message);
        setInvite(json.data);
        setName(json.data.name || "");
      })
      .catch((err) => setError(err instanceof Error && err.message ? err.message : "This invite isn't valid."));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Couldn't accept the invite.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't accept the invite.");
    } finally {
      setBusy(false);
    }
  };

  if (done && invite) {
    return (
      <AuthShell title="You're all set" intro={`Sign in with ${invite.email} and the password you just chose.`}>
        <div className="text-evergreen mb-6">
          <DrawnCheck className="w-14 h-14" />
        </div>
        <Link href="/login" className={`${primaryButtonClass} inline-flex items-center justify-center`}>
          Sign in to the scanner
        </Link>
      </AuthShell>
    );
  }

  if (!invite) {
    return error ? (
      <AuthShell title="This invite can't be used" intro={error}>
        <Link href="/login" className={`${primaryButtonClass} inline-flex items-center justify-center`}>
          Go to sign in
        </Link>
      </AuthShell>
    ) : (
      <AuthShell title="Opening your invite...">{null}</AuthShell>
    );
  }

  const roleWord = invite.role === "manager" ? "a manager" : invite.role === "marketing" ? "the marketing team" : "staff";
  return (
    <AuthShell title={`Join ${invite.businessName}`} intro={`You've been added as ${roleWord}. Choose a password to start using the scanner.`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-zinc-600">
          Your sign-in email: <strong className="text-zinc-900">{invite.email}</strong>
        </p>
        <label className="block">
          <span className="text-sm font-medium text-zinc-800">Your name</span>
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className={`${fieldClass} mt-1`} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-zinc-800">Choose a password</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${fieldClass} mt-1`}
          />
          <span className="block text-xs text-zinc-500 mt-1">At least 8 characters.</span>
        </label>
        {error && <p className="text-sm text-rose-700">{error}</p>}
        <button type="submit" disabled={busy} className={primaryButtonClass}>
          {busy ? "Saving..." : "Accept and set password"}
        </button>
      </form>
    </AuthShell>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInvite />
    </Suspense>
  );
}
