"use client";

import React from "react";
import { Gift } from "lucide-react";
import type { PointsUnit } from "./types";

export interface CustomerReward {
  id: string;
  title: string;
  costPoints: number;
  eligible: boolean;
  pointsShortfall: number;
  description?: string | null;
  productName?: string | null;
}

/**
 * What a customer can get with their points, cheapest first, each with how close they are.
 * Signed-out visitors (balance undefined) just see the menu and prices.
 */
export function PointsMenu({
  rewards,
  balance,
  unit = "points",
  onClaim,
}: {
  rewards: CustomerReward[];
  balance?: number;
  unit?: PointsUnit;
  onClaim?: (reward: CustomerReward) => void;
}) {
  const next = balance === undefined ? undefined : rewards.find((r) => !r.eligible);

  return (
    <section className="bg-white rounded-3xl border border-zinc-200 p-5 sm:p-7">
      <div className="flex items-start justify-between gap-3 border-b border-zinc-100 pb-4">
        <div>
          <h3 className="font-display text-lg font-bold text-evergreen-deep flex items-center gap-2">
            <Gift className="h-5 w-5 text-evergreen" />
            Points menu
          </h3>
          <p className="text-sm text-zinc-600 mt-0.5">What your {unit} can get you here.</p>
        </div>
        {balance !== undefined && (
          <div className="text-right shrink-0">
            <p className="font-display text-2xl font-bold text-zinc-900 tabular-nums leading-none">{balance}</p>
            <p className="text-xs text-zinc-500 mt-1">your {unit}</p>
          </div>
        )}
      </div>

      {rewards.length === 0 ? (
        <div className="py-10 text-center">
          <Gift className="w-8 h-8 text-zinc-300 mx-auto" />
          <p className="mt-2 text-sm font-semibold text-zinc-700">No rewards on the menu yet.</p>
          <p className="text-sm text-zinc-500">Keep collecting — the shop will add some soon.</p>
        </div>
      ) : (
        <>
          {next && balance !== undefined && (
            <p className="mt-4 rounded-2xl bg-marigold/25 text-zinc-900 text-sm px-4 py-3">
              <strong>{next.pointsShortfall}</strong> more {next.pointsShortfall === 1 ? unit.slice(0, -1) : unit} and you get{" "}
              <strong>{next.title}</strong>.
            </p>
          )}
          <ul className="mt-4 space-y-3">
            {rewards.map((r) => {
              const pct = balance === undefined ? 0 : Math.min(100, Math.round((balance / r.costPoints) * 100));
              return (
                <li
                  key={r.id}
                  className={`rounded-2xl border p-4 ${r.eligible && balance !== undefined ? "border-evergreen bg-mist/60" : "border-zinc-200"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-zinc-900">{r.title}</p>
                      {r.description && <p className="text-sm text-zinc-500 mt-0.5">{r.description}</p>}
                    </div>
                    <span className="shrink-0 rounded-full bg-zinc-900 text-white text-xs font-semibold px-2.5 py-1 tabular-nums">
                      {r.costPoints} {unit === "stamps" ? "stamps" : "pts"}
                    </span>
                  </div>

                  {balance !== undefined && (
                    <>
                      <div
                        className="mt-3 h-2 rounded-full bg-zinc-100 overflow-hidden"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={r.costPoints}
                        aria-valuenow={Math.min(balance, r.costPoints)}
                        aria-label={`${r.title} progress`}
                      >
                        <div
                          className={`h-full rounded-full transition-[width] duration-500 ${r.eligible ? "bg-evergreen" : "bg-marigold"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <p className="text-sm text-zinc-600 tabular-nums">
                          {r.eligible ? (
                            <span className="font-semibold text-evergreen-deep">Ready to claim</span>
                          ) : (
                            <>
                              {balance} / {r.costPoints} · <strong className="text-zinc-900">{r.pointsShortfall} to go</strong>
                            </>
                          )}
                        </p>
                        {r.eligible && onClaim && (
                          <button
                            type="button"
                            onClick={() => onClaim(r)}
                            className="min-h-[40px] px-4 rounded-full bg-evergreen text-white text-sm font-semibold hover:bg-evergreen-deep cursor-pointer shrink-0"
                          >
                            Claim
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {balance !== undefined && (
            <p className="mt-4 text-xs text-zinc-500">
              Tap Claim and show the code at the counter, or just ask the staff — they can use your {unit} for you.
            </p>
          )}
        </>
      )}
    </section>
  );
}
