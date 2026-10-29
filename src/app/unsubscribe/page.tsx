"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell, primaryButtonClass } from "@/components/auth/AuthShell";

function Unsubscribe() {
  const params = useSearchParams();
  const m = params.get("m") || "";
  const t = params.get("t") || "";
  const kind = params.get("kind") === "offers" ? "offers" : "card";
  const [state, setState] = useState<{ on: boolean; businessName: string } | null>(null);
  const [error, setError] = useState<string | null>(m && t ? null : "This link is incomplete.");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const set = async (on: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/public/card-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ m, t, on, kind }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message);
      setState(json.data);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't change your email settings.");
    } finally {
      setBusy(false);
    }
  };

  // Opening the link switches the emails off straight away (one click, as the email promised)
  useEffect(() => {
    if (!m || !t || started.current) return;
    started.current = true;
    set(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m, t]);

  if (error) {
    return (
      <AuthShell title="We couldn't change your emails" intro={error}>
        <Link href="/me" className={`${primaryButtonClass} inline-flex items-center justify-center`}>
          Go to my account
        </Link>
      </AuthShell>
    );
  }
  if (!state) return <AuthShell title="Updating your emails...">{null}</AuthShell>;

  if (kind === "offers") {
    return (
      <AuthShell
        title="No more offers"
        intro={`You won't get offers from ${state.businessName} any more. You'll still get emails you need, like receipts.`}
      >
        <p className="text-sm text-zinc-600 mb-6">Changed your mind? Turn offers back on from your account.</p>
        <Link href="/me" className={`${primaryButtonClass} inline-flex items-center justify-center`}>
          Go to my account
        </Link>
      </AuthShell>
    );
  }

  return state.on ? (
    <AuthShell title="Emails are back on" intro={`You'll get emails about your ${state.businessName} card again.`}>
      <Link href="/me" className={`${primaryButtonClass} inline-flex items-center justify-center`}>
        Go to my account
      </Link>
    </AuthShell>
  ) : (
    <AuthShell
      title="You won't get these emails any more"
      intro={`We've stopped emails about your ${state.businessName} card. Your card and points stay exactly as they are.`}
    >
      <button onClick={() => set(true)} disabled={busy} className={primaryButtonClass}>
        {busy ? "Saving..." : "Turn them back on"}
      </button>
    </AuthShell>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={null}>
      <Unsubscribe />
    </Suspense>
  );
}
