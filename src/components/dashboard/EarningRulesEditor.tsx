"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pause, Play, History as HistoryIcon } from "lucide-react";
import { calculatePoints, describeRule, ruleConfigSchema, type LocationOverride, type RuleConfig } from "@/lib/points";

interface ProgrammeData {
  programme: { id: string; name: string; type: "points" | "stamps"; status: string };
  currentRule: RuleConfig | null;
  history: Array<{ id: string; version: number; createdAt: string; createdByName: string | null; config: RuleConfig }>;
}

/** An ISO time as the "YYYY-MM-DDTHH:mm" a date-time box wants, in the browser's own zone. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : "");

const pounds = (minor: number) => (minor / 100).toFixed(2);
const toMinor = (v: string) => Math.round(parseFloat(v || "0") * 100);

/** A money box that lets you type "1." on the way to "1.50"; reports whole pence. */
function MoneyBox({ minor, onChange, symbol, label }: { minor: number; onChange: (minor: number) => void; symbol: string; label: string }) {
  const [text, setText] = useState((minor / 100).toFixed(2));
  return (
    <span className="inline-flex items-center rounded-xl border border-zinc-300 bg-white focus-within:ring-2 focus-within:ring-evergreen">
      <span className="pl-3 text-zinc-500">{symbol}</span>
      <input
        aria-label={label}
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9.]/g, "");
          setText(v);
          onChange(Math.max(1, Math.round(parseFloat(v || "0") * 100)));
        }}
        className="w-20 min-h-[44px] bg-transparent px-2 text-base font-semibold focus:outline-none"
      />
    </span>
  );
}

