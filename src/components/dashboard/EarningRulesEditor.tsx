"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pause, Play, History as HistoryIcon } from "lucide-react";
import { calculatePoints, describeRule, ruleConfigSchema, type RuleConfig } from "@/lib/points";

interface ProgrammeData {
  programme: { id: string; name: string; type: "points" | "stamps"; status: string };
  currentRule: RuleConfig | null;
  history: Array<{ id: string; version: number; createdAt: string; createdByName: string | null; config: RuleConfig }>;
}

const pounds = (minor: number) => (minor / 100).toFixed(2);
const toMinor = (v: string) => Math.round(parseFloat(v || "0") * 100);

/**
 * Owner screen for how customers earn: per spend or per visit, rounding, minimum spend and limits.
 * Saving publishes a new rule version; points already given keep the rule they were earned under.
 */
export function EarningRulesEditor({ symbol = "£" }: { symbol?: string }) {
  const [data, setData] = useState<ProgrammeData | null>(null);
  const [rule, setRule] = useState<RuleConfig | null>(null);
  const [unitPounds, setUnitPounds] = useState("1.00");
  const [minPounds, setMinPounds] = useState("0.00");
  const [example, setExample] = useState("18.70");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/v1/owner/programme", { cache: "no-store" });
    if (!res.ok) return;
    const json: { data: ProgrammeData } = await res.json();
    setData(json.data);
    const current = ruleConfigSchema.parse(json.data.currentRule ?? {
      earn: {}, caps: {}, exclusions: {}, expiry: {},
    });
    setRule(current);
    setUnitPounds(pounds(current.earn.unitMinor));
    setMinPounds(pounds(current.earn.minEligibleMinor));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unit = data?.programme.type === "stamps" ? "stamps" : "points";
  const draft = useMemo(() => {
    if (!rule) return null;
    return {
      ...rule,
      earn: { ...rule.earn, unitMinor: Math.max(1, toMinor(unitPounds)), minEligibleMinor: Math.max(0, toMinor(minPounds)) },
    };
  }, [rule, unitPounds, minPounds]);

  const preview = draft ? calculatePoints({ amountMinor: toMinor(example), rule: draft }) : null;

  if (!data || !rule || !draft) {
    return <p className="text-zinc-500">Loading your rules...</p>;
  }

  const setEarn = (patch: Partial<RuleConfig["earn"]>) => setRule({ ...rule, earn: { ...rule.earn, ...patch } });
  const setCaps = (patch: Partial<RuleConfig["caps"]>) => setRule({ ...rule, caps: { ...rule.caps, ...patch } });
  const setBonuses = (patch: Partial<RuleConfig["bonuses"]>) => setRule({ ...rule, bonuses: { ...rule.bonuses, ...patch } });
  const setExpiry = (patch: Partial<RuleConfig["expiry"]>) => setRule({ ...rule, expiry: { ...rule.expiry, ...patch } });
  const live = data.programme.status === "published";

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/owner/programme", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Couldn't save the new rules.");
      setNotice(`Saved. From now on customers earn ${describeRule(draft, unit, symbol)}. Points already given stay the same.`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the new rules.");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (status: "published" | "paused") => {
    if (status === "paused" && !confirm("Pause earning? Staff won't be able to add points until you go live again. Customers keep their points.")) return;
    setError(null);
    const res = await fetch("/api/v1/owner/programme", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (!res.ok) return setError(json.error?.message || "Couldn't change the status.");
    setNotice(status === "paused" ? "Earning is paused." : "Your programme is live again.");
    load();
  };

  const numberField = (value: number, onChange: (n: number) => void, min = 0) => (
    <input
      type="number"
      min={min}
      inputMode="numeric"
      value={Number.isFinite(value) ? value : ""}
      onChange={(e) => onChange(Math.max(min, parseInt(e.target.value || "0", 10)))}
      className="w-24 min-h-[44px] rounded-xl border border-zinc-300 bg-white px-3 text-base font-semibold text-center focus:outline-none focus:ring-2 focus:ring-evergreen"
    />
  );
  const moneyField = (value: string, onChange: (v: string) => void, label: string) => (
    <span className="inline-flex items-center rounded-xl border border-zinc-300 bg-white focus-within:ring-2 focus-within:ring-evergreen">
      <span className="pl-3 text-zinc-500">{symbol}</span>
      <input
        aria-label={label}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        className="w-20 min-h-[44px] bg-transparent px-2 text-base font-semibold focus:outline-none"
      />
    </span>
  );

  return (
    <div className="space-y-6">
      {/* Live / paused */}
      <section
        className={`rounded-3xl border p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          live ? "bg-white border-zinc-200" : "bg-marigold/20 border-marigold/60"
        }`}
      >
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${live ? "bg-evergreen" : "bg-marigold"}`} aria-hidden />
          <div>
            <p className="font-semibold text-zinc-900">{live ? "Your programme is live" : "Earning is paused"}</p>
            <p className="text-sm text-zinc-600">
              {live
                ? `Staff can add ${unit} and customers can claim rewards.`
                : `Staff can't add ${unit} right now. Customers keep what they have.`}
            </p>
          </div>
        </div>
        <button
          onClick={() => setStatus(live ? "paused" : "published")}
          className={`press inline-flex items-center gap-2 min-h-[44px] px-5 rounded-full text-sm font-semibold cursor-pointer ${
            live ? "border border-zinc-300 bg-white text-zinc-800 hover:border-evergreen" : "bg-evergreen text-white hover:bg-evergreen-deep"
          }`}
        >
          {live ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {live ? "Pause earning" : "Go live again"}
        </button>
      </section>

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Rules form */}
        <section className="lg:col-span-7 rounded-3xl bg-white border border-zinc-200 p-5 sm:p-7 space-y-7">
          <div>
            <h3 className="font-display text-xl font-bold text-evergreen-deep">How customers earn</h3>
            <div className="mt-4 grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Earning method">
              {([
                { mode: "spend", title: "For what they spend", hint: "Best for cafés, salons and restaurants" },
                { mode: "visit", title: "For each visit", hint: "Best for car washes and barbers" },
              ] as const).map((o) => {
                const on = (rule.earn.mode === "fixed" ? "visit" : rule.earn.mode) === o.mode;
                return (
                  <button
                    key={o.mode}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setEarn({ mode: o.mode })}
                    className={`press text-left rounded-2xl border-2 p-4 cursor-pointer transition-colors ${
                      on ? "border-evergreen bg-mist/60" : "border-zinc-200 hover:border-zinc-300"
                    }`}
                  >
                    <span className="block font-semibold text-zinc-900">{o.title}</span>
                    <span className="block text-sm text-zinc-500">{o.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {rule.earn.mode === "spend" ? (
            <div className="space-y-5">
              <p className="flex flex-wrap items-center gap-2 text-zinc-800">
                Give {numberField(rule.earn.pointsPerUnit, (n) => setEarn({ pointsPerUnit: n }), 1)} {unit} for every{" "}
                {moneyField(unitPounds, setUnitPounds, "Spend per reward unit")} spent
              </p>
              <fieldset>
                <legend className="text-sm font-medium text-zinc-800">When the amount isn&rsquo;t exact</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {([
                    { v: "down", label: "Round down", ex: `${symbol}18.70 gives 18` },
                    { v: "nearest", label: "Round to nearest", ex: `${symbol}18.70 gives 19` },
                  ] as const).map((o) => (
                    <label
                      key={o.v}
                      className={`cursor-pointer rounded-full border px-4 py-2 text-sm ${
                        rule.earn.rounding === o.v ? "border-evergreen bg-mist/60 text-evergreen-deep font-semibold" : "border-zinc-300 text-zinc-700"
                      }`}
                    >
                      <input
                        type="radio"
                        name="rounding"
                        className="sr-only"
                        checked={rule.earn.rounding === o.v}
                        onChange={() => setEarn({ rounding: o.v })}
                      />
                      {o.label} <span className="text-zinc-500 font-normal">({o.ex})</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="flex flex-wrap items-center gap-2 text-zinc-800">
                Only count spends of {moneyField(minPounds, setMinPounds, "Minimum spend")} or more
                <span className="text-sm text-zinc-500">({symbol}0.00 means any amount)</span>
              </p>
              <label className="flex items-center gap-3 text-zinc-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rule.exclusions.excludeTips}
                  onChange={(e) => setRule({ ...rule, exclusions: { ...rule.exclusions, excludeTips: e.target.checked } })}
                  className="w-5 h-5 accent-evergreen"
                />
                Don&rsquo;t give {unit} on tips
              </label>
            </div>
          ) : (
            <p className="flex flex-wrap items-center gap-2 text-zinc-800">
              Give {numberField(rule.earn.pointsPerVisit, (n) => setEarn({ pointsPerVisit: n }), 1)} {unit} each time they visit
            </p>
          )}

          <div>
            <h3 className="font-display text-lg font-bold text-evergreen-deep">Limits</h3>
            <p className="text-sm text-zinc-600 mt-0.5">These stop mistakes and misuse at the till.</p>
            <div className="mt-4 space-y-3 text-zinc-800">
              <p className="flex flex-wrap items-center gap-2">
                At most {numberField(rule.caps.maxPointsPerTransaction, (n) => setCaps({ maxPointsPerTransaction: n }), 1)} {unit} for one purchase
              </p>
              <p className="flex flex-wrap items-center gap-2">
                At most {numberField(rule.caps.maxPointsPerMemberPerDay, (n) => setCaps({ maxPointsPerMemberPerDay: n }), 1)} {unit} per customer per day
              </p>
              <p className="flex flex-wrap items-center gap-2">
                Wait {numberField(rule.caps.minMinutesBetweenEarns, (n) => setCaps({ minMinutesBetweenEarns: n }), 0)} minutes before the same customer earns again
                <span className="text-sm text-zinc-500">(a manager can override)</span>
              </p>
            </div>
          </div>

          <div>
            <h3 className="font-display text-lg font-bold text-evergreen-deep">Extras</h3>
            <p className="text-sm text-zinc-600 mt-0.5">Leave at 0 to switch off.</p>
            <div className="mt-4 space-y-3 text-zinc-800">
              <p className="flex flex-wrap items-center gap-2">
                Give {numberField(rule.bonuses.welcomePoints, (n) => setBonuses({ welcomePoints: n }), 0)} {unit} when someone joins
              </p>
              <p className="flex flex-wrap items-center gap-2">
                Give {numberField(rule.bonuses.birthdayPoints, (n) => setBonuses({ birthdayPoints: n }), 0)} {unit} on their birthday
                <span className="text-sm text-zinc-500">(for customers who add their birthday)</span>
              </p>
            </div>
          </div>

          <div>
            <h3 className="font-display text-lg font-bold text-evergreen-deep">Do {unit} expire?</h3>
            <label className="mt-3 flex items-center gap-3 text-zinc-800 cursor-pointer">
              <input
                type="checkbox"
                checked={rule.expiry.enabled}
                onChange={(e) => setExpiry({ enabled: e.target.checked })}
                className="w-5 h-5 accent-evergreen"
              />
              Yes, after a long time without a visit
            </label>
            {rule.expiry.enabled && (
              <div className="mt-3 space-y-3 text-zinc-800">
                <p className="flex flex-wrap items-center gap-2">
                  {unit[0].toUpperCase() + unit.slice(1)} expire after {numberField(rule.expiry.months, (n) => setExpiry({ months: n }), 1)} months with no visit
                </p>
                <p className="flex flex-wrap items-center gap-2">
                  Email a reminder {numberField(rule.expiry.warnDays, (n) => setExpiry({ warnDays: n }), 1)} days before
                </p>
                <p className="text-sm text-zinc-500">
                  Customers see this on their card and in your terms. Check the rules for your country before switching it on.
                </p>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-rose-700">{error}</p>}
          {notice && <p className="pop-in rounded-2xl bg-mist text-evergreen-deep text-sm px-4 py-3">{notice}</p>}
          <button
            onClick={save}
            disabled={saving}
            className="press min-h-[48px] px-6 rounded-full bg-evergreen text-white font-semibold hover:bg-evergreen-deep cursor-pointer disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save new rules"}
          </button>
        </section>

        {/* Try it + history */}
        <aside className="lg:col-span-5 space-y-6">
          <section className="rounded-3xl bg-evergreen-deep text-white p-5 sm:p-7">
            <h3 className="font-display text-lg font-bold">Try it</h3>
            {rule.earn.mode === "spend" ? (
              <>
                <label className="mt-4 flex items-center gap-2 text-white/80">
                  A customer spends
                  <span className="inline-flex items-center rounded-xl bg-white/10 border border-white/20">
                    <span className="pl-3">{symbol}</span>
                    <input
                      aria-label="Example spend"
                      inputMode="decimal"
                      value={example}
                      onChange={(e) => setExample(e.target.value.replace(/[^0-9.]/g, ""))}
                      className="w-24 min-h-[44px] bg-transparent px-2 font-semibold text-white focus:outline-none"
                    />
                  </span>
                </label>
                <p className="mt-5 font-display text-5xl font-bold tabular-nums">{preview?.points ?? 0}</p>
                <p className="text-white/75">{unit} they&rsquo;d get</p>
                {preview?.cappedByTransaction && <p className="mt-2 text-sm text-marigold">Capped by your one-purchase limit.</p>}
              </>
            ) : (
              <>
                <p className="mt-5 font-display text-5xl font-bold tabular-nums">{rule.earn.pointsPerVisit}</p>
                <p className="text-white/75">{unit} for every visit</p>
              </>
            )}
            <p className="mt-5 pt-4 border-t border-white/15 text-sm text-white/80">
              Customers see: &ldquo;{describeRule(draft, unit, symbol)}&rdquo;
            </p>
          </section>

          <section className="rounded-3xl bg-white border border-zinc-200 p-5 sm:p-7">
            <h3 className="font-display text-lg font-bold text-evergreen-deep flex items-center gap-2">
              <HistoryIcon className="w-5 h-5 text-evergreen" />
              Earlier rules
            </h3>
            <p className="text-sm text-zinc-600 mt-0.5">Each purchase keeps the rule it was earned under.</p>
            <ul className="mt-4 divide-y divide-zinc-100">
              {data.history.map((h, i) => (
                <li key={h.id} className="py-3">
                  <p className="text-sm font-semibold text-zinc-900">
                    {describeRule(h.config, unit, symbol)}
                    {i === 0 && <span className="ml-2 text-xs font-semibold text-evergreen bg-mist rounded-full px-2 py-0.5">Current</span>}
                  </p>
                  <p className="text-xs text-zinc-500">
                    From {new Date(h.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    {h.createdByName ? `, set by ${h.createdByName}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
