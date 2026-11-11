"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthShell, primaryButtonClass } from "@/components/auth/AuthShell";

interface Invite {
  email: string;
  businessName: string;
  slug: string;
  inviterName: string;
}

function AcceptHousehold() {
  const token = useSearchParams().get("token") || "";
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState<string | null>(token ? null : "This invitation link is incomplete. Open it from the email again.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/v1/customer/household/accept?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error?.message);
        setInvite(json.data);
      })
      .catch((err) => setError(err instanceof Error && err.message ? err.message : "This invitation isn't valid."));
  }, [token]);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/customer/household/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Couldn't accept the invitation.");
      window.location.href = `/b/${json.data.slug}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't accept the invitation.");
      setBusy(false);
    }
  };

  if (error && !invite) {
    return <AuthShell title="Invitation" intro={error}>{null}</AuthShell>;
  }
  if (!invite) return <AuthShell title="Invitation" intro="Checking your invitation...">{null}</AuthShell>;

  return (
    <AuthShell
      title={`Share ${invite.inviterName}'s card?`}
      intro={`${invite.inviterName} invited ${invite.email} to share their ${invite.businessName} loyalty card.`}
    >
      <ul className="text-sm text-zinc-700 space-y-1.5 list-disc pl-5">
        <li>You will both see and add to the same points.</li>
        <li>You sign in as yourself with this email.</li>
        <li>Either of you can stop sharing at any time.</li>
      </ul>
      {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
      <button type="button" onClick={accept} disabled={busy} className={`${primaryButtonClass} mt-6`}>
        {busy ? "Joining..." : "Accept and share the card"}
      </button>
      <p className="mt-3 text-xs text-zinc-500">Don&rsquo;t know {invite.inviterName}? Close this page and nothing changes.</p>
    </AuthShell>
  );
}

export default function AcceptHouseholdPage() {
  return (
    <Suspense fallback={null}>
      <AcceptHousehold />
    </Suspense>
  );
}