interface LocationRow { id: string; name: string; status: string }

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
  const [places, setPlaces] = useState<LocationRow[]>([]);

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
    fetch("/api/v1/owner/locations", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setPlaces((j.data as LocationRow[]).filter((l) => l.status === "active")))
      .catch(() => undefined);
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
  const setWindow = (patch: Partial<RuleConfig["earningWindow"]>) => setRule({ ...rule, earningWindow: { ...rule.earningWindow, ...patch } });
  const eligible = rule.locationEligibility;
  const setEligible = (v: "all" | string[]) => setRule({ ...rule, locationEligibility: v });
  const setTiers = (patch: Partial<RuleConfig["tiers"]>) => setRule({ ...rule, tiers: { ...rule.tiers, ...patch } });
  const setMultipliers = (list: RuleConfig["multipliers"]) => setRule({ ...rule, multipliers: list });
  const setExpiry = (patch: Partial<RuleConfig["expiry"]>) => setRule({ ...rule, expiry: { ...rule.expiry, ...patch } });
  const live = data.programme.status === "published";

  // A location with no entry earns the programme-wide rate; an entry changes only the rate fields it lists
  const overrides = rule.locationOverrides ?? {};
  const setOverride = (id: string, next: LocationOverride | null) => {
    const copy = { ...overrides };
    if (next) copy[id] = next;
    else delete copy[id];
    setRule({ ...rule, locationOverrides: copy });
  };

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

          {places.length > 1 && (
            <div>
              <h3 className="font-display text-lg font-bold text-evergreen-deep">Different rate at one location</h3>
              <p className="text-sm text-zinc-600 mt-0.5">
                Switch this on for a location that should earn at its own rate. Others follow the rule above.
              </p>
              <ul className="mt-4 space-y-3">
                {places.map((l) => {
                  const o = overrides[l.id];
                  const spend = rule.earn.mode === "spend";
                  return (
                    <li key={l.id} className="rounded-2xl border border-zinc-200 p-4">
                      <label className="flex items-center gap-3 font-medium text-zinc-900 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(o)}
                          onChange={(e) =>
                            setOverride(
                              l.id,
                              e.target.checked
                                ? { earn: spend ? { pointsPerUnit: rule.earn.pointsPerUnit, unitMinor: Math.max(1, toMinor(unitPounds)) } : { pointsPerVisit: rule.earn.pointsPerVisit }, caps: {} }
                                : null
                            )
                          }
                          className="w-5 h-5 accent-evergreen"
                        />
                        {l.name}
                      </label>
                      {o && (
                        <p className="mt-3 flex flex-wrap items-center gap-2 text-zinc-800">
                          {spend ? (
                            <>
                              Give {numberField(o.earn.pointsPerUnit ?? rule.earn.pointsPerUnit, (n) => setOverride(l.id, { ...o, earn: { ...o.earn, pointsPerUnit: n } }), 1)} {unit} for every{" "}
                              <MoneyBox
                                minor={o.earn.unitMinor ?? rule.earn.unitMinor}
                                onChange={(m) => setOverride(l.id, { ...o, earn: { ...o.earn, unitMinor: m } })}
                                symbol={symbol}
                                label={`Spend per reward unit at ${l.name}`}
                              />{" "}
                              spent
                            </>
                          ) : (
                            <>
                              Give {numberField(o.earn.pointsPerVisit ?? rule.earn.pointsPerVisit, (n) => setOverride(l.id, { ...o, earn: { ...o.earn, pointsPerVisit: n } }), 1)} {unit} each time they visit
                            </>
                          )}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {places.length > 1 && (
            <div>
              <h3 className="font-display text-lg font-bold text-evergreen-deep">Where {unit} can be earned</h3>
              <label className="mt-3 flex items-center gap-3 text-zinc-800 cursor-pointer">
                <input type="radio" name="eligibility" checked={eligible === "all"} onChange={() => setEligible("all")} className="w-5 h-5 accent-evergreen" />
                At every location
              </label>
              <label className="mt-2 flex items-center gap-3 text-zinc-800 cursor-pointer">
                <input
                  type="radio"
                  name="eligibility"
                  checked={eligible !== "all"}
                  onChange={() => setEligible(places.map((p) => p.id))}
                  className="w-5 h-5 accent-evergreen"
                />
                Only at the ones I choose
              </label>
              {eligible !== "all" && (
                <ul className="mt-2 ml-8 space-y-1.5">
                  {places.map((p) => (
                    <li key={p.id}>
                      <label className="flex items-center gap-2 text-zinc-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={eligible.includes(p.id)}
                          onChange={(e) => setEligible(e.target.checked ? [...eligible, p.id] : eligible.filter((x) => x !== p.id))}
                          className="w-5 h-5 accent-evergreen"
                        />
                        {p.name}
                      </label>
                    </li>
                  ))}
                  {eligible.length === 0 && <li className="text-sm text-rose-700">Pick at least one, or {unit} can&rsquo;t be earned anywhere.</li>}
                </ul>
              )}
            </div>
          )}

          <div>
            <h3 className="font-display text-lg font-bold text-evergreen-deep">When {unit} can be earned</h3>
            <label className="mt-3 flex items-center gap-3 text-zinc-800 cursor-pointer">
              <input type="checkbox" checked={rule.earningWindow.enabled} onChange={(e) => setWindow({ enabled: e.target.checked })} className="w-5 h-5 accent-evergreen" />
              Only on certain days and hours
            </label>
            {rule.earningWindow.enabled && (
              <div className="mt-3 space-y-3 text-zinc-800">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Days">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => {
                    const on = rule.earningWindow.days.includes(i);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setWindow({ days: on ? rule.earningWindow.days.filter((x) => x !== i) : [...rule.earningWindow.days, i] })}
                        className={`min-h-[40px] px-3 rounded-full border text-sm font-semibold cursor-pointer ${on ? "border-evergreen bg-mist/60 text-evergreen-deep" : "border-zinc-300 text-zinc-600"}`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
                <p className="flex flex-wrap items-center gap-2">
                  Between
                  <input type="time" value={rule.earningWindow.from} onChange={(e) => setWindow({ from: e.target.value || "00:00" })} aria-label="From" className="min-h-[44px] rounded-xl border border-zinc-300 px-3" />
                  and
                  <input type="time" value={rule.earningWindow.to} onChange={(e) => setWindow({ to: e.target.value || "23:59" })} aria-label="To" className="min-h-[44px] rounded-xl border border-zinc-300 px-3" />
                  <span className="text-sm text-zinc-500">in your shop&rsquo;s time zone</span>
                </p>
                {rule.earningWindow.days.length === 0 && <p className="text-sm text-rose-700">Pick at least one day.</p>}
              </div>
            )}
          </div>

          <div>
            <h3 className="font-display text-lg font-bold text-evergreen-deep">Bonus offers</h3>
            <p className="text-sm text-zinc-600 mt-0.5">Earn more for a limited time, such as double {unit} on Fridays.</p>
            <ul className="mt-4 space-y-3">
              {rule.multipliers.map((m, i) => (
                <li key={m.id} className="rounded-2xl border border-zinc-200 p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-zinc-800">
                    <input
                      aria-label="Offer name"
                      value={m.label}
                      maxLength={60}
                      onChange={(e) => setMultipliers(rule.multipliers.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                      className="min-h-[44px] flex-1 min-w-[10rem] rounded-xl border border-zinc-300 px-3 focus:outline-none focus:ring-2 focus:ring-evergreen"
                    />
                    <span>earns</span>
                    {numberField(m.percent, (n) => setMultipliers(rule.multipliers.map((x, j) => (j === i ? { ...x, percent: Math.min(1000, Math.max(101, n)) } : x))), 101)}
                    <span>% of the usual {unit}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-700">
                    From
                    <input
                      type="datetime-local"
                      aria-label="Offer starts"
                      value={toLocalInput(m.startsAt)}
                      onChange={(e) => setMultipliers(rule.multipliers.map((x, j) => (j === i ? { ...x, startsAt: fromLocalInput(e.target.value) } : x)))}
                      className="min-h-[44px] rounded-xl border border-zinc-300 px-3"
                    />
                    to
                    <input
                      type="datetime-local"
                      aria-label="Offer ends"
                      value={toLocalInput(m.endsAt)}
                      onChange={(e) => setMultipliers(rule.multipliers.map((x, j) => (j === i ? { ...x, endsAt: fromLocalInput(e.target.value) } : x)))}
                      className="min-h-[44px] rounded-xl border border-zinc-300 px-3"
                    />
                    <button type="button" onClick={() => setMultipliers(rule.multipliers.filter((_, j) => j !== i))} className="ml-auto text-sm font-semibold text-rose-700 hover:underline cursor-pointer">
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                const start = new Date();
                const end = new Date(start.getTime() + 24 * 3600_000);
                setMultipliers([...rule.multipliers, { id: crypto.randomUUID().slice(0, 8), label: "Double points", percent: 200, startsAt: start.toISOString(), endsAt: end.toISOString() }]);
              }}
              disabled={rule.multipliers.length >= 20}
              className="press mt-3 min-h-[44px] px-5 rounded-full border border-zinc-300 text-sm font-semibold text-zinc-800 hover:border-evergreen cursor-pointer disabled:opacity-50"
            >
              Add a bonus offer
            </button>
          </div>

          <div>
            <h3 className="font-display text-lg font-bold text-evergreen-deep">Loyalty levels</h3>
            <label className="mt-3 flex items-center gap-3 text-zinc-800 cursor-pointer">
              <input type="checkbox" checked={rule.tiers.enabled} onChange={(e) => setTiers({ enabled: e.target.checked })} className="w-5 h-5 accent-evergreen" />
              Give regular customers levels (like Silver and Gold)
            </label>
            {rule.tiers.enabled && (
              <div className="mt-3 space-y-3 text-zinc-800">
                <p className="flex flex-wrap items-center gap-2">
                  Count {unit} earned in the last {numberField(rule.tiers.qualificationMonths, (n) => setTiers({ qualificationMonths: Math.min(36, n) }), 1)} months. A customer who earns less than a level needs drops back down.
                </p>
                <ul className="space-y-2">
                  {rule.tiers.levels.map((l, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 p-3">
                      <input
                        aria-label="Level name"
                        value={l.name}
                        maxLength={30}
                        onChange={(e) => setTiers({ levels: rule.tiers.levels.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                        className="min-h-[44px] w-32 rounded-xl border border-zinc-300 px-3 focus:outline-none focus:ring-2 focus:ring-evergreen"
                      />
                      <span>from</span>
                      {numberField(l.minPoints, (n) => setTiers({ levels: rule.tiers.levels.map((x, j) => (j === i ? { ...x, minPoints: n } : x)) }), 1)}
                      <span>{unit}, earns</span>
                      {numberField(l.earnPercent, (n) => setTiers({ levels: rule.tiers.levels.map((x, j) => (j === i ? { ...x, earnPercent: Math.min(500, n) } : x)) }), 100)}
                      <span>%</span>
                      <button type="button" onClick={() => setTiers({ levels: rule.tiers.levels.filter((_, j) => j !== i) })} className="ml-auto text-sm font-semibold text-rose-700 hover:underline cursor-pointer">
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-zinc-500">100% is the normal rate, 150% earns half as much again on every purchase.</p>
                <button
                  type="button"
                  onClick={() => setTiers({ levels: [...rule.tiers.levels, { name: "Silver", minPoints: 100, earnPercent: 110 }] })}
                  disabled={rule.tiers.levels.length >= 6}
                  className="press min-h-[44px] px-5 rounded-full border border-zinc-300 text-sm font-semibold text-zinc-800 hover:border-evergreen cursor-pointer disabled:opacity-50"
                >
                  Add a level
                </button>
              </div>
            )}
          </div>

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
              <p className="flex flex-wrap items-center gap-2">
                Give {numberField(rule.bonuses.referralPoints, (n) => setBonuses({ referralPoints: n }), 0)} {unit} to both when a friend they invite makes their first purchase
              </p>
              <p className="flex flex-wrap items-center gap-2">
                Email customers who haven&rsquo;t been back for {numberField(rule.journeys.inactivityDays, (n) => setRule({ ...rule, journeys: { ...rule.journeys, inactivityDays: Math.min(730, n) } }), 0)} days
                <span className="text-sm text-zinc-500">(0 means off; only customers who said yes to offers, once per quiet spell)</span>
              </p>
              {rule.bonuses.referralPoints > 0 && (
                <p className="flex flex-wrap items-center gap-2">
                  Reward each customer for at most {numberField(rule.bonuses.maxReferralsPerMember, (n) => setBonuses({ maxReferralsPerMember: n }), 1)} friends
                </p>
              )}
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
