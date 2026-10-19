"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
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
} from "lucide-react";
import Link from "next/link";

interface Membership {
  id: string;
  tenantId: string;
  memberNumber: string;
  status: string;
  marketingOptIn: boolean;
  joinedAt: string;
  tenantName: string;
  tenantSlug: string;
  brandPrimaryHex: string | null;
  balance: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
}

interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
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

  const handleToggleConsent = async (membershipId: string, currentVal: boolean) => {
    setUpdatingConsent(membershipId);
    try {
      const res = await fetch("/api/v1/customer/me/consents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membershipId,
          granted: !currentVal,
          source: "me_privacy_centre",
        }),
      });

      if (res.ok) {
        setMemberships((prev) =>
          prev.map((m) => (m.id === membershipId ? { ...m, marketingOptIn: !currentVal } : m))
        );
        setMessage(
          !currentVal
            ? "Subscribed to marketing communications."
            : "Unsubscribed from marketing communications."
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
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 py-10 px-4 sm:px-6 selection:bg-indigo-500 selection:text-white">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors inline-flex items-center gap-1.5"
          >
            ← Back to Platform Homepage
          </Link>
          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            UK GDPR Compliant Profile
          </span>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/90 pb-6">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xl shadow-2xs">
              <User className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">Account & Privacy Centre</h1>
              <p className="text-xs text-slate-500 font-medium">{profile?.email}</p>
            </div>
          </div>
          <a
            href="/api/v1/customer/me/export"
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-xs font-bold bg-white border border-slate-300 shadow-2xs hover:bg-slate-50 hover:border-indigo-400 transition cursor-pointer text-slate-800"
          >
            <FileDown className="w-4 h-4 mr-2 text-indigo-600" />
            Export My Data (JSON)
          </a>
        </div>

        {message && (
          <div className="p-3.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-2xl text-xs font-semibold flex items-center space-x-2 shadow-2xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {/* Section: Your Memberships */}
        <section className="space-y-4">
          <div className="flex items-center space-x-2">
            <Building2 className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-black text-slate-900">Your Active Loyalty Passes</h2>
          </div>

          {memberships.length === 0 ? (
            <div className="p-8 text-center bg-white border border-slate-200/90 rounded-3xl text-slate-400 text-xs shadow-2xs">
              You have not joined any loyalty programmes yet. Scan a business QR code or visit their hub to join.
            </div>
          ) : (
            <div className="space-y-3.5">
              {memberships.map((m) => (
                <div
                  key={m.id}
                  className="p-5 bg-white border border-slate-200/90 rounded-3xl shadow-sm space-y-4 hover:border-indigo-300 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="font-black text-base text-slate-900">
                        {m.tenantName}
                      </h3>
                      <div className="font-mono text-xs text-indigo-600 font-bold">
                        Member #{m.memberNumber}
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <div className="text-xl font-black text-indigo-600 tabular-nums">
                          {m.balance} pts
                        </div>
                        <div className="text-[11px] text-slate-400 font-medium">
                          Earned {m.lifetimeEarned} · Redeemed {m.lifetimeRedeemed}
                        </div>
                      </div>
                      <Link
                        href={`/b/${m.tenantSlug}`}
                        className="p-2.5 rounded-xl border border-slate-200 hover:bg-indigo-50 hover:border-indigo-300 text-slate-600 hover:text-indigo-600 transition cursor-pointer"
                        title="Open Digital Pass"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>

                  {/* Marketing Opt-In Toggle */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center space-x-2.5">
                      <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                      <div>
                        <div className="text-xs font-bold text-slate-800">Email Marketing Communications</div>
                        <div className="text-[11px] text-slate-400">
                          Receive special offers, double points announcements & birthday perks
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggleConsent(m.id, m.marketingOptIn)}
                      disabled={updatingConsent === m.id}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                        m.marketingOptIn ? "bg-indigo-600" : "bg-slate-300"
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
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-black text-slate-900">Your Privacy Rights (UK GDPR & DPA 2018)</h2>
          </div>

          <div className="p-6 bg-white border border-slate-200/90 rounded-3xl shadow-sm space-y-4 text-xs text-slate-600 leading-relaxed">
            <p className="font-medium">
              Under the UK General Data Protection Regulation and the Data Protection Act 2018, you
              have rights concerning your personal loyalty records:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 font-normal">
              <li>
                <strong className="text-slate-800">Right of Access (SAR):</strong> You can download a complete machine-readable JSON
                copy of your personal profile, points ledger, and consent records using the &quot;Export My Data&quot;
                button above.
              </li>
              <li>
                <strong className="text-slate-800">Right to Withdraw Consent:</strong> You may opt out of marketing emails at any
                time using the toggle switches above with immediate effect.
              </li>
              <li>
                <strong className="text-slate-800">Right to Erasure (Article 17):</strong> You can request permanent anonymisation of your
                personal details below.
              </li>
            </ul>

            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="font-bold text-rose-600 text-xs">Delete Account & Anonymise Data</div>
                <div className="text-[11px] text-slate-400">
                  Permanently strip your email and name from this platform ledger
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowDeleteModal(true)}
                className="border-rose-300 text-rose-600 hover:bg-rose-50 text-xs font-bold rounded-xl cursor-pointer"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Account
              </Button>
            </div>
          </div>
        </section>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="max-w-md w-full p-6 bg-white rounded-3xl border border-slate-200 space-y-4 shadow-2xl">
            <div className="text-lg font-black text-rose-600 flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5" />
              <span>Confirm Account Erasure</span>
            </div>

            {deleteSuccess ? (
              <div className="p-4 bg-emerald-50 text-emerald-800 rounded-2xl text-xs font-bold text-center">
                Your account has been anonymised. Redirecting to homepage...
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  This action is permanent and cannot be undone. Your name, email, and authentication
                  sessions will be immediately erased. In compliance with UK accounting law, minimal
                  historical points transactions remain anonymised in the double-entry ledger.
                </p>

                <div>
                  <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 block mb-1">
                    Type <strong className="text-rose-600">DELETE</strong> to confirm:
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs font-mono font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div className="flex space-x-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1 font-bold rounded-xl text-xs cursor-pointer"
                    onClick={() => setShowDeleteModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 font-black text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-xl cursor-pointer"
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
