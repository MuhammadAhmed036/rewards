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
  Store,
  Smartphone,
  User,
  Lock,
  Mail,
  LogOut,
  AlertCircle,
  LogIn,
  UserPlus,
  ExternalLink,
  ChevronRight,
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

  // Store Role Tab Switcher: "customer" | "staff" | "owner"
  const [activePortalRole, setActivePortalRole] = useState<"customer" | "staff" | "owner">("customer");

  // Customer sub-tab: "join" (Sign up) vs "signin" (Existing member)
  const [customerAuthMode, setCustomerAuthMode] = useState<"join" | "signin">("join");

  // Customer Join Form State
  const [joinEmail, setJoinEmail] = useState("");
  const [joinName, setJoinName] = useState("");
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [joining, setJoining] = useState(false);

  // Customer Existing Member Sign In State
  const [customerLoginEmail, setCustomerLoginEmail] = useState("");
  const [customerLoginPassword, setCustomerLoginPassword] = useState("");
  const [customerLoggingIn, setCustomerLoggingIn] = useState(false);

  // Staff Login State
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffLoggingIn, setStaffLoggingIn] = useState(false);

  // Owner Login State
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [ownerLoggingIn, setOwnerLoggingIn] = useState(false);

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

  // Scanned Promotional QR Code State
  const [scannedClaimCode, setScannedClaimCode] = useState<string | null>(null);
  const [scannedOfferInfo, setScannedOfferInfo] = useState<{
    code: string;
    title: string;
    offerType: string;
    pointsToAward?: number;
    productRewardName?: string;
    discountPercent?: number;
    status: string;
    isExpired: boolean;
    isDeactivated: boolean;
  } | null>(null);
  const [claimStatus, setClaimStatus] = useState<"idle" | "prompt" | "claiming" | "success" | "error">("idle");
  const [claimResult, setClaimResult] = useState<{
    campaignTitle: string;
    message: string;
    pointsAwarded?: number;
    productRewardName?: string;
    newBalance?: number;
    isIntermediateVisit?: boolean;
    isPendingClaim?: boolean;
    currentVisit?: number;
    requiredVisits?: number;
    visitsRemaining?: number;
  } | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

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

  const handleClaimPromoQr = useCallback(
    async (codeToClaim?: string, explicitMemberId?: string, explicitTenantId?: string) => {
      const code = codeToClaim || scannedClaimCode;
      const memId = explicitMemberId || hubData?.member?.membershipId;
      const tenId = explicitTenantId || hubData?.tenant?.id;
      if (!code || !tenId || !memId) return;

      setClaimStatus("claiming");
      setClaimError(null);
      try {
        const res = await fetch("/api/v1/customer/claim-promo-qr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId: tenId,
            code,
            membershipId: memId,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error?.message || "Failed to claim promotional offer");
        }
        setClaimResult(json.data);
        setClaimStatus("success");
        // Reload balance and ledger history
        await fetchHubData();
      } catch (err) {
        setClaimError(err instanceof Error ? err.message : "Failed to claim offer");
        setClaimStatus("error");
      }
    },
    [scannedClaimCode, hubData, fetchHubData]
  );

  // Read URL query param ?claimQr=...
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("claimQr");
      if (code) {
        setScannedClaimCode(code);
        fetch(`/api/v1/customer/claim-promo-qr?slug=${encodeURIComponent(slug)}&code=${encodeURIComponent(code)}`)
          .then((res) => res.json())
          .then((json) => {
            if (json.data) {
              setScannedOfferInfo(json.data);
              if (json.data.isExpired) {
                setClaimStatus("error");
                setClaimError("This promotional QR code has expired.");
              } else if (json.data.isDeactivated) {
                setClaimStatus("error");
                setClaimError("This promotional QR code was deactivated by the business manager.");
              } else if (hubData?.member) {
                setClaimStatus("prompt");
              }
            }
          })
          .catch((e) => console.error("Error reading claim QR info", e));
      }
    }
  }, [slug, hubData?.member]);

  // Handle New Customer Join
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
      const updatedHubRes = await fetch(`/api/v1/customer/hub-data?slug=${encodeURIComponent(slug)}`);
      const updatedHubJson = await updatedHubRes.json();
      if (updatedHubRes.ok && updatedHubJson.data) {
        setHubData(updatedHubJson.data);
        if (scannedClaimCode && updatedHubJson.data.member) {
          handleClaimPromoQr(scannedClaimCode, updatedHubJson.data.member.membershipId, updatedHubJson.data.tenant.id);
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Join error");
    } finally {
      setJoining(false);
    }
  };

  // Handle Existing Customer Sign In
  const handleCustomerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerLoginEmail.trim() || !customerLoginPassword.trim()) {
      setErrorMsg("Please enter email and password.");
      return;
    }
    setCustomerLoggingIn(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: customerLoginEmail.trim(),
          password: customerLoginPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Invalid customer credentials");
      const updatedHubRes = await fetch(`/api/v1/customer/hub-data?slug=${encodeURIComponent(slug)}`);
      const updatedHubJson = await updatedHubRes.json();
      if (updatedHubRes.ok && updatedHubJson.data) {
        setHubData(updatedHubJson.data);
        if (scannedClaimCode && updatedHubJson.data.member) {
          handleClaimPromoQr(scannedClaimCode, updatedHubJson.data.member.membershipId, updatedHubJson.data.tenant.id);
        }
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to sign in as customer");
    } finally {
      setCustomerLoggingIn(false);
    }
  };

  // Handle Staff Sign In (credentials provisioned by business owner)
  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffEmail.trim() || !staffPassword.trim()) {
      setErrorMsg("Please enter staff email and password.");
      return;
    }
    setStaffLoggingIn(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: staffEmail.trim(),
          password: staffPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Invalid staff credentials");
      // Redirect to staff scanner terminal
      window.location.href = "/staff";
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Staff sign in failed");
    } finally {
      setStaffLoggingIn(false);
    }
  };

  // Handle Business Owner Sign In
  const handleOwnerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerEmail.trim() || !ownerPassword.trim()) {
      setErrorMsg("Please enter owner email and password.");
      return;
    }
    setOwnerLoggingIn(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: ownerEmail.trim(),
          password: ownerPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error?.code === "PENDING_APPROVAL") {
          throw new Error("⏳ Your business registration is pending approval by the Super Admin.");
        }
        throw new Error(json.error?.message || "Invalid owner credentials");
      }
      // Redirect to owner dashboard
      window.location.href = "/dashboard";
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Owner sign in failed");
    } finally {
      setOwnerLoggingIn(false);
    }
  };

  // Handle Customer Sign Out
  const handleSignOut = async () => {
    try {
      await fetch("/api/v1/auth/logout", { method: "POST" });
      await fetchHubData();
    } catch (err) {
      console.error(err);
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center space-y-3">
          <div className="h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-500">Loading store portal...</p>
        </div>
      </div>
    );
  }

  if (errorMsg && !hubData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <Card className="max-w-md w-full text-center p-6 bg-white rounded-3xl border border-slate-200 shadow-xl">
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
      className="min-h-screen bg-[#f8fafc] text-slate-900 pb-20 selection:bg-indigo-500 selection:text-white flex flex-col justify-between"
      style={{ "--brand": brandColor } as React.CSSProperties}
    >
      {/* Brand Header - Full Enterprise Widescreen Bar */}
      <div>
        <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/95 backdrop-blur-md px-4 sm:px-6 lg:px-8 py-4 shadow-2xs">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Store Brand Info */}
            <div className="flex items-center space-x-3.5">
              <span
                className="flex h-12 w-12 items-center justify-center rounded-2xl text-white font-black text-xl shadow-md shrink-0"
                style={{ backgroundColor: brandColor || "#4f46e5" }}
              >
                {hubData.tenant.name.slice(0, 1)}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-black text-lg text-slate-900 leading-tight tracking-tight">
                    {hubData.tenant.name}
                  </h1>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 uppercase">
                    Official Store
                  </span>
                </div>
                <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  {hubData.programme.name} • {isStamps ? "Stamps Programme" : "Points Programme"}
                </span>
              </div>
            </div>

            {/* Header Right Actions / Role Switcher */}
            <div className="flex items-center gap-3 self-end sm:self-auto">
              {/* Role Navigation Switcher (Customer / Staff / Owner) */}
              <div className="flex bg-slate-100 p-1 border border-slate-200 rounded-2xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setActivePortalRole("customer");
                    setErrorMsg(null);
                  }}
                  className={`py-1.5 px-3 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                    activePortalRole === "customer"
                      ? "bg-white text-indigo-700 shadow-2xs font-black"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  Customer Pass
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActivePortalRole("staff");
                    setErrorMsg(null);
                  }}
                  className={`py-1.5 px-3 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                    activePortalRole === "staff"
                      ? "bg-white text-indigo-700 shadow-2xs font-black"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  Staff Scanner
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActivePortalRole("owner");
                    setErrorMsg(null);
                  }}
                  className={`py-1.5 px-3 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                    activePortalRole === "owner"
                      ? "bg-white text-indigo-700 shadow-2xs font-black"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Store className="w-3.5 h-3.5" />
                  Owner Portal
                </button>
              </div>

              {/* Logged in customer quick controls */}
              {member && activePortalRole === "customer" && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setShowQrModal(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-sm cursor-pointer"
                  >
                    <QrCode className="h-4 w-4 mr-1.5" />
                    Show QR
                  </Button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    title="Sign Out"
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Body - Full Enterprise Responsive Container */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {/* Error notification banner */}
          {errorMsg && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs flex justify-between items-center shadow-xs">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="font-semibold">{errorMsg}</span>
              </div>
              <button onClick={() => setErrorMsg(null)} className="font-bold underline ml-2 cursor-pointer">
                Dismiss
              </button>
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW 1: CUSTOMER VIEW                                    */}
          {/* ======================================================== */}
          {activePortalRole === "customer" && (
            <>
              {/* Promotional QR Scanned Banner for Non-Logged-in Customers */}
              {scannedOfferInfo && !member && (
                <div className="p-5 rounded-3xl bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 text-white shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center font-black text-2xl shrink-0">
                      🎁
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-white/20 text-white tracking-wider">
                          Promotional Offer Scanned
                        </span>
                        {scannedOfferInfo.isExpired ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white">
                            Expired
                          </span>
                        ) : scannedOfferInfo.isDeactivated ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white">
                            Deactivated
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-400 text-slate-900">
                            Available Now
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-black text-white mt-1">{scannedOfferInfo.title}</h3>
                      <p className="text-xs text-white/90 mt-0.5">
                        {scannedOfferInfo.isExpired || scannedOfferInfo.isDeactivated
                          ? "This promotional QR code is no longer active."
                          : "Join or Sign in below to instantly credit this perk directly to your pass!"}
                      </p>
                    </div>
                  </div>

                  {!scannedOfferInfo.isExpired && !scannedOfferInfo.isDeactivated && (
                    <span className="px-3.5 py-1.5 rounded-xl bg-white/20 backdrop-blur-sm text-white font-mono text-xs font-bold border border-white/30 shrink-0">
                      Auto-claims upon sign in
                    </span>
                  )}
                </div>
              )}

              {/* Promotional Claim Prompt Modal for Logged-In Member */}
              {claimStatus === "prompt" && member && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in">
                  <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl relative border border-slate-200">
                    <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center mx-auto mb-3 text-3xl shadow-inner">
                      🎁
                    </div>
                    <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                      Promotional Offer Detected
                    </span>

                    <h3 className="text-lg font-black text-slate-950 mt-2 mb-1">
                      {scannedOfferInfo?.title || "Special Store Offer"}
                    </h3>
                    <p className="text-xs text-slate-500 mb-4">
                      {scannedOfferInfo?.offerType === "free_product" && (
                        <span className="font-bold text-purple-700">
                          Free Item: {scannedOfferInfo.productRewardName || "Perk"}
                        </span>
                      )}
                      {scannedOfferInfo?.offerType === "points_bonus" && (
                        <span className="font-bold text-emerald-700">
                          +{scannedOfferInfo.pointsToAward} Bonus Points
                        </span>
                      )}
                      {scannedOfferInfo?.offerType === "stamps_bonus" && (
                        <span className="font-bold text-amber-700">+1 Free Stamp</span>
                      )}
                      {scannedOfferInfo?.offerType === "discount_promo" && (
                        <span className="font-bold text-rose-700">{scannedOfferInfo.discountPercent}% OFF</span>
                      )}
                    </p>

                    <div className="space-y-2">
                      <Button
                        onClick={() => handleClaimPromoQr()}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl py-3 text-xs shadow-md cursor-pointer"
                      >
                        Claim Offer to My Pass →
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setClaimStatus("idle")}
                        className="w-full text-xs text-slate-400 hover:text-slate-600"
                      >
                        Maybe Later
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Claim Success Celebration Modal */}
              {claimStatus === "success" && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in">
                  <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl relative border border-emerald-300">
                    {/* Intermediate visit state */}
                    {claimResult?.isIntermediateVisit ? (
                      <>
                        <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3 shadow-inner">
                          <Sparkles className="w-8 h-8" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                          Visit {claimResult.currentVisit} of {claimResult.requiredVisits} Recorded
                        </span>
                        <h3 className="text-lg font-black text-slate-950 mt-2 mb-1">
                          Stamp Recorded! ☕
                        </h3>
                        <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                          {claimResult.message}
                        </p>

                        {/* Punch card visual progression dots */}
                        <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200 mb-4">
                          <p className="text-[10px] font-bold text-amber-900 uppercase tracking-wider mb-2">
                            Progress to Free Perk ({claimResult.currentVisit}/{claimResult.requiredVisits})
                          </p>
                          <div className="flex items-center justify-center gap-2">
                            {Array.from({ length: claimResult.requiredVisits || 3 }).map((_, idx) => {
                              const isCompleted = idx < (claimResult.currentVisit || 0);
                              return (
                                <div
                                  key={idx}
                                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs transition-all ${
                                    isCompleted
                                      ? "bg-amber-500 text-white shadow-md scale-105"
                                      : "bg-white text-slate-400 border-2 border-dashed border-amber-300"
                                  }`}
                                >
                                  {isCompleted ? "✓" : idx + 1}
                                </div>
                              );
                            })}
                          </div>
                          <p className="text-[11px] text-amber-800 font-medium mt-2">
                            Just {claimResult.visitsRemaining} more purchase to claim your free reward!
                          </p>
                        </div>
                      </>
                    ) : claimResult?.isPendingClaim ? (
                      /* Final visit / Goal reached - Waiting for counter staff approval */
                      <>
                        <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3 shadow-inner animate-bounce">
                          <Gift className="w-8 h-8" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                          🎉 Reward Unlocked!
                        </span>
                        <h3 className="text-lg font-black text-slate-950 mt-2 mb-1">
                          Show Counter Staff!
                        </h3>
                        <p className="text-xs text-slate-600 mb-3 leading-relaxed">
                          {claimResult.message}
                        </p>

                        <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 font-medium mb-4 flex items-center gap-2 text-left">
                          <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>Staff or Owner will tap <strong>Approve & Give Perk</strong> on their terminal to hand you your reward.</span>
                        </div>
                      </>
                    ) : (
                      /* Standard instant reward */
                      <>
                        <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3 shadow-inner">
                          <CheckCircle2 className="w-8 h-8" />
                        </div>
                        <h3 className="text-lg font-black text-slate-950 mb-1">Offer Claimed!</h3>
                        <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                          {claimResult?.message || "Your offer has been credited to your pass."}
                        </p>
                        {claimResult?.newBalance !== undefined && (
                          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 mb-4 text-xs">
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Updated Balance</span>
                            <span className="text-xl font-black text-slate-900">{claimResult.newBalance} pts</span>
                          </div>
                        )}
                      </>
                    )}

                    <Button
                      onClick={() => {
                        setClaimStatus("idle");
                        setScannedClaimCode(null);
                        setScannedOfferInfo(null);
                      }}
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl py-2.5 text-xs shadow-md cursor-pointer"
                    >
                      View Digital Pass →
                    </Button>
                  </div>
                </div>
              )}

              {/* Claim Error / Expired Modal */}
              {claimStatus === "error" && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in">
                  <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl relative border border-rose-200">
                    <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3 shadow-inner">
                      <AlertCircle className="w-8 h-8" />
                    </div>

                    <h3 className="text-lg font-black text-slate-950 mb-1">Offer Unavailable</h3>
                    <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                      {claimError || "This promotional QR code has expired or was deactivated by the business manager."}
                    </p>

                    <Button
                      variant="outline"
                      onClick={() => {
                        setClaimStatus("idle");
                        setScannedClaimCode(null);
                        setScannedOfferInfo(null);
                      }}
                      className="w-full font-bold rounded-xl py-2.5 text-xs border-slate-300 cursor-pointer"
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              )}

              {member ? (
                /* LOGGED IN CUSTOMER ENTERPRISE 2-COLUMN VIEW */
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                  {/* Left Column: Digital Pass & Quick Links (5 cols) */}
                  <div className="lg:col-span-5 space-y-6">
                    {/* Apple Wallet Style Digital Pass Card */}
                    <div className="rounded-3xl border border-slate-200/90 shadow-xl overflow-hidden bg-white">
                      <div
                        className="p-7 text-white relative overflow-hidden"
                        style={{
                          background: `linear-gradient(135deg, ${brandColor || "#1e1b4b"} 0%, #0f172a 100%)`,
                        }}
                      >
                        <div className="absolute -top-10 -right-10 w-44 h-44 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>

                        <div className="flex justify-between items-start relative z-10">
                          <div>
                            <span className="text-[10px] uppercase tracking-wider text-slate-300 font-extrabold block">
                              {isStamps ? "Verified Stamp Card" : "Loyalty Points Balance"}
                            </span>
                            <div className="text-4xl font-black mt-1.5 tracking-tight text-white tabular-nums">
                              {member.balance}{" "}
                              <span className="text-xl font-bold font-sans text-slate-300">
                                {isStamps ? "stamps" : "pts"}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-slate-300 font-mono block">
                              #{member.memberNumber}
                            </span>
                            <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-white/15 backdrop-blur-md text-white text-[10px] font-bold border border-white/20">
                              Verified Pass
                            </span>
                          </div>
                        </div>

                        {/* Stamp Grid or Progress Bar */}
                        {isStamps ? (
                          <div className="mt-7 pt-4 border-t border-white/15 relative z-10">
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
                          <div className="mt-7 pt-4 border-t border-white/15 relative z-10">
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

                      {/* Card Bottom Toolbar */}
                      <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 pl-2">
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

                    {/* Official Reviews & Social Links (Anti-Gating Compliant) */}
                    {hubData.links.length > 0 && (
                      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                          <h3 className="text-sm font-black text-slate-900 flex items-center">
                            <Star className="h-4 w-4 mr-1.5 text-amber-500 fill-amber-500" />
                            Official Reviews &amp; Social Links
                          </h3>
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            Anti-Gating Compliant
                          </span>
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

                    {/* Direct Private Message to Manager */}
                    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <h3 className="text-sm font-black text-slate-900 flex items-center">
                          <MessageSquare className="h-4 w-4 mr-1.5 text-indigo-600" />
                          Direct Message to Business
                        </h3>
                        <span className="text-[10px] font-bold text-slate-400">Private &amp; Confidential</span>
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
                  </div>

                  {/* Right Column: Available Rewards Grid & Ledger History (7 cols) */}
                  <div className="lg:col-span-7 space-y-6">
                    {/* Programme Rewards Grid */}
                    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-7 space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                        <div>
                          <h3 className="text-base font-black text-slate-900 flex items-center">
                            <Gift className="h-5 w-5 mr-2 text-indigo-600" />
                            Available Programme Rewards
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Claim complimentary perks using your verified balance
                          </p>
                        </div>
                        <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200">
                          {hubData.rewards.length} Rewards Active
                        </span>
                      </div>

                      {hubData.rewards.length === 0 ? (
                        <div className="py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                          <Gift className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                          <p className="text-xs font-bold text-slate-600">Rewards are currently being curated.</p>
                          <p className="text-[11px] text-slate-400 mt-1">Check back shortly to claim perks with your balance!</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          {hubData.rewards.map((reward) => (
                            <div
                              key={reward.id}
                              className="p-4 rounded-2xl border border-slate-200/90 bg-slate-50/50 hover:bg-white hover:border-indigo-400 hover:shadow-md transition-all flex flex-col justify-between shadow-2xs"
                            >
                              <div>
                                <div className="font-extrabold text-sm text-slate-900 leading-snug">{reward.title}</div>
                                {reward.description && (
                                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                                    {reward.description}
                                  </p>
                                )}
                              </div>

                              <div className="mt-4 pt-3 border-t border-slate-200/70 flex items-center justify-between">
                                <span className="text-xs font-black text-indigo-700">
                                  {reward.costPoints} {isStamps ? "stamps" : "points"}
                                </span>

                                {reward.eligible ? (
                                  <Button
                                    variant="default"
                                    size="sm"
                                    className="font-black text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs cursor-pointer"
                                    onClick={() =>
                                      handleStartRedeem(reward.id, reward.title, reward.costPoints)
                                    }
                                  >
                                    Claim Reward →
                                  </Button>
                                ) : (
                                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">
                                    Need {reward.pointsShortfall} more
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Member Transaction History */}
                    {member.recentHistory && member.recentHistory.length > 0 && (
                      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-7 space-y-4">
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
                              className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-100 bg-slate-50/60 text-xs shadow-2xs"
                            >
                              <div>
                                <span className="font-bold capitalize text-slate-800">
                                  {item.type}
                                </span>
                                <span className="text-slate-400 block text-[11px] mt-0.5">
                                  {new Date(item.occurredAt).toLocaleDateString([], {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>
                              <span
                                className={`font-black text-base tabular-nums ${
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
                </div>
              ) : (
                /* PUBLIC CUSTOMER JOIN / SIGN IN ENTERPRISE 2-COLUMN VIEW */
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                  {/* Left Column: Store Value Proposition & Teaser Rewards (6 cols) */}
                  <div className="lg:col-span-6 space-y-6">
                    <div className="bg-white rounded-3xl border border-slate-200/90 p-8 shadow-sm relative overflow-hidden">
                      <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mb-4 shadow-xs">
                        <Sparkles className="h-7 w-7 text-amber-500" />
                      </div>

                      <h2 className="text-3xl font-black text-slate-900 tracking-tight leading-tight">
                        Join {hubData.tenant.name} &amp; Collect Rewards
                      </h2>

                      <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                        Earn {isStamps ? "stamps" : "loyalty points"} every time you make a purchase at our store. Exchange your balance for complimentary food, drinks, and VIP perks.
                      </p>

                      <div className="mt-6 pt-5 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-500">
                        <div className="flex items-center gap-1.5 font-bold text-slate-700">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          Instant Digital Pass
                        </div>
                        <div className="flex items-center gap-1.5 font-bold text-slate-700">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          No App Download Needed
                        </div>
                      </div>
                    </div>

                    {/* Featured Rewards Preview */}
                    {hubData.rewards.length > 0 && (
                      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 space-y-3">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block">
                          Featured Rewards to Unlock
                        </span>
                        <div className="space-y-2.5">
                          {hubData.rewards.slice(0, 4).map((r) => (
                            <div
                              key={r.id}
                              className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 flex items-center justify-between text-xs shadow-2xs"
                            >
                              <div className="font-bold text-slate-900">{r.title}</div>
                              <Badge variant="outline" className="font-bold bg-white text-indigo-700 border-indigo-200">
                                {r.costPoints} {isStamps ? "stamps" : "pts"}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Customer Join / Sign In Card (6 cols) */}
                  <div className="lg:col-span-6">
                    <div className="bg-white rounded-3xl shadow-xl p-8 border border-slate-200/90 space-y-5">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                        <div>
                          <h3 className="text-xl font-black text-slate-900">
                            {customerAuthMode === "join" ? "Get Your Digital Pass" : "Customer Sign In"}
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {customerAuthMode === "join"
                              ? "Enter details below to launch your digital pass"
                              : "Enter your email & password to view balance and rewards"}
                          </p>
                        </div>

                        {/* Customer Mode Switcher */}
                        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
                          <button
                            type="button"
                            onClick={() => setCustomerAuthMode("join")}
                            className={`py-1.5 px-3 rounded-lg transition-all cursor-pointer ${
                              customerAuthMode === "join"
                                ? "bg-white text-indigo-700 shadow-2xs font-black"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            Join (New)
                          </button>
                          <button
                            type="button"
                            onClick={() => setCustomerAuthMode("signin")}
                            className={`py-1.5 px-3 rounded-lg transition-all cursor-pointer ${
                              customerAuthMode === "signin"
                                ? "bg-white text-indigo-700 shadow-2xs font-black"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            Sign In
                          </button>
                        </div>
                      </div>

                      {/* Google Quick Join Button */}
                      <div>
                        <a
                          href={`/api/v1/auth/google?role=customer&returnTo=${encodeURIComponent(`/b/${slug}`)}`}
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
                          <span>
                            {customerAuthMode === "join" ? "Quick Join with Google" : "Sign in with Google"}
                          </span>
                        </a>

                        <div className="flex items-center my-4">
                          <div className="flex-1 border-t border-slate-200" />
                          <span className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                            or with email
                          </span>
                          <div className="flex-1 border-t border-slate-200" />
                        </div>
                      </div>

                      {customerAuthMode === "join" ? (
                        /* JOIN FORM */
                        <form onSubmit={handleJoin} className="space-y-4">
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
                            className="w-full font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md h-12 cursor-pointer"
                            disabled={joining || !joinEmail}
                          >
                            {joining ? "Generating Digital Pass..." : "Join & Get My Pass →"}
                          </Button>
                        </form>
                      ) : (
                        /* SIGN IN FORM */
                        <form onSubmit={handleCustomerLogin} className="space-y-4">
                          <div>
                            <label className="text-xs font-bold text-slate-800 block mb-1">
                              Email Address
                            </label>
                            <Input
                              type="email"
                              required
                              placeholder="customer@example.com"
                              value={customerLoginEmail}
                              onChange={(e) => setCustomerLoginEmail(e.target.value)}
                              className="text-xs rounded-xl bg-slate-50 border-slate-200"
                            />
                          </div>

                          <div>
                            <label className="text-xs font-bold text-slate-800 block mb-1">
                              Password
                            </label>
                            <Input
                              type="password"
                              required
                              placeholder="••••••••"
                              value={customerLoginPassword}
                              onChange={(e) => setCustomerLoginPassword(e.target.value)}
                              className="text-xs rounded-xl bg-slate-50 border-slate-200"
                            />
                          </div>

                          <Button
                            type="submit"
                            variant="default"
                            size="lg"
                            className="w-full font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md h-12 cursor-pointer"
                            disabled={customerLoggingIn || !customerLoginEmail || !customerLoginPassword}
                          >
                            {customerLoggingIn ? "Signing In..." : "Sign In to View Pass →"}
                          </Button>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ======================================================== */}
          {/* VIEW 2: FRONTLINE STAFF LOGIN (ENTERPRISE SPREAD)         */}
          {/* ======================================================== */}
          {activePortalRole === "staff" && (
            <div className="max-w-2xl mx-auto bg-white rounded-3xl shadow-xl p-8 border border-slate-200/90 space-y-6">
              <div className="text-center pb-3 border-b border-slate-100">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-3 shadow-xs">
                  <Smartphone className="w-7 h-7" />
                </div>
                <h2 className="text-2xl font-black text-slate-900">Frontline Staff Scanner Terminal</h2>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Enter your frontline staff credentials provisioned by {hubData.tenant.name} to launch the high-speed optical barcode/QR terminal.
                </p>
              </div>

              <form onSubmit={handleStaffLogin} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Staff Email Address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <Input
                      type="email"
                      required
                      placeholder="staff@store.com"
                      value={staffEmail}
                      onChange={(e) => setStaffEmail(e.target.value)}
                      className="pl-10 text-xs rounded-xl bg-slate-50 border-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Staff Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <Input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={staffPassword}
                      onChange={(e) => setStaffPassword(e.target.value)}
                      className="pl-10 text-xs rounded-xl bg-slate-50 border-slate-200"
                    />
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 leading-relaxed">
                  <span className="font-bold text-slate-800">Quick 1-Click Demo Staff Logins:</span> Use{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setStaffEmail("coffee-staff@platform.local");
                      setStaffPassword("Password123!");
                    }}
                    className="font-mono text-indigo-600 font-bold hover:underline cursor-pointer"
                  >
                    coffee-staff@platform.local
                  </button>{" "}
                  or{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setStaffEmail("barber-staff@platform.local");
                      setStaffPassword("Password123!");
                    }}
                    className="font-mono text-indigo-600 font-bold hover:underline cursor-pointer"
                  >
                    barber-staff@platform.local
                  </button>
                </div>

                <Button
                  type="submit"
                  variant="default"
                  size="lg"
                  className="w-full font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md h-12 cursor-pointer"
                  disabled={staffLoggingIn || !staffEmail || !staffPassword}
                >
                  {staffLoggingIn ? "Authenticating Staff..." : "Launch Staff Terminal →"}
                </Button>
              </form>
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW 3: BUSINESS OWNER PORTAL LOGIN                      */}
          {/* ======================================================== */}
          {activePortalRole === "owner" && (
            <div className="max-w-2xl mx-auto bg-white rounded-3xl shadow-xl p-8 border border-slate-200/90 space-y-6">
              <div className="text-center pb-3 border-b border-slate-100">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-3 shadow-xs">
                  <Store className="w-7 h-7" />
                </div>
                <h2 className="text-2xl font-black text-slate-900">Store Owner Dashboard</h2>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Access store analytics, product catalog, today&apos;s discounts, staff RBAC credentials, and customer ledger.
                </p>
              </div>

              <form onSubmit={handleOwnerLogin} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Owner Email Address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <Input
                      type="email"
                      required
                      placeholder="owner@store.com"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      className="pl-10 text-xs rounded-xl bg-slate-50 border-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <Input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={ownerPassword}
                      onChange={(e) => setOwnerPassword(e.target.value)}
                      className="pl-10 text-xs rounded-xl bg-slate-50 border-slate-200"
                    />
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 leading-relaxed">
                  <span className="font-bold text-slate-800">Quick 1-Click Demo Owner Logins:</span> Use{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setOwnerEmail("coffee-owner@platform.local");
                      setOwnerPassword("Password123!");
                    }}
                    className="font-mono text-indigo-600 font-bold hover:underline cursor-pointer"
                  >
                    coffee-owner@platform.local
                  </button>{" "}
                  or{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setOwnerEmail("barber-owner@platform.local");
                      setOwnerPassword("Password123!");
                    }}
                    className="font-mono text-indigo-600 font-bold hover:underline cursor-pointer"
                  >
                    barber-owner@platform.local
                  </button>
                </div>

                <Button
                  type="submit"
                  variant="default"
                  size="lg"
                  className="w-full font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md h-12 cursor-pointer"
                  disabled={ownerLoggingIn || !ownerEmail || !ownerPassword}
                >
                  {ownerLoggingIn ? "Opening Portal..." : "Open Owner Dashboard →"}
                </Button>
              </form>
            </div>
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 bg-white py-4 px-4 sm:px-6 lg:px-8 mt-12">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <span>&copy; {new Date().getFullYear()} {hubData.tenant.name} • LoyaltyEngine Infrastructure</span>
          <div className="flex items-center space-x-4">
            <a href="/" className="hover:text-slate-800">Platform Portal</a>
            <a href={`/b/${slug}`} className="hover:text-slate-800">Storefront Pass</a>
          </div>
        </div>
      </footer>

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
