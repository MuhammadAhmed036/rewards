"use client";

import React, { useCallback, useEffect, useState } from "react";
import { UsersRound } from "lucide-react";

interface Person {
  id: string;
  status: "active" | "invited";
  label: string;
  isYou: boolean;
  canRemove: boolean;
}

interface Household {
  role: "owner" | "member";
  max: number;
  owner: { name: string };
  people: Person[];
}

/**
 * Household card (FR-029): share one card and one points balance with a few people, each signing in as themselves.
 * Joining is the invited person's own choice, and either side can stop at any time.
 */
export function HouseholdCard({ membershipId, tenantId, unit = "points" }: { membershipId: string; tenantId: string; unit?: string }) {
  const [data, setData] = useState<Household | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/customer/household?membershipId=${membershipId}`, { cache: "no-store" });
    if (res.ok) setData((await res.json()).data);
  }, [membershipId]);

  useEffect(() => {
    load();
  }, [load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/customer/household", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify({ membershipId, email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Couldn't send the invitation.");
      setNotice(`We emailed ${json.data.email}. They can join from the link in it for 7 days.`);
      setEmail("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the invitation.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: Person) => {
    const question = p.isYou
      ? "Leave this shared card? You will no longer see its points."
      : p.status === "invited"
        ? "Cancel this invitation?"
        : `Stop sharing the card with ${p.label}? The card's code changes, so any saved copy of it stops working.`;
    if (!confirm(question)) return;
    const res = await fetch(`/api/v1/customer/household?id=${p.id}`, { method: "DELETE", headers: { "x-tenant-id": tenantId } });
    if (res.ok && p.isYou) {
      window.location.reload();
      return;
    }
    load();
  };

  if (!data) return null;
  const room = data.people.length + 1 < data.max;

  return (
    <section className="bg-white rounded-3xl border border-zinc-200 p-5 sm:p-7">
      <h3 className="font-display text-lg font-bold text-evergreen-deep flex items-center gap-2">
        <UsersRound className="h-5 w-5 text-evergreen" />
        {data.role === "owner" ? "Share this card" : `Shared with ${data.owner.name}`}
      </h3>
      <p className="text-sm text-zinc-600 mt-1">
        {data.role === "owner"
          ? `Family or housemates can use this card too. You all see and add to the same ${unit}, and each of you signs in as yourself.`
          : `You and ${data.owner.name} use the same card and the same ${unit}.`}
      </p>

      {data.people.length > 0 && (
        <ul className="mt-4 divide-y divide-zinc-100">
          {data.people.map((p) => (
            <li key={p.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900 truncate">
                  {p.label}
                  {p.isYou && <span className="ml-1 text-zinc-500 font-normal">(you)</span>}
                </p>
                <p className="text-xs text-zinc-500">{p.status === "invited" ? "Invitation sent, waiting for them" : "Shares this card"}</p>
              </div>
              {p.canRemove && (
                <button
                  type="button"
                  onClick={() => remove(p)}
                  className="text-xs font-semibold text-rose-700 hover:underline cursor-pointer shrink-0"
                >
                  {p.isYou ? "Leave" : p.status === "invited" ? "Cancel" : "Remove"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {data.role === "owner" &&
        (room ? (
          <form onSubmit={invite} className="mt-4 flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              required
              placeholder="Their email address"
              aria-label="Their email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 min-h-[44px] rounded-xl border border-zinc-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen"
            />
            <button
              type="submit"
              disabled={busy}
              className="min-h-[44px] px-5 rounded-full bg-evergreen text-white text-sm font-semibold hover:bg-evergreen-deep cursor-pointer disabled:opacity-50"
            >
              {busy ? "Sending..." : "Invite"}
            </button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">This card is shared by the most people allowed ({data.max}).</p>
        ))}
      {data.role === "owner" && (
        <p className="mt-2 text-xs text-zinc-500">
          They need to have no card of their own at this shop. They choose to join from the email we send, and either of you can stop sharing at any time.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
      {notice && <p className="mt-2 rounded-2xl bg-mist text-evergreen-deep text-sm px-4 py-2.5">{notice}</p>}
    </section>
  );
}
