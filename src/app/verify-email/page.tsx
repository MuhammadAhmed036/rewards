"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell, primaryButtonClass } from "@/components/auth/AuthShell";
import { DrawnCheck } from "@/components/ui/count-up";

function Verify() {
  const token = useSearchParams().get("token") || "";
  const [state, setState] = useState<"working" | "done" | "failed">(token ? "working" : "failed");
  const [message, setMessage] = useState("This link is incomplete. Open it from the email again.");
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    fetch("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error?.message);
        setState("done");
      })
      .catch((err) => {
        setMessage(err instanceof Error && err.message ? err.message : "Couldn't confirm your email.");
        setState("failed");
      });
  }, [token]);

  if (state === "working") return <AuthShell title="Confirming your email...">{null}</AuthShell>;

  if (state === "done") {
    return (
      <AuthShell title="Email confirmed" intro="Thanks. Your account is all set.">
        <div className="text-evergreen mb-6">
          <DrawnCheck className="w-14 h-14" />
        </div>
        <Link href="/dashboard" className={`${primaryButtonClass} inline-flex items-center justify-center`}>
          Go to my dashboard
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="We couldn't confirm your email" intro={message}>
      <p className="text-sm text-zinc-600 mb-6">
        Sign in and use &ldquo;Send the email again&rdquo; on your dashboard to get a fresh link.
      </p>
      <Link href="/login" className={`${primaryButtonClass} inline-flex items-center justify-center`}>
        Sign in
      </Link>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <Verify />
    </Suspense>
  );
}
