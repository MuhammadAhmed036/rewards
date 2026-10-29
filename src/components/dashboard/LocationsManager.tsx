"use client";

import React, { useCallback, useEffect, useState } from "react";
import { MapPin, Plus, X } from "lucide-react";

interface LocationRow {
  id: string;
  name: string;
  address: { line?: string } | null;
  timezone: string | null;
  status: "active" | "closed" | string;
  staffCount: number;
}

interface StaffRow {
  id: string;
  name: string | null;
  email: string;
  role: string;
  status: string;
  locations: Array<{ id: string; name: string }>;
}

const inputClass =
  "w-full min-h-[44px] rounded-xl border border-zinc-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen";

/**
 * Branches of the business, and which staff can work at each. Staff with no locations ticked can work
 * at all of them; points can only be given at open locations.
 */
export function LocationsManager() {
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [draft, setDraft] = useState<{ id: string | null; name: string; addressLine: string; timezone: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [l, t] = await Promise.all([
      fetch("/api/v1/owner/locations", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { data: [] })),
      fetch("/api/v1/owner/team", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { data: [] })),
    ]);
    setLocations(l.data ?? []);
    setStaff((t.data ?? []).filter((s: StaffRow) => s.role !== "owner" && s.status === "active"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/owner/locations", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name,
          addressLine: draft.addressLine,
          ...(draft.id && draft.timezone ? { timezone: draft.timezone } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Couldn't save the location.");
      setNotice(draft.id ? `${draft.name} was updated.` : `${draft.name} was added. Staff can pick it in the scanner now.`);
      setDraft(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the location.");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (loc: LocationRow, status: "active" | "closed") => {
    if (status === "closed" && !confirm(`Close ${loc.name}? Staff won't be able to add points there until you reopen it.`)) return;
    setError(null);
    const res = await fetch("/api/v1/owner/locations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: loc.id, status }),
    });
    const json = await res.json();
    if (!res.ok) return setError(json.error?.message || "Couldn't change the location.");
    setNotice(status === "closed" ? `${loc.name} is closed.` : `${loc.name} is open again.`);
    load();
  };

  const toggleStaffLocation = async (person: StaffRow, locationId: string) => {
    const current = person.locations.map((l) => l.id);
    const next = current.includes(locationId) ? current.filter((id) => id !== locationId) : [...current, locationId];
    setError(null);
    const res = await fetch("/api/v1/owner/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffMemberId: person.id, locationIds: next }),
    });
    const json = await res.json();
    if (!res.ok) return setError(json.error?.message || "Couldn't update where they work.");
    load();
  };

  const open = locations.filter((l) => l.status === "active");

  return (
    <div className="space-y-6">
      {error && <p className="rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm px-4 py-3">{error}</p>}
      {notice && !error && <p className="pop-in rounded-2xl bg-mist text-evergreen-deep text-sm px-4 py-3">{notice}</p>}

      <section className="rounded-3xl bg-white border border-zinc-200 p-5 sm:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-bold text-evergreen-deep">Your locations</h3>
            <p className="text-sm text-zinc-600 mt-0.5">Customers can earn and spend points at any open location.</p>
          </div>
          {!draft && (
            <button
              onClick={() => {
                setDraft({ id: null, name: "", addressLine: "", timezone: "" });
                setNotice(null);
              }}
              className="press inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-full bg-evergreen text-white text-sm font-semibold hover:bg-evergreen-deep cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              Add a location
            </button>
          )}
        </div>

        {draft && (
          <form onSubmit={save} className="pop-in mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-zinc-900">{draft.id ? "Edit location" : "New location"}</p>
              <button type="button" onClick={() => setDraft(null)} className="p-1.5 rounded-full hover:bg-zinc-200 cursor-pointer" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block text-sm">
                <span className="font-medium text-zinc-800">Name</span>
                <input
                  required
                  maxLength={120}
                  placeholder="e.g. High Street"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-zinc-800">
                  Address <span className="text-zinc-500 font-normal">(optional)</span>
                </span>
                <input
                  maxLength={300}
                  placeholder="12 High Street, Leeds LS1 2AB"
                  value={draft.addressLine}
                  onChange={(e) => setDraft({ ...draft, addressLine: e.target.value })}
                  className={`${inputClass} mt-1`}
                />
              </label>
            </div>
            {draft.id && (
              <label className="block text-sm max-w-xs">
                <span className="font-medium text-zinc-800">
                  Time zone <span className="text-zinc-500 font-normal">(only if different from the business)</span>
                </span>
                <input
                  placeholder="e.g. Europe/London"
                  value={draft.timezone}
                  onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
                  className={`${inputClass} mt-1`}
                />
              </label>
            )}
            <button
              type="submit"
              disabled={busy}
              className="press min-h-[44px] px-5 rounded-full bg-evergreen text-white text-sm font-semibold hover:bg-evergreen-deep cursor-pointer disabled:opacity-50"
            >
              {busy ? "Saving..." : draft.id ? "Save changes" : "Add location"}
            </button>
          </form>
        )}

        <ul className="mt-5 divide-y divide-zinc-100">
          {locations.map((loc) => (
            <li key={loc.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${loc.status === "active" ? "bg-mist text-evergreen" : "bg-zinc-100 text-zinc-400"}`}>
                  <MapPin className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className={`font-semibold truncate ${loc.status === "active" ? "text-zinc-900" : "text-zinc-500"}`}>
                    {loc.name}
                    {loc.status !== "active" && <span className="ml-2 text-xs font-semibold text-zinc-600 bg-zinc-100 rounded-full px-2 py-0.5">Closed</span>}
                  </p>
                  <p className="text-sm text-zinc-500 truncate">
                    {loc.address?.line || "No address added"}
                    {loc.staffCount > 0 ? `, ${loc.staffCount} staff tied to it` : ""}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setDraft({ id: loc.id, name: loc.name, addressLine: loc.address?.line ?? "", timezone: loc.timezone ?? "" })}
                  className="press min-h-[36px] px-3 rounded-full border border-zinc-300 text-xs font-semibold text-zinc-700 hover:border-evergreen cursor-pointer"
                >
                  Edit
                </button>
                <button
                  onClick={() => setStatus(loc, loc.status === "active" ? "closed" : "active")}
                  className="press min-h-[36px] px-3 rounded-full border border-zinc-300 text-xs font-semibold text-zinc-700 hover:border-evergreen cursor-pointer"
                >
                  {loc.status === "active" ? "Close" : "Reopen"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-3xl bg-white border border-zinc-200 p-5 sm:p-7">
        <h3 className="font-display text-xl font-bold text-evergreen-deep">Who works where</h3>
        <p className="text-sm text-zinc-600 mt-0.5">
          Tick the locations each person can use. Leave everything unticked and they can work at all of them.
        </p>
        {staff.length === 0 ? (
          <p className="mt-5 text-sm text-zinc-500">No staff yet. Add them on the Staff page first.</p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500">
                  <th className="py-2 pr-4 font-medium">Person</th>
                  {open.map((l) => (
                    <th key={l.id} className="py-2 px-3 font-medium text-center whitespace-nowrap">
                      {l.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {staff.map((p) => (
                  <tr key={p.id}>
                    <td className="py-3 pr-4">
                      <span className="block font-semibold text-zinc-900">{p.name || p.email}</span>
                      <span className="block text-xs text-zinc-500 capitalize">
                        {p.role}
                        {p.locations.length === 0 ? ", all locations" : ""}
                      </span>
                    </td>
                    {open.map((l) => (
                      <td key={l.id} className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          aria-label={`${p.name || p.email} works at ${l.name}`}
                          checked={p.locations.some((x) => x.id === l.id)}
                          onChange={() => toggleStaffLocation(p, l.id)}
                          className="w-5 h-5 accent-evergreen cursor-pointer"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
