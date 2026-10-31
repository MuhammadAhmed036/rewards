"use client";

import React, { useEffect, useState } from "react";

const area = "mt-1 w-full rounded-xl border border-zinc-300 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen";

/** The shop's own extra terms, in English and in other languages. Customers see the one for their language. */
export function TermsEditor() {
  const [text, setText] = useState("");
  const [translations, setTranslations] = useState<Record<string, string>>({}); // kept as saved; not edited here
  const [version, setVersion] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/v1/owner/programme/terms", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        setText(j.data.text);
        setTranslations(j.data.translations ?? {});
        setVersion(j.data.version);
      })
      .catch(() => undefined);
  }, []);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/v1/owner/programme/terms", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, translations }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMessage(json.error?.message || "Couldn't save.");
    setVersion(json.data.version);
    setMessage(json.data.changed ? `Saved as version ${json.data.version}.` : "Nothing changed.");
  };

  return (
    <section className="mt-6 rounded-3xl bg-white border border-zinc-200 p-5 sm:p-7">
      <h3 className="font-display text-xl font-bold text-evergreen-deep">Your own terms{version ? ` (version ${version})` : ""}</h3>
      <p className="text-sm text-zinc-600 mt-1">
        Anything extra you want customers to agree to. It&rsquo;s shown on your terms page below the standard terms. 
      </p>
      <label className="block mt-4 text-sm">
        <span className="font-medium text-zinc-800">English</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={8000} className={area} />
      </label>
      <button onClick={save} disabled={busy} className="press mt-4 min-h-[44px] px-5 rounded-full bg-evergreen text-white font-semibold hover:bg-evergreen-deep cursor-pointer disabled:opacity-50">
        {busy ? "Saving..." : "Save terms"}
      </button>
      {message && <p className="pop-in mt-3 rounded-2xl bg-mist text-evergreen-deep text-sm px-4 py-3">{message}</p>}
      <p className="mt-2 text-xs text-zinc-500">Changing the terms raises the version number. </p>
    </section>
  );
}
