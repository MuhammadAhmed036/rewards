"use client";

import React, { useEffect, useState } from "react";

/** Owner switch for live QR codes: the customer's code changes every 30 seconds, so a photo of it is useless. */
export function LiveQrSettings() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/v1/owner/live-qr", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setEnabled(j.data.enabled))
      .catch(() => undefined);
  }, []);

  const toggle = async () => {
    setBusy(true);
    const res = await fetch("/api/v1/owner/live-qr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !enabled }) });
    if (res.ok) setEnabled((await res.json()).data.enabled);
    setBusy(false);
  };

  if (enabled === null) return null;
  return (
    <section className="mt-6 rounded-3xl bg-white border border-zinc-200 p-5 sm:p-7">
      <h3 className="font-display text-xl font-bold text-evergreen-deep">Live QR codes</h3>
      <p className="text-sm text-zinc-600 mt-1">
        When on, each customer&rsquo;s QR code changes every 30 seconds and works once, so a screenshot or a photo can&rsquo;t be used to earn or claim.
        Customers need to have their card open on their phone; staff can still type a customer ID. Printed or saved codes stop working.
      </p>
      <p className="mt-3 text-sm font-semibold text-zinc-900">{enabled ? "On" : "Off"}</p>
      <button onClick={toggle} disabled={busy} className="press mt-3 min-h-[44px] px-5 rounded-full border border-zinc-300 text-zinc-800 font-semibold hover:border-evergreen cursor-pointer disabled:opacity-50">
        {enabled ? "Turn off" : "Turn on"}
      </button>
    </section>
  );
}
