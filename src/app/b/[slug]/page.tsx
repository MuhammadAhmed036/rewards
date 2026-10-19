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
      className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 pb-20"
      style={{ "--brand": brandColor } as React.CSSProperties}
    >
      {/* Brand Header */}
      <header
        className="px-5 py-6 text-white shadow-md transition-colors"
        style={{ backgroundColor: brandColor }}
      >
        <div className="mx-auto max-w-md flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 backdrop-blur font-black text-xl">
              {hubData.tenant.name.slice(0, 1)}
            </span>
            <div>
              <h1 className="font-extrabold text-lg leading-tight tracking-tight">
                {hubData.tenant.name}
              </h1>
              <span className="text-xs text-white/80 font-medium">
                {hubData.programme.name}
              </span>
            </div>
          </div>

          {member && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowQrModal(true)}
              className="bg-white/10 border-white/20 text-white hover:bg-white/20 rounded-xl"
            >
              <QrCode className="h-4 w-4 mr-1.5" />
              My QR
            </Button>
          )}
        </div>
      </header>

      {/* Main Body */}
      <main className="mx-auto max-w-md px-4 pt-5 space-y-5">
        {/* Error notification banner */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex justify-between items-center">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="font-bold underline ml-2">
              Dismiss
            </button>
          </div>
        )}

        {/* Member View: Loyalty Balance & Progress */}
        {member ? (
          <div className="space-y-5">
            {/* Balance Card */}
            <Card className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div
                className="p-6 text-white"
                style={{
                  background: `linear-gradient(135deg, ${brandColor}, #1e293b)`,
                }}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-white/80 font-semibold">
                      {isStamps ? "Stamps Collected" : "Loyalty Points"}
                    </span>
                    <div className="text-4xl font-black mt-1 tracking-tight">
                      {member.balance}{" "}
                      <span className="text-xl font-bold font-sans text-white/90">
                        {isStamps ? "stamps" : "pts"}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-white/70 font-mono block">
                      #{member.memberNumber}
                    </span>
                    <Badge variant="secondary" className="mt-1 bg-white/20 text-white">
                      Active
                    </Badge>
                  </div>
                </div>

                {/* Stamp Grid or Progress Bar */}
                {isStamps ? (
                  <div className="mt-6 pt-4 border-t border-white/20">
                    <div className="grid grid-cols-4 gap-2.5">
                      {Array.from({ length: 8 }).map((_, idx) => {
                        const isStamped = idx < member.balance;
                        return (
                          <div
                            key={idx}
                            className={`h-12 rounded-xl flex items-center justify-center font-bold text-sm transition-all ${
                              isStamped
                                ? "bg-white text-slate-900 shadow-sm"
                                : "border border-dashed border-white/40 text-white/40"
                            }`}
                          >
                            {isStamped ? <Sparkles className="h-5 w-5 text-amber-500" /> : idx + 1}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : nextLockedReward ? (
                  <div className="mt-6 pt-4 border-t border-white/20">
                    <div className="flex justify-between text-xs text-white/90 mb-1.5 font-medium">
                      <span>Next reward: {nextLockedReward.title}</span>
                      <span>{nextLockedReward.pointsShortfall} pts needed</span>
                    </div>
                    <div className="h-2.5 w-full bg-white/25 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-white rounded-full transition-all duration-500"
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
                  <div className="mt-5 pt-3 border-t border-white/20 text-xs text-white/90 flex items-center">
                    <Sparkles className="h-4 w-4 mr-1 text-amber-300" />
                    <span>You have rewards ready to redeem!</span>
                  </div>
                ) : null}
              </div>

              {/* Show QR Action Bar */}
              <div className="p-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-500 pl-2">Show at checkout</span>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setShowQrModal(true)}
                  className="rounded-xl font-bold shadow-sm"
                >
                  <QrCode className="h-4 w-4 mr-1.5" />
                  Show Card QR
                </Button>
              </div>
            </Card>

            {/* Rewards Section */}
            <Card className="rounded-3xl shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center">
                  <Gift className="h-5 w-5 mr-2 text-purple-600" />
                  Programme Rewards
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {hubData.rewards.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">
                    Rewards are currently being prepared. Check back soon!
                  </p>
                ) : (
                  hubData.rewards.map((reward) => (
                    <div
                      key={reward.id}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between"
                    >
                      <div className="space-y-1 pr-3">
                        <div className="font-bold text-base leading-snug">{reward.title}</div>
                        {reward.description && (
                          <p className="text-xs text-slate-500 line-clamp-1">
                            {reward.description}
                          </p>
                        )}
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                          {reward.costPoints} {isStamps ? "stamps" : "points"}
                        </span>
                      </div>

                      <div>
                        {reward.eligible ? (
                          <Button
                            variant="success"
                            size="sm"
                            className="font-bold shadow-sm"
                            onClick={() =>
                              handleStartRedeem(reward.id, reward.title, reward.costPoints)
                            }
                          >
                            Redeem
                          </Button>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Need {reward.pointsShortfall} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Social & Google Review Buttons (NON-NEGOTIABLE ANTI-GATING: Identical for everyone) */}
            {hubData.links.length > 0 && (
              <Card className="rounded-3xl shadow-sm border-slate-200 dark:border-slate-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center">
                    <Star className="h-4 w-4 mr-1.5 text-amber-500 fill-amber-500" />
                    Connect & Review
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
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
                        className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/80 transition-all font-semibold text-sm group"
                      >
                        <span className="flex items-center space-x-2.5">
                          <IconComponent
                            className={`h-5 w-5 ${
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
                        <ArrowRight className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                      </a>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Private Feedback Form (Separate from reviews, NO rating field) */}
            <Card className="rounded-3xl shadow-sm border-slate-200 dark:border-slate-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center">
                  <MessageSquare className="h-4 w-4 mr-1.5 text-indigo-600" />
                  Message the Business
                </CardTitle>
              </CardHeader>
              <CardContent>
                {feedbackSubmitted ? (
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-center text-sm font-medium animate-in fade-in">
                    <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-600 mb-2" />
                    Thank you! Your private message has been sent directly to the business owner.
                  </div>
                ) : (
                  <form onSubmit={handleSubmitFeedback} className="space-y-3">
                    <textarea
                      rows={3}
                      maxLength={2000}
                      placeholder="Have feedback or a private enquiry? Send a message directly to the team..."
                      value={feedbackMessage}
                      onChange={(e) => setFeedbackMessage(e.target.value)}
                      className="w-full rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />

                    <label className="flex items-center space-x-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={contactBackOk}
                        onChange={(e) => setContactBackOk(e.target.checked)}
                        className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                      />
                      <span>You may contact me back regarding this message</span>
                    </label>

                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      className="w-full font-bold"
                      disabled={submittingFeedback || !feedbackMessage.trim()}
                    >
                      {submittingFeedback ? "Sending..." : "Send Private Message"}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>

            {/* Recent History List */}
            {member.recentHistory && member.recentHistory.length > 0 && (
              <Card className="rounded-3xl shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center">
                    <History className="h-4 w-4 mr-1.5 text-slate-500" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {member.recentHistory.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0 text-xs"
                    >
                      <div>
                        <span className="font-semibold capitalize text-slate-800 dark:text-slate-200">
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
                        className={`font-black text-sm ${
                          item.pointsDelta > 0 ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {item.pointsDelta > 0 ? `+${item.pointsDelta}` : item.pointsDelta} pts
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          /* Public Join Sheet / Landing View */
          <div className="space-y-5">
            {/* Value Proposition Hero */}
            <Card className="rounded-3xl text-center p-6 shadow-sm border-slate-200 dark:border-slate-800">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400 mb-3">
                <Sparkles className="h-8 w-8" />
              </span>
              <h2 className="text-2xl font-black tracking-tight">Join & Earn Rewards</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Collect {isStamps ? "stamps" : "points"} on every visit and unlock complimentary
                perks at {hubData.tenant.name}.
              </p>
            </Card>

            {/* Join Form */}
            <Card className="rounded-3xl shadow-md p-6 border-slate-200 dark:border-slate-800">
              {/* Google One-Tap / OAuth Button */}
              <div className="mb-4">
                <a
                  href={`/api/v1/auth/google?returnTo=${encodeURIComponent(`/b/${slug}`)}`}
                  className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-2xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all font-semibold text-sm shadow-sm text-slate-800 dark:text-slate-100"
                >
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
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
                  <span>Continue with Google</span>
                </a>

                <div className="flex items-center my-4">
                  <div className="flex-1 border-t border-slate-200 dark:border-slate-800" />
                  <span className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">or with email</span>
                  <div className="flex-1 border-t border-slate-200 dark:border-slate-800" />
                </div>
              </div>

              <form onSubmit={handleJoin} className="space-y-4">
                <div>
                  <label className="text-sm font-bold text-slate-800 dark:text-slate-200 block mb-1">
                    Email Address <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    type="email"
                    required
                    placeholder="name@example.com"
                    value={joinEmail}
                    onChange={(e) => setJoinEmail(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-1">
                    Your Name (Optional)
                  </label>
                  <Input
                    type="text"
                    placeholder="First & Last Name"
                    value={joinName}
                    onChange={(e) => setJoinName(e.target.value)}
                  />
                </div>

                {/* Consent Checkboxes (UK GDPR Compliance Section 13) */}
                <div className="space-y-2.5 pt-2">
                  <label className="flex items-start space-x-2.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      required
                      checked={termsAgreed}
                      onChange={(e) => setTermsAgreed(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <span>
                      I accept the programme terms and privacy policy. Points hold no cash value.
                    </span>
                  </label>

                  <label className="flex items-start space-x-2.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={marketingOptIn}
                      onChange={(e) => setMarketingOptIn(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <span>
                      (Optional) Keep me informed with special offers and programme updates.
                    </span>
                  </label>
                </div>

                <Button
                  type="submit"
                  variant="default"
                  size="lg"
                  className="w-full font-bold shadow-md"
                  disabled={joining || !joinEmail}
                >
                  {joining ? "Joining..." : "Join Programme Now"}
                </Button>
              </form>
            </Card>

            {/* Teaser Rewards */}
            {hubData.rewards.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 pl-1 block">
                  Available Rewards To Unlock
                </span>
                <div className="space-y-2">
                  {hubData.rewards.slice(0, 3).map((r) => (
                    <div
                      key={r.id}
                      className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between text-sm"
                    >
                      <div className="font-semibold">{r.title}</div>
                      <Badge variant="outline">{r.costPoints} pts</Badge>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white text-slate-900 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl relative">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute right-4 top-4 p-2 text-slate-400 hover:text-slate-900"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-xl font-black mb-1">{member.displayName}</h3>
            <p className="text-xs text-slate-500 font-mono mb-4">#{member.memberNumber}</p>

            {/* QR Image */}
            <div className="p-4 bg-white rounded-2xl border-2 border-slate-900 mx-auto inline-block shadow-sm">
              <img
                src={member.qrDataUrl}
                alt={`Member QR for ${member.memberNumber}`}
                className="w-56 h-56 mx-auto"
              />
            </div>

            <div className="mt-4 flex items-center justify-center text-xs text-slate-500 space-x-1">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>Verified Member QR • Turn brightness up</span>
            </div>

            <Button
              variant="default"
              className="w-full mt-5 font-bold"
              onClick={() => setShowQrModal(false)}
            >
              Done
            </Button>
          </div>
        </div>
      )}

      {/* Redemption Code One-Time Modal (With Live Polling) */}
      {activeRedemption && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in zoom-in-95">
          <div className="bg-white text-slate-900 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl relative">
            <button
              onClick={() => setActiveRedemption(null)}
              className="absolute right-4 top-4 p-2 text-slate-400 hover:text-slate-900"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-100 text-purple-700 mb-2">
              <Gift className="h-6 w-6" />
            </div>

            <h3 className="text-xl font-black">{activeRedemption.rewardTitle}</h3>
            <p className="text-xs text-slate-500 mb-4">Show this code to staff at checkout</p>

            <div className="my-3 py-3 px-4 bg-slate-100 rounded-2xl font-mono text-3xl font-black tracking-widest text-slate-900 border border-slate-200">
              {activeRedemption.code}
            </div>

            <div className="flex items-center justify-center space-x-1 text-xs text-amber-600 font-semibold mb-4">
              <Clock className="h-3.5 w-3.5" />
              <span>Valid for 10 minutes</span>
            </div>

            <div className="text-xs text-slate-400 flex items-center justify-center space-x-1.5 animate-pulse">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <span>Waiting for staff confirmation...</span>
            </div>
          </div>
        </div>
      )}

      {/* Redemption Success Banner */}
      {redemptionSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in zoom-in-95">
          <div className="bg-emerald-600 text-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-100 mb-3" />
            <h3 className="text-2xl font-black">Enjoy Your Reward!</h3>
            <p className="text-emerald-100 text-sm mt-2 mb-6">
              Your redemption has been confirmed by staff.
            </p>
            <Button
              variant="secondary"
              className="w-full font-bold text-emerald-950 bg-white hover:bg-emerald-50"
              onClick={() => setRedemptionSuccess(false)}
            >
              Back to My Hub
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
