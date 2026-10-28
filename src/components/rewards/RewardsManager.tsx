"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Gift, Pencil, Plus, Trash2, X } from "lucide-react";
import { countLabel, formatPrice, loadMenuProducts, loadPointsRewards, type MenuProduct, type PointsReward, type PointsUnit } from "./types";

interface Draft {
  id: string | null;
  productId: string;
  title: string;
  titleEdited: boolean;
  costPoints: string;
  description: string;
}

const emptyDraft: Draft = { id: null, productId: "", title: "", titleEdited: false, costPoints: "100", description: "" };

/**
 * The points menu: "100 points = free tea". Owners and staff pick an item from their menu and set
 * how many points it costs; customers then see it with a progress bar on their card.
 */
export function RewardsManager({
  unit = "points",
  startWithProductId,
  onStarted,
  onChanged,
}: {
  unit?: PointsUnit;
  /** Opens the form with this menu item already chosen (e.g. from the products table). */
  startWithProductId?: string | null;
  onStarted?: () => void;
  /** Called after anything on the list changes, so a parent can refresh its own counts. */
  onChanged?: () => void;
}) {
  const [rewards, setRewards] = useState<PointsReward[]>([]);
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [r, p] = await Promise.all([loadPointsRewards(), loadMenuProducts()]);
    setRewards(r.filter((x) => x.status !== "archived"));
    setProducts(p);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = () => {
    load();
    onChanged?.();
  };

  useEffect(() => {
    if (!startWithProductId || !loaded) return;
    const product = products.find((p) => p.id === startWithProductId);
    setDraft({ ...emptyDraft, productId: startWithProductId, title: product ? `Free ${product.name}` : "" });
    onStarted?.();
  }, [startWithProductId, loaded, products, onStarted]);

  const pickProduct = (productId: string) => {
    if (!draft) return;
    const product = products.find((p) => p.id === productId);
    setDraft({
      ...draft,
      productId,
      title: draft.titleEdited ? draft.title : product ? `Free ${product.name}` : "",
    });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const cost = parseInt(draft.costPoints, 10);
    if (!draft.title.trim()) return setError("Pick a menu item or type a name for this reward.");
    if (!Number.isInteger(cost) || cost < 1) return setError(`Enter how many ${unit} it costs (1 or more).`);

    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: draft.title.trim(),
        costPoints: cost,
        description: draft.description.trim() || undefined,
        productId: draft.productId || (draft.id ? null : undefined),
        type: "free_item",
      };
      const res = await fetch("/api/v1/business/rewards", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft.id ? { id: draft.id, ...payload } : payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Couldn't save this reward.");
      setNotice(`${payload.title} — ${countLabel(cost, unit)}. Customers can see it now.`);
      setDraft(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this reward.");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (reward: PointsReward, status: "active" | "paused") => {
    const res = await fetch("/api/v1/business/rewards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: reward.id, status }),
    });
    if (res.ok) {
      setNotice(status === "paused" ? `${reward.title} is hidden from customers.` : `${reward.title} is live again.`);
      refresh();
    }
  };

  const remove = async (reward: PointsReward) => {
    if (!confirm(`Remove "${reward.title}" from the points menu? Customers will no longer see it.`)) return;
    const res = await fetch(`/api/v1/business/rewards?id=${reward.id}`, { method: "DELETE" });
    if (res.ok) {
      setNotice(`${reward.title} was removed.`);
      refresh();
    }
  };

  return (
    <section className="rounded-3xl border border-zinc-200 bg-white overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-bold text-evergreen-deep flex items-center gap-2">
            <Gift className="w-5 h-5 text-evergreen" />
            Points menu
          </h3>
          <p className="text-sm text-zinc-600 mt-0.5">
            Pick something from your menu and set the {unit} it costs. Customers watch their {unit} add up towards it.
          </p>
        </div>
        {!draft && (
          <button
            type="button"
            onClick={() => {
              setDraft({ ...emptyDraft });
              setError(null);
              setNotice(null);
            }}
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 rounded-full bg-evergreen text-white text-sm font-semibold hover:bg-evergreen-deep cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add to points menu
          </button>
        )}
      </div>

      {notice && !draft && (
        <p className="mx-5 sm:mx-6 mt-4 rounded-2xl bg-mist text-evergreen-deep text-sm px-4 py-2.5">{notice}</p>
      )}

      {draft && (
        <form onSubmit={save} className="m-5 sm:m-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-zinc-900">{draft.id ? "Edit reward" : "New reward"}</p>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="p-1.5 rounded-full hover:bg-zinc-200 cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-sm">
              <span className="font-medium text-zinc-800">Item from your menu</span>
              <select
                value={draft.productId}
                onChange={(e) => pickProduct(e.target.value)}
                className="mt-1 w-full min-h-[44px] rounded-xl border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen"
              >
                <option value="">— Not on the menu —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {formatPrice(p.priceMinor)}
                  </option>
                ))}
              </select>
              {products.length === 0 && (
                <span className="block text-xs text-zinc-500 mt-1">
                  Your menu is empty. Add products first, or just type a name below.
                </span>
              )}
            </label>

            <label className="block text-sm">
              <span className="font-medium text-zinc-800">{unit === "stamps" ? "Stamps" : "Points"} needed</span>
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={draft.costPoints}
                onChange={(e) => setDraft({ ...draft, costPoints: e.target.value })}
                className="mt-1 w-full min-h-[44px] rounded-xl border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="font-medium text-zinc-800">What customers see</span>
            <input
              type="text"
              maxLength={255}
              placeholder="e.g. Free Tea"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value, titleEdited: true })}
              className="mt-1 w-full min-h-[44px] rounded-xl border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-zinc-800">
              Note for customers <span className="text-zinc-500 font-normal">(optional)</span>
            </span>
            <input
              type="text"
              maxLength={200}
              placeholder="e.g. Any size, hot or iced"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className="mt-1 w-full min-h-[44px] rounded-xl border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen"
            />
          </label>

          {draft.title.trim() && parseInt(draft.costPoints, 10) > 0 && (
            <p className="text-sm text-zinc-700">
              Customers will see: <strong>{draft.title.trim()}</strong> for{" "}
              <strong>{countLabel(parseInt(draft.costPoints, 10), unit)}</strong>
              .
            </p>
          )}
          {error && <p className="text-sm text-rose-700">{error}</p>}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] px-5 rounded-full bg-evergreen text-white text-sm font-semibold hover:bg-evergreen-deep cursor-pointer disabled:opacity-50"
            >
              {saving ? "Saving..." : draft.id ? "Save changes" : "Add reward"}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="min-h-[44px] px-5 rounded-full border border-zinc-300 text-sm font-semibold text-zinc-700 hover:bg-white cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="p-5 sm:p-6 pt-4">
        {!loaded ? (
          <p className="text-sm text-zinc-500">Loading...</p>
        ) : rewards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center">
            <Gift className="w-8 h-8 text-zinc-300 mx-auto" />
            <p className="mt-2 font-semibold text-zinc-800">Nothing on the points menu yet</p>
            <p className="text-sm text-zinc-500 mt-1">For example: Free Tea for 100 {unit}.</p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {rewards.map((r) => (
              <li key={r.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-14 h-14 rounded-2xl bg-mist text-evergreen-deep flex flex-col items-center justify-center shrink-0">
                    <span className="font-display font-bold text-lg leading-none tabular-nums">{r.costPoints}</span>
                    <span className="text-[10px] uppercase tracking-wide">{unit === "stamps" ? "stamps" : "pts"}</span>
                  </div>
                  <div className="min-w-0">
                    <p className={`font-semibold truncate ${r.status === "active" ? "text-zinc-900" : "text-zinc-500"}`}>
                      {r.title}
                      {r.status === "paused" && (
                        <span className="ml-2 text-xs font-semibold text-amber-800 bg-marigold/30 rounded-full px-2 py-0.5">
                          Hidden
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-zinc-500 truncate">
                      {r.productName ? `Menu item: ${r.productName}` : "Not linked to a menu item"}
                      {" · "}
                      Given {r.quantityRedeemed ?? 0} time{r.quantityRedeemed === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setDraft({
                        id: r.id,
                        productId: r.productId ?? "",
                        title: r.title,
                        titleEdited: true,
                        costPoints: String(r.costPoints),
                        description: r.description ?? "",
                      });
                      setError(null);
                    }}
                    className="inline-flex items-center gap-1 min-h-[36px] px-3 rounded-full border border-zinc-300 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus(r, r.status === "active" ? "paused" : "active")}
                    className="inline-flex items-center gap-1 min-h-[36px] px-3 rounded-full border border-zinc-300 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                  >
                    {r.status === "active" ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {r.status === "active" ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(r)}
                    className="inline-flex items-center gap-1 min-h-[36px] px-3 rounded-full border border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer"
                    aria-label={`Remove ${r.title}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
