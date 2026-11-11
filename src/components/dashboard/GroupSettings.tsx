"use client";

import React, { useCallback, useEffect, useState } from "react";

interface Brand {
  id: string;
  name: string;
  isYours: boolean;
}
interface Figures extends Brand {
  members: number;
  newMembers: number;
  buyers: number;
  purchases: number;
  pointsAwarded: number;
  redemptions: number;
  outstandingPoints: number;
}
interface Group {
  inGroup: boolean;
  name?: string;
  isOwner?: boolean;
  brands?: Brand[];
  joinCode?: string | null;
  report?: {
    days: number;
    brands: Figures[];
    totals: { members: number; newMembers: number; purchases: number; pointsAwarded: number; redemptions: number; outstandingPoints: number };
  } | null;
}

const field = "w-full min-h-[44px] rounded-xl border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen";
const button = "min-h-[44px] px-5 rounded-full bg-evergreen text-white text-sm font-semibold hover:bg-evergreen-deep cursor-pointer disabled:opacity-50";

/**
 * A group of brands (FR-015). Brands keep their own customers and points; the group's owner only gets
 * combined counts for each brand, and any brand can leave at any time.
 */
export function GroupSettings() {
  const [group, setGroup] = useState<Group | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/v1/owner/group", { cache: "no-store" });
    if (res.ok) setGroup((await res.json()).data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/owner/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Couldn't do that.");
      setName("");
      setCode("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't do that.");
    } finally {
      setBusy(false);
    }
  };

  if (!group) return null;

  return (
    <section className="mt-6 rounded-3xl bg-white border border-zinc-200 p-5 sm:p-7">
      <h3 className="font-display text-xl font-bold text-evergreen-deep">Group of businesses</h3>
      <p className="text-sm text-zinc-600 mt-1">
        For an owner with several brands that are separate businesses here. Each keeps its own customers, points and staff. The group&rsquo;s
        owner sees combined totals for each brand, never a customer&rsquo;s name, email or points balance.
      </p>

      {!group.inGroup && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act({ action: "create", name });
            }}
            className="rounded-2xl border border-zinc-200 p-4 space-y-3"
          >
            <p className="font-semibold text-zinc-900">Start a group</p>
            <input className={field} placeholder="Group name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} aria-label="Group name" />
            <button type="submit" disabled={busy || name.trim().length < 2} className={button}>
              Start group
            </button>
          </form>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act({ action: "join", code });
            }}
            className="rounded-2xl border border-zinc-200 p-4 space-y-3"
          >
            <p className="font-semibold text-zinc-900">Join a group</p>
            <input
              className={`${field} uppercase tracking-widest`}
              placeholder="Group code"
              maxLength={32}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-label="Group code"
            />
            <p className="text-xs text-zinc-500">The group&rsquo;s owner will see this business&rsquo;s totals. You can leave at any time.</p>
            <button type="submit" disabled={busy || code.trim().length < 4} className={button}>
              Join group
            </button>
          </form>
        </div>
      )}

      {group.inGroup && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-zinc-800">
            This business is in <strong>{group.name}</strong>
            {group.isOwner ? ", which you own." : ". The group's owner can see your totals, not your customers."}
          </p>

          {group.isOwner && group.joinCode && (
            <div className="rounded-2xl bg-zinc-50 border border-zinc-200 p-4">
              <p className="text-sm font-medium text-zinc-800">Code for other businesses to join</p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-evergreen-deep select-all">{group.joinCode}</p>
              <p className="text-xs text-zinc-500 mt-1">
                Give it only to people you trust to run a business in your group. Anyone who has it can add their business.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => act({ action: "new_code" }, "Make a new code? The old one stops working. Businesses already in the group stay.")}
                className="mt-2 text-sm font-semibold text-evergreen-deep hover:underline cursor-pointer"
              >
                Make a new code
              </button>
            </div>
          )}

          {group.isOwner && group.report ? (
            <div className="overflow-x-auto">
              <p className="text-sm font-semibold text-zinc-900">Last {group.report.days} days</p>
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-zinc-500">
                    <th className="py-2 pr-3 font-medium">Business</th>
                    <th className="py-2 pr-3 font-medium text-right">Members</th>
                    <th className="py-2 pr-3 font-medium text-right">New</th>
                    <th className="py-2 pr-3 font-medium text-right">Customers who bought</th>
                    <th className="py-2 pr-3 font-medium text-right">Purchases</th>
                    <th className="py-2 pr-3 font-medium text-right">Points given</th>
                    <th className="py-2 pr-3 font-medium text-right">Rewards used</th>
                    <th className="py-2 pr-3 font-medium text-right">Points held</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 tabular-nums">
                  {group.report.brands.map((b) => (
                    <tr key={b.id}>
                      <td className="py-2.5 pr-3 font-semibold text-zinc-900">
                        {b.name}
                        {b.isYours && <span className="ml-1 font-normal text-zinc-500">(yours)</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-right">{b.members}</td>
                      <td className="py-2.5 pr-3 text-right">{b.newMembers}</td>
                      <td className="py-2.5 pr-3 text-right">{b.buyers}</td>
                      <td className="py-2.5 pr-3 text-right">{b.purchases}</td>
                      <td className="py-2.5 pr-3 text-right">{b.pointsAwarded}</td>
                      <td className="py-2.5 pr-3 text-right">{b.redemptions}</td>
                      <td className="py-2.5 pr-3 text-right">{b.outstandingPoints}</td>
                      <td className="py-2.5 text-right">
                        {!b.isYours && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => act({ action: "remove", tenantId: b.id }, `Remove ${b.name} from the group?`)}
                            className="text-xs font-semibold text-rose-700 hover:underline cursor-pointer"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold text-zinc-900">
                    <td className="py-2.5 pr-3">All businesses</td>
                    <td className="py-2.5 pr-3 text-right">{group.report.totals.members}</td>
                    <td className="py-2.5 pr-3 text-right">{group.report.totals.newMembers}</td>
                    <td className="py-2.5 pr-3 text-right text-zinc-400" title="A customer can use several brands, so adding these up would count them twice">
                      n/a
                    </td>
                    <td className="py-2.5 pr-3 text-right">{group.report.totals.purchases}</td>
                    <td className="py-2.5 pr-3 text-right">{group.report.totals.pointsAwarded}</td>
                    <td className="py-2.5 pr-3 text-right">{group.report.totals.redemptions}</td>
                    <td className="py-2.5 pr-3 text-right">{group.report.totals.outstandingPoints}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-xs text-zinc-500">
                Points are counted per business and are not shared between brands. Money isn&rsquo;t added up because brands can use different currencies.
              </p>
            </div>
          ) : (
            <ul className="text-sm text-zinc-700 list-disc pl-5">
              {group.brands?.map((b) => (
                <li key={b.id}>
                  {b.name}
                  {b.isYours ? " (you)" : ""}
                </li>
              ))}
            </ul>
          )}

          <div>
            {group.isOwner ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => act({ action: "disband" }, "Remove the group? Every business goes back to being on its own. Nobody's customers or points change.")}
                className="text-sm font-semibold text-rose-700 hover:underline cursor-pointer"
              >
                Remove the group
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => act({ action: "leave" }, "Leave this group? Its owner will stop seeing your totals.")}
                className="text-sm font-semibold text-rose-700 hover:underline cursor-pointer"
              >
                Leave the group
              </button>
            )}
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
    </section>
  );
}
