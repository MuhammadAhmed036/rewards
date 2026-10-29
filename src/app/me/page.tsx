"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  User,
  ShieldCheck,
  Building2,
  FileDown,
  Trash2,
  ExternalLink,
  Mail,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  ArrowLeft,
  QrCode,
} from "lucide-react";
import Link from "next/link";
import { BusinessLogo } from "@/components/brand/BusinessLogo";

interface Membership {
  id: string;
  tenantId: string;
  memberNumber: string;
  status: string;
  marketingOptIn: boolean;
  emailNotifications?: boolean;
  joinedAt: string;
  tenantName: string;
  tenantSlug: string;
  brandPrimaryHex: string | null;
  logoUrl?: string | null;
  balance: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
}

interface UserProfile {
  id: string;
  name: string | null;
  birthMonth?: number | null;
  birthDay?: number | null;
  email: string;
  createdAt: string;
}

/** Lets a customer change the name shops see on their card. */
function NameEditor({ name, onSaved }: { name: string; onSaved: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/v1/customer/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: value }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error?.message || "Couldn't save your name");
    onSaved(json.data.name);
    setEditing(false);
  };

  if (!editing) {
    return (
      <p className="mt-1 text-sm text-zinc-700">
        Name on your cards: <strong>{name || "not set"}</strong>{" "}
        <button
          type="button"
          onClick={() => {
            setValue(name);
            setEditing(true);
          }}
          className="font-semibold text-evergreen hover:underline cursor-pointer"
        >
          Change
        </button>
      </p>
    );
  }
  return (
    <form onSubmit={save} className="mt-2 flex flex-wrap items-center gap-2">
      <label htmlFor="profile-name" className="sr-only">
        Your name
      </label>
      <input
        id="profile-name"
        value={value}
        maxLength={80}
        onChange={(e) => setValue(e.target.value)}
        className="min-h-[40px] rounded-xl border border-zinc-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-evergreen"
      />
      <button type="submit" disabled={busy} className="min-h-[40px] px-4 rounded-full bg-evergreen text-white text-sm font-semibold cursor-pointer disabled:opacity-50">
        {busy ? "Saving..." : "Save"}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="min-h-[40px] px-3 text-sm font-semibold text-zinc-600 cursor-pointer">
        Cancel
      </button>
      {error && <p className="w-full text-sm text-rose-700">{error}</p>}
    </form>
  );
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Optional birthday (day and month only) so shops can give a birthday treat. */
function BirthdayEditor({ month, day, onSaved }: { month: number | null; day: number | null; onSaved: (m: number | null, d: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [m, setM] = useState(month ? String(month) : "");
  const [d, setD] = useState(day ? String(day) : "");
  const [error, setError] = useState<string | null>(null);

  const save = async (clear = false) => {
    setError(null);
    const body = clear ? { birthMonth: null, birthDay: null } : { birthMonth: Number(m), birthDay: Number(d) };
    const res = await fetch("/api/v1/customer/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setError(json.error?.message || "Couldn't save your birthday");
    onSaved(body.birthMonth, body.birthDay);
    setEditing(false);
  };

  if (!editing) {
    return (
      <p className="mt-1 text-sm text-zinc-700">
        Birthday: <strong>{month && day ? `${day} ${MONTHS[month - 1]}` : "not added"}</strong>{" "}
        <button type="button" onClick={() => setEditing(true)} className="font-semibold text-evergreen hover:underline cursor-pointer">
          {month ? "Change" : "Add it for a birthday treat"}
        </button>
      </p>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <select aria-label="Day" value={d} onChange={(e) => setD(e.target.value)} className="min-h-[40px] rounded-xl border border-zinc-300 px-2 text-sm">
        <option value="">Day</option>
        {Array.from({ length: 31 }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            {i + 1}
          </option>
        ))}
      </select>
      <select aria-label="Month" value={m} onChange={(e) => setM(e.target.value)} className="min-h-[40px] rounded-xl border border-zinc-300 px-2 text-sm">
        <option value="">Month</option>
        {MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => save()} disabled={!m || !d} className="min-h-[40px] px-4 rounded-full bg-evergreen text-white text-sm font-semibold cursor-pointer disabled:opacity-50">
        Save
      </button>
      {month && (
        <button type="button" onClick={() => save(true)} className="min-h-[40px] px-3 text-sm font-semibold text-zinc-600 cursor-pointer">
          Remove
        </button>
      )}
      <button type="button" onClick={() => setEditing(false)} className="min-h-[40px] px-3 text-sm font-semibold text-zinc-600 cursor-pointer">
        Cancel
      </button>
      <span className="w-full text-xs text-zinc-500">We only keep the day and month, never the year.</span>
      {error && <p className="w-full text-sm text-rose-700">{error}</p>}
    </div>
  );
}

export default function CustomerMePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingConsent, setUpdatingConsent] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchPrivacyData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/customer/me");
      if (res.ok) {
        const json = await res.json();
        setProfile(json.data.user);
        setMemberships(json.data.memberships || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrivacyData();
  }, []);

  const handleToggleConsent = async (membershipId: string, currentVal: boolean, kind: "marketing" | "card" = "marketing") => {
    setUpdatingConsent(membershipId);
    try {
      const res = await fetch("/api/v1/customer/me/consents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membershipId,
          granted: !currentVal,
          source: "me_privacy_centre",
          kind,
        }),
      });

      if (res.ok) {
        setMemberships((prev) =>
          prev.map((m) =>
            m.id === membershipId ? { ...m, ...(kind === "card" ? { emailNotifications: !currentVal } : { marketingOptIn: !currentVal }) } : m
          )
        );
        setMessage(
          kind === "card"
            ? !currentVal
              ? "You'll get emails about this card."
              : "Emails about this card are off."
            : !currentVal
              ? "You'll get offers from this shop."
              : "Offers from this shop are off."
        );
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingConsent(null);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.toUpperCase() !== "DELETE") return;
    setDeleteLoading(true);
    try {
      const res = await fetch("/api/v1/customer/me", { method: "DELETE" });
      if (res.ok) {
        setDeleteSuccess(true);
        setTimeout(() => {
          window.location.href = "/";
        }, 2000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center p-4">
        <RefreshCw className="w-6 h-6 text-zinc-900 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper text-zinc-900 py-6 sm:py-10 px-4 sm:px-6 overflow-x-hidden w-full max-w-full">
      <div className="max-w-3xl mx-auto space-y-6 sm:space-y-8">
        {/* Navigation Breadcrumb */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <Link
            href="/"
            className="text-xs font-medium text-zinc-600 hover:text-zinc-950 transition-colors inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5 stroke-[1.8]" />
            <span>Back to Platform Homepage</span>
          </Link>
          <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 self-start sm:self-auto">
            UK GDPR Compliant Profile
          </span>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200/80 pb-6">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-xl bg-zinc-950 text-white flex items-center justify-center font-bold text-lg shadow-xs ring-1 ring-zinc-900/10">
              <User className="w-5 h-5 stroke-[1.8]" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-950">Account &amp; Privacy Centre</h1>
              <p className="text-xs text-zinc-500 font-medium">{profile?.email}</p>
              <NameEditor
                name={profile?.name ?? ""}
                onSaved={(name) => setProfile((p) => (p ? { ...p, name } : p))}
              />
              <BirthdayEditor
                month={profile?.birthMonth ?? null}
                day={profile?.birthDay ?? null}
                onSaved={(birthMonth, birthDay) => setProfile((p) => (p ? { ...p, birthMonth, birthDay } : p))}
              />
            </div>
          </div>
          <a
            href="/api/v1/customer/me/export"
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-xs font-semibold bg-white border border-zinc-300 shadow-2xs hover:bg-zinc-50 transition cursor-pointer text-zinc-800 w-full sm:w-auto"
          >
            <FileDown className="w-4 h-4 mr-2 text-zinc-700 stroke-[1.8]" />
            Export My Data (JSON)
          </a>
        </div>

        {message && (
          <div className="p-3.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center space-x-2 shadow-2xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 stroke-[1.8]" />
            <span>{message}</span>
          </div>
        )}

        {/* Section: Your Memberships */}
        <section className="space-y-4">
          <div className="flex items-center space-x-2">
            <Building2 className="w-4 h-4 text-zinc-700 stroke-[1.8]" />
            <h2 className="text-sm sm:text-base font-bold text-zinc-950">Your Active Loyalty Passes</h2>
          </div>

          {memberships.length === 0 ? (
            <div className="p-8 text-center bg-white border border-zinc-200 rounded-2xl text-zinc-500 text-xs shadow-2xs">
              You have not joined any loyalty programmes yet. Scan a business QR code or visit their hub to join.
            </div>
          ) : (
            <div className="space-y-3.5">
              {memberships.map((m) => (
                <div
                  key={m.id}
                  className="p-5 bg-white border border-zinc-200/90 rounded-2xl shadow-xs space-y-4 hover:border-zinc-300 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <BusinessLogo name={m.tenantName} logoUrl={m.logoUrl} brandColor={m.brandPrimaryHex} size="sm" />
                      <div className="min-w-0">
                        <h3 className="font-bold text-base text-zinc-950 truncate">{m.tenantName}</h3>
                        <div className="text-xs text-zinc-600 font-semibold">Customer ID {m.memberNumber}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end space-x-3">
                      <div className="text-left sm:text-right">
                        <div className="text-xl font-bold text-zinc-950 tabular-nums">
                          {m.balance} pts
                        </div>
                        <div className="text-[11px] text-zinc-400 font-medium">
                          Earned {m.lifetimeEarned} · Redeemed {m.lifetimeRedeemed}
                        </div>
                      </div>
                      <Link
                        href={`/b/${m.tenantSlug}`}
                        className="p-2.5 rounded-lg border border-zinc-200 hover:bg-zinc-100 text-zinc-700 transition cursor-pointer"
                        title="Open Digital Pass"
                      >
                        <ExternalLink className="w-4 h-4 stroke-[1.8]" />
                      </Link>
                    </div>
                  </div>

                  {/* Service emails about this card */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center space-x-2.5">
                      <Mail className="w-4 h-4 text-zinc-400 shrink-0 stroke-[1.8]" />
                      <div>
                        <div className="text-xs font-semibold text-zinc-800">Emails about my card</div>
                        <div className="text-[11px] text-zinc-500">When a reward is ready, and a receipt when you use points</div>
                      </div>
                    </div>
                    <button
                      role="switch"
                      aria-checked={m.emailNotifications !== false}
                      aria-label={`Emails about my ${m.tenantName} card`}
                      onClick={() => handleToggleConsent(m.id, m.emailNotifications !== false, "card")}
                      disabled={updatingConsent === m.id}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0 ${
                        m.emailNotifications !== false ? "bg-evergreen" : "bg-zinc-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          m.emailNotifications !== false ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Marketing Opt-In Toggle */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center space-x-2.5">
                      <Mail className="w-4 h-4 text-zinc-400 shrink-0 stroke-[1.8]" />
                      <div>
                        <div className="text-xs font-semibold text-zinc-800">Offers from this shop</div>
                        <div className="text-[11px] text-zinc-500">Special offers and double-points days</div>
                      </div>
                    </div>

                    <button
                      role="switch"
                      aria-checked={m.marketingOptIn}
                      aria-label={`Offers from ${m.tenantName}`}
                      onClick={() => handleToggleConsent(m.id, m.marketingOptIn)}
                      disabled={updatingConsent === m.id}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0 ${
                        m.marketingOptIn ? "bg-evergreen" : "bg-zinc-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          m.marketingOptIn ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section: Privacy Rights */}
        <section className="space-y-4">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-zinc-700 stroke-[1.8]" />
            <h2 className="text-sm sm:text-base font-bold text-zinc-950">Your Privacy Rights (UK GDPR &amp; DPA 2018)</h2>
          </div>

          <div className="p-6 bg-white border border-zinc-200/90 rounded-2xl shadow-xs space-y-4 text-xs text-zinc-600 leading-relaxed">
            <p className="font-medium text-zinc-700">
              Under the UK General Data Protection Regulation and the Data Protection Act 2018, you
              have rights concerning your personal loyalty records:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 font-normal">
              <li>
                <strong className="text-zinc-900">Right of Access (SAR):</strong> You can download a complete machine-readable JSON
                copy of your profile, ledger history, and consent records using the &quot;Export My Data&quot;
                button above.
              </li>
              <li>
                <strong className="text-zinc-900">Right to Withdraw Consent:</strong> You may opt out of marketing emails at any
                time using the toggle switches above with immediate effect.
              </li>
              <li>
                <strong className="text-zinc-900">Right to Erasure (Article 17):</strong> You can request permanent anonymisation of your
                personal details below.
              </li>
            </ul>

            <div className="pt-4 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-rose-700 text-xs">Delete Account &amp; Anonymise Data</div>
                <div className="text-[11px] text-zinc-400">
                  Permanently strip your email and name from this platform ledger
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowDeleteModal(true)}
                className="border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-semibold rounded-xl cursor-pointer w-full sm:w-auto"
              >
                <Trash2 className="w-4 h-4 mr-2 stroke-[1.8]" />
                Delete Account
              </Button>
            </div>
          </div>
        </section>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="max-w-md w-full p-6 bg-white rounded-2xl border border-zinc-200 space-y-4 shadow-xl">
            <div className="text-base font-bold text-rose-700 flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 stroke-[1.8]" />
              <span>Confirm Account Erasure</span>
            </div>

            {deleteSuccess ? (
              <div className="p-4 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold text-center">
                Your account has been anonymised. Redirecting to homepage...
              </div>
            ) : (
              <>
                <p className="text-xs text-zinc-600 leading-relaxed font-medium">
                  This action is permanent and cannot be undone. Your name, email, and authentication
                  sessions will be immediately erased. In compliance with UK accounting law, minimal
                  historical points transactions remain anonymised in the double-entry ledger.
                </p>

                <div>
                  <label className="text-xs font-semibold text-zinc-700 block mb-1">
                    Type <strong className="text-rose-700">DELETE</strong> to confirm:
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="w-full min-h-[44px] rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-xs font-mono font-bold focus:bg-white focus:outline-none focus:ring-1 focus:ring-rose-500"
                  />
                </div>

                <div className="flex space-x-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1 font-semibold rounded-xl text-xs cursor-pointer"
                    onClick={() => setShowDeleteModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 font-semibold text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-xl cursor-pointer"
                    disabled={deleteConfirmText.toUpperCase() !== "DELETE" || deleteLoading}
                    onClick={handleDeleteAccount}
                  >
                    {deleteLoading ? "Erasing..." : "Permanently Delete"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
