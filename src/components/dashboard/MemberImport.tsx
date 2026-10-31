"use client";

import React, { useState } from "react";
import { ensureRecentAuth } from "@/lib/security-client";

interface Issue { row: number; email: string; problem: string }
interface Report {
  schemaVersion: string;
  totalRows: number;
  importable: number;
  skipped: number;
  openingPoints: number;
  withMarketingConsent: number;
  issues: Issue[];
}
interface Result { created: number; skipped: number; totalRows: number; issues: Issue[] }

const pill = "press min-h-[44px] px-5 rounded-full border border-zinc-300 text-sm font-semibold text-zinc-800 hover:border-evergreen cursor-pointer disabled:opacity-50";

/** Bring an existing customer list in from a spreadsheet: check it first, see what would happen to every row, then add. */
export function MemberImport({ onDone, unit = "points" }: { onDone?: () => void; unit?: string }) {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = async (commit: boolean) => {
    const res = await fetch("/api/v1/owner/members/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv, commit, consentAttested: attested }),
    });
    return { ok: res.ok, json: await res.json().catch(() => ({})) };
  };

  const check = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    const { ok, json } = await post(false);
    setBusy(false);
    if (!ok) {
      setReport(null);
      return setError(json.error?.message || "Couldn't read that file.");
    }
    setReport(json.data);
  };

  const run = async () => {
    if (!(await ensureRecentAuth())) return;
    setBusy(true);
    setError(null);
    const { ok, json } = await post(true);
    setBusy(false);
    if (!ok) return setError(json.error?.message || "The import didn't go through.");
    setResult(json.data);
    setReport(null);
    setCsv("");
    setFileName("");
    onDone?.();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setCsv(await file.text());
    setReport(null);
    setResult(null);
  };

  return (
    <details className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs">
      <summary className="cursor-pointer font-semibold text-zinc-900">Import customers from a spreadsheet</summary>
      <p className="text-sm text-zinc-600 mt-2">
        Save your list as a CSV file with the columns <span className="font-mono">email, name, points, marketing_consent</span>. Only the email is needed.{" "}
        <button type="button" onClick={() => (window.location.href = "/api/v1/owner/members/import")} className="font-semibold text-evergreen hover:underline cursor-pointer">
          Download the template
        </button>
        . Up to 2,000 customers at a time.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className={`${pill} inline-flex items-center`}>
          Choose a CSV file
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {fileName && <span className="text-sm text-zinc-600">{fileName}</span>}
        <button onClick={check} disabled={busy || !csv} className={`${pill} bg-evergreen text-white border-evergreen hover:bg-evergreen-deep`}>
          {busy && !report ? "Checking..." : "Check the file"}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}

      {report && (
        <div className="pop-in mt-4 space-y-3">
          <p className="rounded-2xl bg-mist px-4 py-3 text-sm text-evergreen-deep">
            <strong>{report.importable}</strong> of {report.totalRows} customers can be added
            {report.openingPoints > 0 && <>, starting with {report.openingPoints.toLocaleString("en-GB")} {unit} between them</>}. {report.skipped > 0 && <>{report.skipped} will be skipped (see below).</>}
          </p>
          {report.skipped > 0 && (
            <div className="max-h-56 overflow-auto rounded-2xl border border-zinc-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 text-zinc-500">
                  <tr>
                    <th className="p-2">Row</th>
                    <th className="p-2">Email</th>
                    <th className="p-2">Why it is skipped</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {report.issues.map((i) => (
                    <tr key={`${i.row}-${i.email}`}>
                      <td className="p-2 tabular-nums">{i.row}</td>
                      <td className="p-2 break-all">{i.email || "(empty)"}</td>
                      <td className="p-2">{i.problem}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {report.withMarketingConsent > 0 && (
            <label className="flex items-start gap-3 text-sm text-zinc-800 cursor-pointer">
              <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} className="mt-1 w-5 h-5 accent-evergreen" />
              <span>
                {report.withMarketingConsent} of these are marked &ldquo;yes&rdquo; to marketing emails. I confirm these customers agreed to hear from us, and I can show when and how.
              </span>
            </label>
          )}
          <p className="text-xs text-zinc-500">
            Imported customers aren&rsquo;t emailed. They set a password with &ldquo;Forgot password&rdquo; the first time they sign in, and accept your terms then.
          </p>
          <button
            onClick={run}
            disabled={busy || report.importable === 0 || (report.withMarketingConsent > 0 && !attested)}
            className={`${pill} bg-evergreen text-white border-evergreen hover:bg-evergreen-deep`}
          >
            {busy ? "Importing..." : `Add ${report.importable} customers`}
          </button>
        </div>
      )}

      {result && (
        <p className="pop-in mt-4 rounded-2xl bg-mist px-4 py-3 text-sm text-evergreen-deep">
          Done: {result.created} customers added{result.skipped > 0 ? `, ${result.skipped} skipped` : ""}.
        </p>
      )}
    </details>
  );
}
