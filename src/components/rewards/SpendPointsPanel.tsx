"use client";
import { isOffline, networkAwareMessage, OFFLINE_MESSAGE } from "@/lib/use-online";

import React, { useEffect, useState } from "react";
import { CheckCircle2, Gift, ShoppingBag } from "lucide-react";
import { countLabel, formatPrice, loadMenuProducts, loadPointsRewards, type MenuProduct, type PointsReward, type PointsUnit } from "./types";

export interface SpendResult {
  title: string;
  pointsDeducted: number;
  newBalance: number;
}

interface Pending {
  key: string;
  label: string;
  cost: number;
  body: Record<string, unknown>;
}

/**
 * Used at the counter by staff and the owner: spend a customer's points on something from the
 * points menu, or on any other menu item for points they choose.
 */
export function SpendPointsPanel({
  membershipId,
  customerName,
  balance,
  locationId,
  unit = "points",
  onSpent,
}: {
  membershipId: string;
  customerName: string;
  balance: number;
  locationId?: string;
  unit?: PointsUnit;
  onSpent?: (result: SpendResult) => void;
}) {
  const [rewards, setRewards] = useState<PointsReward[]>([]);
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [productId, setProductId] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [customCost, setCustomCost] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<SpendResult | null>(null);

  useEffect(() => {
    Promise.all([loadPointsRewards(), loadMenuProducts()]).then(([r, p]) => {
      setRewards(r.filter((x) => x.status === "active"));
      setProducts(p);
    });
  }, []);

  const ask = (label: string, cost: number, body: Record<string, unknown>) => {
    setError(null);
    setDone(null);
    // One key per confirmation, so a double tap can never take the points twice
    setPending({ key: crypto.randomUUID(), label, cost, body });
  };

  const confirm = async () => {
    if (!pending) return;
    if (isOffline()) {
      setError(OFFLINE_MESSAGE);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/business/members/${membershipId}/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": pending.key },
        body: JSON.stringify({ ...pending.body, locationId: locationId || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Couldn't use the points.");
      setDone(json.data);
      setPending(null);
      setProductId("");
      setCustomTitle("");
      setCustomCost("");
      setNote("");
      onSpent?.(json.data);
    } catch (err) {
      setError(networkAwareMessage(err, "Couldn't use the points."));
    } finally {
      setBusy(false);
    }
  };

  const chosenProduct = products.find((p) => p.id === productId);
  const customName = customTitle.trim() || (chosenProduct ? `Free ${chosenProduct.name}` : "");
  const cost = parseInt(customCost, 10);
  const customReady = customName && Number.isInteger(cost) && cost > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-semibold text-zinc-900 flex items-center gap-2">
          <Gift className="w-4 h-4 text-evergreen" />
          Use {customerName}&rsquo;s {unit}
        </h4>
        <span className="text-sm text-zinc-600 shrink-0">
          Has <strong className="text-zinc-900 tabular-nums">{balance}</strong> {unit}
        </span>
      </div>

      {done && (
        <p className="rounded-2xl bg-mist text-evergreen-deep text-sm px-4 py-3 flex gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Done — hand over <strong>{done.title}</strong>. {countLabel(done.pointsDeducted, unit)} taken, {done.newBalance} left.
          </span>
        </p>
      )}

      {pending && (
        <div className="rounded-2xl border-2 border-evergreen bg-white p-4 space-y-3" role="alertdialog" aria-live="polite">
          <p className="text-sm text-zinc-800">
            Give <strong>{pending.label}</strong> and take <strong>{countLabel(pending.cost, unit)}</strong>? They&rsquo;ll have{" "}
            {balance - pending.cost} left.
          </p>
          {error && <p className="text-sm text-rose-700">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="min-h-[44px] px-5 rounded-full bg-evergreen text-white text-sm font-semibold hover:bg-evergreen-deep cursor-pointer disabled:opacity-50"
            >
              {busy ? "Saving..." : `Yes, take ${countLabel(pending.cost, unit)}`}
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              disabled={busy}
              className="min-h-[44px] px-5 rounded-full border border-zinc-300 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* From the points menu */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">On the points menu</p>
        {rewards.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing on the points menu yet. You can still give an item below.</p>
        ) : (
          <ul className="space-y-2">
            {rewards.map((r) => {
              const enough = balance >= r.costPoints;
              const pct = Math.min(100, Math.round((balance / r.costPoints) * 100));
              return (
                <li key={r.id} className="rounded-2xl border border-zinc-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-zinc-900 truncate">{r.title}</p>
                      <p className="text-xs text-zinc-500">
                        {countLabel(r.costPoints, unit)}
                        {enough ? "" : ` · needs ${r.costPoints - balance} more`}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!enough || busy}
                      onClick={() => ask(r.title, r.costPoints, { rewardId: r.id })}
                      className="min-h-[40px] px-4 rounded-full bg-evergreen text-white text-sm font-semibold hover:bg-evergreen-deep cursor-pointer disabled:bg-zinc-200 disabled:text-zinc-500 disabled:cursor-not-allowed shrink-0"
                    >
                      Give
                    </button>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-zinc-100 overflow-hidden" aria-hidden="true">
                    <div className={`h-full rounded-full ${enough ? "bg-evergreen" : "bg-marigold"}`} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Anything else from the menu */}
      <form
        className="rounded-2xl bg-zinc-50 border border-zinc-200 p-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!customReady) return setError("Pick an item (or type one) and enter the points to take.");
          if (cost > balance) return setError(`They only have ${balance} ${unit}.`);
          ask(customName, cost, {
            productId: productId || undefined,
            title: customTitle.trim() || undefined,
            costPoints: cost,
            note: note.trim() || undefined,
          });
        }}
      >
        <p className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-evergreen" />
          Give something else for {unit}
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-zinc-700">From your menu</span>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="mt-1 w-full min-h-[44px] rounded-xl border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen"
            >
              <option value="">Choose an item...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {formatPrice(p.priceMinor)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-zinc-700">{unit === "stamps" ? "Stamps" : "Points"} to take</span>
            <input
              type="number"
              min={1}
              max={balance || undefined}
              inputMode="numeric"
              placeholder="e.g. 50"
              value={customCost}
              onChange={(e) => setCustomCost(e.target.value)}
              className="mt-1 w-full min-h-[44px] rounded-xl border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen"
            />
          </label>
        </div>
        {!productId && (
          <label className="block text-sm">
            <span className="text-zinc-700">Or type what you&rsquo;re giving</span>
            <input
              type="text"
              maxLength={200}
              placeholder="e.g. Free cookie"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              className="mt-1 w-full min-h-[44px] rounded-xl border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen"
            />
          </label>
        )}
        <label className="block text-sm">
          <span className="text-zinc-700">
            Note <span className="text-zinc-500">(optional)</span>
          </span>
          <input
            type="text"
            maxLength={300}
            placeholder="e.g. Birthday treat"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full min-h-[44px] rounded-xl border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen"
          />
        </label>
        {error && !pending && <p className="text-sm text-rose-700">{error}</p>}
        <button
          type="submit"
          disabled={busy || !!pending}
          className="w-full sm:w-auto min-h-[44px] px-5 rounded-full border-2 border-evergreen text-evergreen-deep text-sm font-semibold hover:bg-mist cursor-pointer disabled:opacity-50"
        >
          {customReady ? `Give ${customName} for ${countLabel(cost, unit)}` : `Give for ${unit}`}
        </button>
      </form>
    </div>
  );
}
