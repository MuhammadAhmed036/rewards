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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-10 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 text-indigo-600 flex items-center justify-center font-bold text-xl">
              <User className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Account & Privacy Centre</h1>
              <p className="text-sm text-slate-500">{profile?.email}</p>
            </div>
          </div>
          <a
            href="/api/v1/customer/me/export"
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 shadow-sm hover:bg-slate-100 transition"
          >
            <FileDown className="w-4 h-4 mr-2 text-indigo-500" />
            Export My Data (JSON)
          </a>
        </div>

        {message && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-xl text-sm flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{message}</span>
          </div>
        )}

        {/* Section: Your Memberships */}
        <section className="space-y-4">
          <div className="flex items-center space-x-2">
            <Building2 className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-bold">Your Loyalty Memberships</h2>
          </div>

          {memberships.length === 0 ? (
            <Card className="p-8 text-center bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500">
              You have not joined any loyalty programmes yet.
            </Card>
          ) : (
            <div className="space-y-4">
              {memberships.map((m) => (
                <Card
                  key={m.id}
                  className="p-5 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div>
                      <h3 className="font-bold text-base text-slate-900 dark:text-white">
                        {m.tenantName}
                      </h3>
                      <div className="font-mono text-xs text-indigo-600 dark:text-indigo-400">
                        Member #{m.memberNumber}
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <div className="text-xl font-black text-indigo-600 dark:text-indigo-400">
                          {m.balance} pts
                        </div>
                        <div className="text-xs text-slate-400">
                          Earned {m.lifetimeEarned} · Redeemed {m.lifetimeRedeemed}
                        </div>
                      </div>
                      <Link
                        href={`/b/${m.tenantSlug}`}
                        className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      >
                        <ExternalLink className="w-4 h-4 text-slate-500" />
                      </Link>
                    </div>
                  </div>

                  {/* Marketing Opt-In Toggle */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center space-x-2">
                      <Mail className="w-4 h-4 text-slate-400" />
                      <div>
                        <div className="text-xs font-semibold">Marketing Communications</div>
                        <div className="text-xs text-slate-500">
                          Receive special offers and reward news via email
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggleConsent(m.id, m.marketingOptIn)}
                      disabled={updatingConsent === m.id}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        m.marketingOptIn ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-700"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          m.marketingOptIn ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Section: Privacy Rights */}
        <section className="space-y-4">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-bold">Your Privacy Rights (UK GDPR)</h2>
          </div>

          <Card className="p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-4 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            <p>
              Under the UK General Data Protection Regulation and the Data Protection Act 2018, you
              have rights concerning your personal loyalty records:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Right of Access:</strong> You can download a complete machine-readable JSON
                copy of your personal profile, points ledger, and consent records using the &quot;Export&quot;
                button above.
              </li>
              <li>
                <strong>Right to Withdraw Consent:</strong> You may opt out of marketing emails at any
                time using the toggle switches above with immediate effect.
              </li>
              <li>
                <strong>Right to Erasure:</strong> You can request permanent anonymisation of your
                personal details below.
              </li>
            </ul>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <div className="font-semibold text-rose-600">Delete Account & Anonymise Data</div>
                <div className="text-xs text-slate-500">
                  Permanently strip your email and name from this platform
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowDeleteModal(true)}
                className="border-rose-300 dark:border-rose-900 text-rose-600 hover:bg-rose-50 text-xs font-semibold"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Account
              </Button>
            </div>
          </Card>
        </section>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <Card className="max-w-md w-full p-6 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-800 space-y-4">
            <CardTitle className="text-lg text-rose-600 flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5" />
              <span>Confirm Account Deletion</span>
            </CardTitle>

            {deleteSuccess ? (
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 rounded-xl text-sm font-semibold text-center">
                Your account has been anonymised. Redirecting...
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  This action is permanent and cannot be undone. Your name, email, and authentication
                  sessions will be immediately erased. In compliance with UK accounting law, minimal
                  historical points transactions remain anonymised.
                </p>

                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                    Type <strong>DELETE</strong> to confirm:
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
                  />
                </div>

                <div className="flex space-x-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowDeleteModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 font-bold bg-rose-600 hover:bg-rose-700 text-white"
                    disabled={deleteConfirmText.toUpperCase() !== "DELETE" || deleteLoading}
                    onClick={handleDeleteAccount}
                  >
                    {deleteLoading ? "Deleting..." : "Permanently Delete"}
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
