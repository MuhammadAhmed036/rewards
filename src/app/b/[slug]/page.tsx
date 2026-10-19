"use client";

import React, { useState, useEffect, use, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  QrCode,
  Gift,
  Star,
  Globe,
  MessageSquare,
  History,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  X,
} from "lucide-react";
import { InstagramIcon, FacebookIcon } from "@/components/ui/icons";

interface HubPayload {
  tenant: {
    id: string;
    slug: string;
    name: string;
    brandPrimaryHex: string;
    logoUrl?: string;
  };
  programme: {
    name: string;
    type: "points" | "stamps";
  };
  member: {
    membershipId: string;
    memberNumber: string;
    displayName: string;
    balance: number;
    lifetimeEarned: number;
    qrToken: string;
    qrDataUrl: string;
    recentHistory: Array<{
      id: string;
      type: string;
      pointsDelta: number;
      occurredAt: string;
    }>;
  } | null;
  rewards: Array<{
    id: string;
    title: string;
    costPoints: number;
    eligible: boolean;
    pointsShortfall: number;
    description?: string;
  }>;
  links: Array<{
    id: string;
    type: string;
    label: string;
    url: string;
  }>;
}

export default function BusinessHubPage(props: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ loc?: string }>;
}) {
  const { slug } = use(props.params);

  const [hubData, setHubData] = useState<HubPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Join form state
  const [joinEmail, setJoinEmail] = useState("");
  const [joinName, setJoinName] = useState("");
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [joining, setJoining] = useState(false);

  // QR Modal
  const [showQrModal, setShowQrModal] = useState(false);

  // Redemption Modal & Polling
  const [activeRedemption, setActiveRedemption] = useState<{
    id: string;
    code: string;
    rewardTitle: string;
    costPoints: number;
    expiresAt: string;
  } | null>(null);
  const [redemptionSuccess, setRedemptionSuccess] = useState(false);

  // Feedback form state
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [contactBackOk, setContactBackOk] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const fetchHubData = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/customer/hub-data?slug=${encodeURIComponent(slug)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Failed to load business");
      setHubData(json.data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error loading business");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchHubData();
  }, [fetchHubData]);

  // Poll redemption status every 3s if pending code is active
  useEffect(() => {
    if (!activeRedemption) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/customer/redeem?id=${activeRedemption.id}`);
        if (res.ok) {
          const json = await res.json();
          if (json.data?.status === "confirmed") {
            setRedemptionSuccess(true);
            setActiveRedemption(null);
            fetchHubData(); // Refresh balance
          }
        }
      } catch (err) {
        console.error("Redemption polling error", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeRedemption, fetchHubData]);

  // Handle Join
  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termsAgreed) {
      alert("Please accept the programme terms to continue");
      return;
    }

    setJoining(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/v1/customer/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantSlug: slug,
          email: joinEmail,
          name: joinName,
          marketingOptIn,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Failed to join");
      // Refresh hub data to show logged-in member view
      await fetchHubData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Join error");
    } finally {
      setJoining(false);
    }
  };

  // Handle Request Redemption
  const handleStartRedeem = async (rewardId: string, rewardTitle: string, costPoints: number) => {
    if (!hubData?.member) return;
    setErrorMsg(null);
    try {
      const res = await fetch("/api/v1/customer/redeem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": hubData.tenant.id,
        },
        body: JSON.stringify({
          membershipId: hubData.member.membershipId,
          rewardId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Redemption request failed");

      setActiveRedemption({
        id: json.data.redemptionId,
        code: json.data.code,
        rewardTitle,
        costPoints,
        expiresAt: json.data.expiresAt,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error initiating redemption");
    }
  };

  // Handle Feedback Submission
  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackMessage.trim() || !hubData) return;

    setSubmittingFeedback(true);
    try {
      const res = await fetch("/api/v1/customer/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: hubData.tenant.id,
          membershipId: hubData.member?.membershipId,
          message: feedbackMessage.trim(),
          contactBackOk,
        }),
      });
      if (res.ok) {
        setFeedbackSubmitted(true);
        setFeedbackMessage("");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center space-y-3">
          <div className="h-10 w-10 border-4 border-slate-900 border-t-transparent rounded-full animate-spin dark:border-slate-100" />
          <p className="text-sm font-medium text-slate-500">Loading loyalty hub...</p>
        </div>
      </div>
    );
  }

  if (errorMsg && !hubData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
        <Card className="max-w-md w-full text-center p-6">
          <CardTitle className="text-rose-600 mb-2">Notice</CardTitle>
          <p className="text-sm text-slate-600 mb-4">{errorMsg}</p>
          <Button onClick={() => window.location.reload()}>Try Again</Button>
        </Card>
      </div>
    );
  }

  if (!hubData) return null;

  const brandColor = hubData.tenant.brandPrimaryHex || "#0f172a";
  const member = hubData.member;
  const isStamps = hubData.programme.type === "stamps";

  // Calculate next reward progress
  const nextLockedReward = hubData.rewards
    .filter((r) => !r.eligible)
    .sort((a, b) => a.costPoints - b.costPoints)[0];

  const highestEligibleReward = hubData.rewards
    .filter((r) => r.eligible)
    .sort((a, b) => b.costPoints - a.costPoints)[0];

  return (
    <div
      className="min-h-screen bg-[#f8fafc] text-slate-900 pb-24 selection:bg-indigo-500 selection:text-white"
      style={{ "--brand": brandColor } as React.CSSProperties}
    >
      {/* Brand Header - Luxury Light Theme Shell */}
      <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/95 backdrop-blur-md px-4 py-3.5 shadow-2xs">
        <div className="mx-auto max-w-md flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-2xl text-white font-black text-lg shadow-sm"
              style={{ backgroundColor: brandColor || "#4f46e5" }}
            >
              {hubData.tenant.name.slice(0, 1)}
            </span>
            <div>
              <h1 className="font-black text-base text-slate-900 leading-tight tracking-tight">
                {hubData.tenant.name}
              </h1>
              <span className="text-[11px] text-slate-500 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                {hubData.programme.name} • Official Member Pass
              </span>
            </div>
          </div>

          {member && (
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowQrModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-sm cursor-pointer"
            >
              <QrCode className="h-4 w-4 mr-1.5" />
              Show QR
            </Button>
          )}
        </div>
      </header>

      {/* Main Body */}
      <main className="mx-auto max-w-md px-4 pt-5 space-y-5">
        {/* Error notification banner */}
        {errorMsg && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs flex justify-between items-center shadow-xs">
            <span className="font-semibold">{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="font-bold underline ml-2 cursor-pointer">
              Dismiss
            </button>
          </div>
        )}

        {/* Member View: Loyalty Balance & Progress */}
        {member ? (
          <div className="space-y-5">
            {/* Luxury Digital Pass Card (Apple Wallet / Monzo aesthetic) */}
            <div className="rounded-3xl border border-slate-200/90 shadow-xl overflow-hidden bg-white">
              {/* Card Face */}
              <div
                className="p-6 text-white relative overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${brandColor || "#1e1b4b"} 0%, #0f172a 100%)`,
                }}
              >
                {/* Decorative Subtle Background Orbs */}
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>

                <div className="flex justify-between items-start relative z-10">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-300 font-extrabold block">
                      {isStamps ? "Verified Stamp Card" : "Loyalty Points Balance"}
                    </span>
                    <div className="text-4xl font-black mt-1 tracking-tight text-white tabular-nums">
                      {member.balance}{" "}
                      <span className="text-xl font-bold font-sans text-slate-300">
                        {isStamps ? "stamps" : "pts"}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-slate-300 font-mono block">
                      #{member.memberNumber}
                    </span>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-white/15 backdrop-blur-md text-white text-[10px] font-bold border border-white/20">
                      VIP Member
                    </span>
                  </div>
                </div>

                {/* Stamp Grid or Progress Bar */}
                {isStamps ? (
                  <div className="mt-6 pt-4 border-t border-white/15 relative z-10">
                    <div className="grid grid-cols-4 gap-2.5">
                      {Array.from({ length: 8 }).map((_, idx) => {
                        const isStamped = idx < member.balance;
                        return (
                          <div
                            key={idx}
                            className={`h-12 rounded-xl flex items-center justify-center font-bold text-sm transition-all ${
                              isStamped
                                ? "bg-white text-slate-900 shadow-md ring-2 ring-amber-400/50"
                                : "border-2 border-dashed border-white/30 text-white/40"
                            }`}
                          >
                            {isStamped ? <Sparkles className="h-5 w-5 text-amber-500 animate-pulse" /> : idx + 1}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : nextLockedReward ? (
                  <div className="mt-6 pt-4 border-t border-white/15 relative z-10">
                    <div className="flex justify-between text-xs text-white/90 mb-1.5 font-medium">
                      <span>Next unlock: <strong className="text-white">{nextLockedReward.title}</strong></span>
                      <span className="font-bold text-amber-300">{nextLockedReward.pointsShortfall} pts needed</span>
                    </div>
                    <div className="h-2.5 w-full bg-white/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-amber-300 rounded-full transition-all duration-500 shadow-sm"
                        style={{
                          width: `${Math.min(
                            100,
                            (member.balance / nextLockedReward.costPoints) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ) : highestEligibleReward ? (
                  <div className="mt-5 pt-3 border-t border-white/15 text-xs text-emerald-300 font-bold flex items-center relative z-10">
                    <Sparkles className="h-4 w-4 mr-1 text-amber-300" />
                    <span>You have rewards unlocked and ready to claim!</span>
                  </div>
                ) : null}
              </div>

              {/* Bottom Card Bar */}
              <div className="p-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600 pl-2">
                  Member: {member.displayName}
                </span>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setShowQrModal(true)}
                  className="rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white text-xs shadow-xs cursor-pointer"
                >
                  <QrCode className="h-3.5 w-3.5 mr-1.5" />
                  Tap to Scan QR
                </Button>
              </div>
            </div>

            {/* Rewards Section */}
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-black text-slate-900 flex items-center">
                  <Gift className="h-4 w-4 mr-2 text-indigo-600" />
                  Available Programme Rewards
                </h3>
                <span className="text-[10px] font-bold text-slate-400">1-Tap Claim</span>
              </div>

              <div className="space-y-3">
                {hubData.rewards.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">
                    Rewards are currently being curated. Check back shortly!
                  </p>
                ) : (
                  hubData.rewards.map((reward) => (
                    <div
                      key={reward.id}
                      className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/50 flex items-center justify-between shadow-2xs"
                    >
                      <div className="space-y-0.5 pr-3">
                        <div className="font-bold text-sm text-slate-900 leading-snug">{reward.title}</div>
                        {reward.description && (
                          <p className="text-xs text-slate-500 line-clamp-1">
                            {reward.description}
                          </p>
                        )}
                        <span className="text-xs font-extrabold text-indigo-700 block">
                          {reward.costPoints} {isStamps ? "stamps" : "points"}
                        </span>
                      </div>

                      <div>
                        {reward.eligible ? (
                          <Button
                            variant="default"
                            size="sm"
                            className="font-black text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs cursor-pointer"
                            onClick={() =>
                              handleStartRedeem(reward.id, reward.title, reward.costPoints)
                            }
                          >
                            Claim Reward
                          </Button>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] font-semibold">
                            Need {reward.pointsShortfall} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Social & Google Review Buttons (UK Anti-Gating: Accessible to all) */}
            {hubData.links.length > 0 && (
              <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-black text-slate-900 flex items-center">
                    <Star className="h-4 w-4 mr-1.5 text-amber-500 fill-amber-500" />
                    Official Reviews & Social Links
                  </h3>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">Anti-Gating Compliant</span>
                </div>

                <div className="space-y-2">
                  {hubData.links.map((link) => {
                    let IconComponent: React.ComponentType<{ className?: string }> = Globe;
                    if (link.type === "google_review") IconComponent = Star;
                    if (link.type === "instagram") IconComponent = InstagramIcon;
                    if (link.type === "facebook") IconComponent = FacebookIcon;

                    return (
                      <a
                        key={link.id}
                        href={`/go/${link.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition-all font-bold text-xs group shadow-2xs"
                      >
                        <span className="flex items-center space-x-2.5 text-slate-800">
                          <IconComponent
                            className={`h-4 w-4 ${
                              link.type === "google_review"
                                ? "text-amber-500 fill-amber-500"
                                : link.type === "instagram"
                                ? "text-pink-600"
                                : link.type === "facebook"
                                ? "text-blue-600"
                                : "text-slate-600"
                            }`}
                          />
                          <span>{link.label}</span>
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Private Feedback Form */}
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-black text-slate-900 flex items-center">
                  <MessageSquare className="h-4 w-4 mr-1.5 text-indigo-600" />
                  Direct Message to Business
                </h3>
                <span className="text-[10px] font-bold text-slate-400">Private & Confidential</span>
              </div>

              {feedbackSubmitted ? (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-center text-xs font-semibold animate-in fade-in">
                  <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-600 mb-2" />
                  Thank you! Your private note has been delivered to the business manager.
                </div>
              ) : (
                <form onSubmit={handleSubmitFeedback} className="space-y-3">
                  <textarea
                    rows={3}
                    maxLength={2000}
                    placeholder="Have an enquiry or private suggestion? Write directly to the manager..."
                    value={feedbackMessage}
                    onChange={(e) => setFeedbackMessage(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
                  />

                  <label className="flex items-center space-x-2 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={contactBackOk}
                      onChange={(e) => setContactBackOk(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>You may contact me back regarding this note</span>
                  </label>

                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    className="w-full font-bold text-xs rounded-xl border-slate-300 hover:bg-slate-50 cursor-pointer"
                    disabled={submittingFeedback || !feedbackMessage.trim()}
                  >
                    {submittingFeedback ? "Sending message..." : "Send Private Message"}
                  </Button>
                </form>
              )}
            </div>

            {/* Recent History List */}
            {member.recentHistory && member.recentHistory.length > 0 && (
              <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-black text-slate-900 flex items-center">
                    <History className="h-4 w-4 mr-1.5 text-slate-500" />
                    Member Transaction History
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400">Audited Ledger</span>
                </div>

                <div className="space-y-2">
                  {member.recentHistory.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 text-xs"
                    >
                      <div>
                        <span className="font-bold capitalize text-slate-800">
                          {item.type}
                        </span>
                        <span className="text-slate-400 block text-[10px]">
                          {new Date(item.occurredAt).toLocaleDateString([], {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                      <span
                        className={`font-black text-sm tabular-nums ${
                          item.pointsDelta > 0 ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {item.pointsDelta > 0 ? `+${item.pointsDelta}` : item.pointsDelta} pts
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Public Join Sheet / Landing View */
          <div className="space-y-5">
            {/* Value Proposition Hero */}
            <div className="bg-white rounded-3xl text-center p-6 border border-slate-200/90 shadow-sm">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 mb-3 shadow-2xs">
                <Sparkles className="h-7 w-7" />
              </span>
              <h2 className="text-2xl font-black tracking-tight text-slate-900">Join & Collect Rewards</h2>
              <p className="mt-2 text-xs text-slate-500 max-w-sm mx-auto">
                Collect {isStamps ? "stamps" : "points"} on every purchase and unlock exclusive complimentary
                rewards at {hubData.tenant.name}.
              </p>
            </div>

            {/* Join Form */}
            <div className="bg-white rounded-3xl shadow-lg p-6 border border-slate-200/90">
              {/* Google One-Tap / OAuth Button */}
              <div className="mb-4">
                <a
                  href={`/api/v1/auth/google?returnTo=${encodeURIComponent(`/b/${slug}`)}`}
                  className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-2xl border border-slate-300 hover:bg-slate-50 transition-all font-bold text-xs shadow-2xs text-slate-800"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Quick Join with Google</span>
                </a>

                <div className="flex items-center my-4">
                  <div className="flex-1 border-t border-slate-200" />
                  <span className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">or with email</span>
                  <div className="flex-1 border-t border-slate-200" />
                </div>
              </div>

              <form onSubmit={handleJoin} className="space-y-3.5">
                <div>
                  <label className="text-xs font-bold text-slate-800 block mb-1">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    type="email"
                    required
                    placeholder="name@example.com"
                    value={joinEmail}
                    onChange={(e) => setJoinEmail(e.target.value)}
                    className="text-xs rounded-xl bg-slate-50 border-slate-200"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Your Name (Optional)
                  </label>
                  <Input
                    type="text"
                    placeholder="First & Last Name"
                    value={joinName}
                    onChange={(e) => setJoinName(e.target.value)}
                    className="text-xs rounded-xl bg-slate-50 border-slate-200"
                  />
                </div>

                {/* Consent Checkboxes (UK GDPR Section 13) */}
                <div className="space-y-2 pt-1">
                  <label className="flex items-start space-x-2 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      required
                      checked={termsAgreed}
                      onChange={(e) => setTermsAgreed(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>
                      I accept the programme terms and privacy policy. Points hold no cash value.
                    </span>
                  </label>

                  <label className="flex items-start space-x-2 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={marketingOptIn}
                      onChange={(e) => setMarketingOptIn(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>
                      (Optional) Keep me informed with special offers and birthday perks.
                    </span>
                  </label>
                </div>

                <Button
                  type="submit"
                  variant="default"
                  size="lg"
                  className="w-full font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md h-11 cursor-pointer"
                  disabled={joining || !joinEmail}
                >
                  {joining ? "Generating Digital Pass..." : "Join & Get My Pass →"}
                </Button>
              </form>
            </div>

            {/* Teaser Rewards */}
            {hubData.rewards.length > 0 && (
              <div className="space-y-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 pl-1 block">
                  Featured Rewards To Unlock
                </span>
                <div className="space-y-2">
                  {hubData.rewards.slice(0, 3).map((r) => (
                    <div
                      key={r.id}
                      className="p-3.5 rounded-2xl border border-slate-200 bg-white flex items-center justify-between text-xs shadow-2xs"
                    >
                      <div className="font-bold text-slate-900">{r.title}</div>
                      <Badge variant="outline" className="font-bold">{r.costPoints} pts</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Member QR Modal */}
      {showQrModal && member && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white text-slate-900 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl relative border border-slate-200">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute right-4 top-4 p-2 text-slate-400 hover:text-slate-900 rounded-xl cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-xl font-black mb-0.5 text-slate-900">{member.displayName}</h3>
            <p className="text-xs text-indigo-600 font-mono font-bold mb-4">#{member.memberNumber}</p>

            {/* QR Image */}
            <div className="p-4 bg-white rounded-2xl border-2 border-slate-900 mx-auto inline-block shadow-sm">
              <img
                src={member.qrDataUrl}
                alt={`Member QR for ${member.memberNumber}`}
                className="w-56 h-56 mx-auto"
              />
            </div>

            <div className="mt-4 flex items-center justify-center text-xs text-slate-500 space-x-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Verified Member QR • Brighten screen at scanner</span>
            </div>

            <Button
              variant="default"
              className="w-full mt-5 font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl cursor-pointer"
              onClick={() => setShowQrModal(false)}
            >
              Done / Close
            </Button>
          </div>
        </div>
      )}

      {/* Redemption Code One-Time Modal (With Live Polling) */}
      {activeRedemption && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
          <div className="bg-white text-slate-900 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl relative border border-slate-200">
            <button
              onClick={() => setActiveRedemption(null)}
              className="absolute right-4 top-4 p-2 text-slate-400 hover:text-slate-900 rounded-xl cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 border border-purple-200 text-purple-700 mb-2">
              <Gift className="h-6 w-6" />
            </div>

            <h3 className="text-xl font-black text-slate-900">{activeRedemption.rewardTitle}</h3>
            <p className="text-xs text-slate-500 mb-3">Present this voucher code to staff at counter</p>

            <div className="my-3 py-3 px-4 bg-slate-100 rounded-2xl font-mono text-3xl font-black tracking-widest text-slate-900 border border-slate-200">
              {activeRedemption.code}
            </div>

            <div className="flex items-center justify-center space-x-1 text-xs text-amber-700 font-bold mb-3">
              <Clock className="h-3.5 w-3.5" />
              <span>Valid for 10 minutes</span>
            </div>

            <div className="text-xs text-slate-500 flex items-center justify-center space-x-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Awaiting staff scanner confirmation...</span>
            </div>
          </div>
        </div>
      )}

      {/* Redemption Success Banner */}
      {redemptionSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl border-2 border-emerald-500">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 mx-auto flex items-center justify-center mb-3">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" />
            </div>
            <h3 className="text-2xl font-black text-slate-900">Enjoy Your Reward!</h3>
            <p className="text-slate-600 text-xs mt-1 mb-6 font-medium">
              Your voucher has been verified and confirmed in the ledger.
            </p>
            <Button
              variant="default"
              className="w-full font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl cursor-pointer"
              onClick={() => setRedemptionSuccess(false)}
            >
              Back to My Digital Pass →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
