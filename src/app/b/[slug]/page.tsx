"use client";

import React, { useState, useEffect, use, useCallback } from "react";
import { loginRequest } from "@/lib/security-client";
import { isOffline, OFFLINE_MESSAGE } from "@/lib/use-online";
import { langFromLocale, t as translate, type Lang, type MessageKey } from "@/lib/i18n";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  QrCode,
  Gift,
  Star,
  Globe,
  History,
  CheckCircle2,
  Clock,
  Sparkles,
  X,
  Plus,
  Minus,
  ArrowUpRight,
  Store,
  Smartphone,
  User,
  Lock,
  Mail,
  LogOut,
  AlertCircle,
} from "lucide-react";
import { InstagramIcon, FacebookIcon } from "@/components/ui/icons";
import { BusinessLogo } from "@/components/brand/BusinessLogo";
import { StampCard, type StampCardData } from "@/components/loyalty/StampCard";
import { CustomerChat } from "@/components/chat/CustomerChat";
import { PointsMenu } from "@/components/rewards/PointsMenu";
import { MemberCard3D } from "@/components/loyalty/MemberCard3D";
import { ReportProblem } from "@/components/loyalty/ReportProblem";

interface HubPayload {
  tenant: {
    id: string;
    slug: string;
    name: string;
    brandPrimaryHex: string;
    logoUrl?: string | null;
    locale?: string;
  };
  programme: {
    name: string;
    type: "points" | "stamps";
    status?: "published" | "paused";
    earningRule?: string | null;
    expiryRule?: string | null;
    activeBoost?: { label: string; percent: number; endsAt: string | null } | null;
    tierLevels?: Array<{ name: string; minPoints: number; earnPercent: number }>;
    tierMonths?: number;
    referralPoints?: number;
  };
  member: {
    membershipId: string;
    memberNumber: string;
    displayName: string;
    balance: number;
    lifetimeEarned: number;
    qrToken: string;
    qrDataUrl: string;
    stampCards?: StampCardData[];
    rotatingQr?: boolean;
    tier?: { name: string | null; earnPercent: number; next: string | null; pointsToNext: number; earnedInWindow: number } | null;
    referralCode?: string;
    recentHistory: Array<{
      id: string;
      type: string;
      pointsDelta: number;
      note?: string | null;
      occurredAt: string;
    }>;
  } | null;
  rewards: Array<{
    id: string;
    title: string;
    costPoints: number;
    eligible: boolean;
    pointsShortfall: number;
    unavailableReason?: string | null;
    timesRedeemed?: number;
    description?: string | null;
    productName?: string | null;
  }>;
  links: Array<{
    id: string;
    type: string;
    label: string;
    url: string;
  }>;
}

/** Plain words for a points-history row, e.g. "Free Tea" instead of "redeem". */
function historyLabel(item: { type: string; pointsDelta: number; note?: string | null }) {
  if (item.type === "redeem") return item.note ? `Used on ${item.note}` : "Reward claimed";
  if (item.type === "earn") return item.note || "Points earned";
  if (item.type === "adjust") return item.pointsDelta > 0 ? "Points added by the shop" : "Points removed by the shop";
  if (item.type === "reverse") return "Correction";
  if (item.type === "expire") return "Points expired";
  return item.type;
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
  const [joinPassword, setJoinPassword] = useState("");
  const [joinName, setJoinName] = useState("");
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [joining, setJoining] = useState(false);
  // A friend's invite link carries their code: ?ref=ABCD1234
  const [refCode, setRefCode] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  // Text follows the shop's own language setting (English unless the shop chose otherwise)
  // A live QR code changes every 30 seconds, so keep the card's copy fresh while it is open
  const liveQr = hubData?.member?.rotatingQr;
  useEffect(() => {
    if (!liveQr) return;
    const refresh = async () => {
      if (document.hidden) return;
      const res = await fetch(`/api/v1/customer/qr?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      if (!res.ok) return;
      const { data } = await res.json();
      setHubData((prev) => (prev && prev.member ? { ...prev, member: { ...prev.member, qrToken: data.qrToken, qrDataUrl: data.qrDataUrl } } : prev));
    };
    const timer = setInterval(refresh, 25_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [liveQr, slug]);
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("ref");
    if (r) setRefCode(r.toUpperCase().slice(0, 16));
  }, []);

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
  // The member card flips over to show the QR code staff scan
  const [cardFlipped, setCardFlipped] = useState(false);

  // Redemption Modal & Polling
  const [activeRedemption, setActiveRedemption] = useState<{
    id: string;
    code: string;
    rewardTitle: string;
    costPoints: number;
    expiresAt: string;
  } | null>(null);
  const [redemptionSuccess, setRedemptionSuccess] = useState(false);
  const [redemptionQrUrl, setRedemptionQrUrl] = useState<string | null>(null);
  const [redemptionTimeLeft, setRedemptionTimeLeft] = useState<string>("");
  const [redemptionExpired, setRedemptionExpired] = useState<boolean>(false);

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
    isReady?: boolean;
    card?: StampCardData;
  } | null>(null);
  const [claimingOfferId, setClaimingOfferId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const fetchHubData = useCallback(async (opts: { silent?: boolean } = {}) => {
    try {
      const res = await fetch(`/api/v1/customer/hub-data?slug=${encodeURIComponent(slug)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Failed to load business");
      setHubData(json.data);
    } catch (err) {
      if (!opts.silent) setErrorMsg(err instanceof Error ? err.message : "Error loading business");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchHubData();
  }, [fetchHubData]);

  // Keep stamp cards and balance live while the customer has the page open
  // (staff add stamps and hand over rewards from the till).
  const signedIn = Boolean(hubData?.member);

  // A signed-in customer only ever sees the customer view
  useEffect(() => {
    if (signedIn) setActivePortalRole("customer");
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    const refresh = () => {
      if (document.visibilityState === "visible") fetchHubData({ silent: true });
    };
    const interval = setInterval(refresh, 10000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [signedIn, fetchHubData]);

  // Customer claims a full stamp card
  const handleClaimStampCard = useCallback(
    async (offerId: string) => {
      const memId = hubData?.member?.membershipId;
      if (!memId) return;
      setClaimingOfferId(offerId);
      setErrorMsg(null);
      try {
        const res = await fetch("/api/v1/customer/stamp-cards/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ membershipId: memId, offerId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error?.message || "Couldn't claim this reward");
        if (claimResult?.card?.offerId === offerId) {
          setClaimResult({ ...claimResult, card: json.data, isReady: false, isPendingClaim: true });
        }
        await fetchHubData({ silent: true });
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Couldn't claim this reward");
      } finally {
        setClaimingOfferId(null);
      }
    },
    [hubData?.member?.membershipId, claimResult, fetchHubData]
  );

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

  // Generate QR & Live Countdown for active redemption voucher
  useEffect(() => {
    if (!activeRedemption) {
      setRedemptionQrUrl(null);
      setRedemptionTimeLeft("");
      setRedemptionExpired(false);
      return;
    }

    import("qrcode")
      .then((QRCode) => {
        QRCode.toDataURL(activeRedemption.code, { margin: 1, width: 220 })
          .then(setRedemptionQrUrl)
          .catch((e) => console.error("QR gen error", e));
      })
      .catch((e) => console.error("QRCode import error", e));

    const updateCountdown = () => {
      const diff = new Date(activeRedemption.expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setRedemptionTimeLeft("00:00");
        setRedemptionExpired(true);
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setRedemptionTimeLeft(`${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`);
      setRedemptionExpired(false);
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [activeRedemption]);

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
        setScannedClaimCode(null);
        // Reload balance and ledger history
        await fetchHubData();
      } catch (err) {
        setClaimError(err instanceof Error ? err.message : "Failed to claim offer");
        setClaimStatus("error");
        setScannedClaimCode(null);
      }
    },
    [scannedClaimCode, hubData, fetchHubData]
  );

  // Track processed claim codes in memory to prevent repeated prompts/scans
  const processedCodeRef = React.useRef<string | null>(null);

  // Read URL query param ?claimQr=...
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("claimQr");
      if (code) {
        // Strip ?claimQr from URL immediately so refresh or history doesn't prompt in loop
        urlParams.delete("claimQr");
        const remainingQuery = urlParams.toString();
        const cleanUrl = window.location.pathname + (remainingQuery ? `?${remainingQuery}` : "");
        window.history.replaceState({}, "", cleanUrl);

        if (processedCodeRef.current === code) return;
        processedCodeRef.current = code;

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
  }, [slug]);

  // Prompt once member data is available if promo QR was scanned prior to logging in
  useEffect(() => {
    if (hubData?.member && scannedClaimCode && claimStatus === "idle" && scannedOfferInfo) {
      if (!scannedOfferInfo.isExpired && !scannedOfferInfo.isDeactivated) {
        setClaimStatus("prompt");
      }
    }
  }, [hubData?.member, scannedClaimCode, claimStatus, scannedOfferInfo]);

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
          email: joinEmail.trim(),
          password: joinPassword.trim() || undefined,
          name: joinName.trim() || undefined,
          marketingOptIn,
          referralCode: refCode || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (
          json.error?.code === "ACCOUNT_ALREADY_EXISTS" ||
          json.error?.message?.toLowerCase().includes("already exists")
        ) {
          setCustomerLoginEmail(joinEmail.trim());
          throw new Error(json.error?.message || "An account with this email already exists. Sign in instead.");
        }
        throw new Error(json.error?.message || "Failed to join");
      }
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
      const { res, json } = await loginRequest({
          email: customerLoginEmail.trim(),
          password: customerLoginPassword,
          portal: "customer",
          tenantSlug: slug,
        });
      if (!res.ok) {
        if (json.error?.code === "NOT_A_MEMBER") {
          // Registered elsewhere but not here: take them to "New here" with their email filled in
          setJoinEmail(customerLoginEmail.trim());
          setCustomerAuthMode("join");
        }
        throw new Error(json.error?.message || "Invalid customer credentials");
      }
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
      const { res, json } = await loginRequest({
          email: staffEmail.trim(),
          password: staffPassword,
          portal: "staff",
          tenantSlug: slug,
        });
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
      const { res, json } = await loginRequest({
          email: ownerEmail.trim(),
          password: ownerPassword,
          portal: "owner",
          tenantSlug: slug,
        });
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
    if (isOffline()) {
      setErrorMsg(OFFLINE_MESSAGE);
      return;
    }
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

  const brandColor = hubData.tenant.brandPrimaryHex || "#495e57";
  const member = hubData.member;
  const isStamps = hubData.programme.type === "stamps";
  const unitWord: "points" | "stamps" = isStamps ? "stamps" : "points";
  const lang: Lang = langFromLocale(hubData.tenant.locale);
  const tr = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const unitText = tr(unitWord);

  // Calculate next reward progress
  const nextLockedReward = hubData.rewards
    .filter((r) => !r.eligible && !r.unavailableReason)
    .sort((a, b) => a.costPoints - b.costPoints)[0];

  const highestEligibleReward = hubData.rewards
    .filter((r) => r.eligible)
    .sort((a, b) => b.costPoints - a.costPoints)[0];

  return (
    <div
      className="min-h-screen bg-paper text-slate-900 flex flex-col overflow-x-hidden w-full max-w-full"
      style={{ "--brand": brandColor } as React.CSSProperties}
    >
      {/* Header and page body; the footer sits at the bottom of the screen on short pages */}
      <div className="flex-1">
        <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur-md py-3.5">
          <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between gap-3 sm:gap-4 ${member ? "items-center" : "flex-col sm:flex-row sm:items-center"}`}>
            {/* Store Brand Info */}
            <div className="flex items-center gap-3 min-w-0">
              <BusinessLogo
                name={hubData.tenant.name}
                logoUrl={hubData.tenant.logoUrl}
                brandColor={brandColor}
                size="md"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="font-display font-bold text-lg sm:text-xl text-evergreen-deep leading-tight truncate">
                    {hubData.tenant.name}
                  </h1>
                </div>
                <span className="text-xs text-zinc-500 font-medium hidden sm:flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  {isStamps ? "Collect stamps" : "Collect points"} with {hubData.programme.name}
                </span>
              </div>
            </div>

            {/* Header Right Actions / Role Switcher */}
            <div className={`flex items-center gap-2.5 ${member ? "shrink-0" : "flex-col sm:flex-row items-stretch w-full sm:w-auto"}`}>
              {/* Role switcher: only for visitors who are not signed in to their card */}
              {!member && (
              <div className="flex bg-white p-1 border border-slate-200 rounded-full text-sm font-semibold w-full sm:w-auto overflow-x-auto">
                <button
                  type="button"
                  onClick={() => {
                    setActivePortalRole("customer");
                    setErrorMsg(null);
                  }}
                  className={`flex-1 sm:flex-initial py-2 px-3.5 rounded-full transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    activePortalRole === "customer"
                      ? "bg-evergreen text-white"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  I&rsquo;m a customer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActivePortalRole("staff");
                    setErrorMsg(null);
                  }}
                  className={`flex-1 sm:flex-initial py-2 px-3.5 rounded-full transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    activePortalRole === "staff"
                      ? "bg-evergreen text-white"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  I work here
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActivePortalRole("owner");
                    setErrorMsg(null);
                  }}
                  className={`flex-1 sm:flex-initial py-2 px-3.5 rounded-full transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    activePortalRole === "owner"
                      ? "bg-evergreen text-white"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Store className="w-3.5 h-3.5" />
                  I own this shop
                </button>
              </div>
              )}

              {/* Logged in customer quick controls */}
              {member && activePortalRole === "customer" && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      setCardFlipped(true);
                      document.getElementById("my-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }}
                    className="press bg-evergreen hover:bg-evergreen-deep text-white font-semibold rounded-full text-sm cursor-pointer transition-colors"
                  >
                    <QrCode className="h-4 w-4 mr-1.5 stroke-[1.8]" />
                    <span className="sm:hidden">My card</span>
                    <span className="hidden sm:inline">Show my card</span>
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
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
          {/* Error notification banner */}
          {errorMsg && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 shadow-xs">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="font-semibold">{errorMsg}</span>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                {errorMsg.toLowerCase().includes("already exists") && (
                  <button
                    type="button"
                    onClick={() => {
                      setActivePortalRole("customer");
                      setCustomerAuthMode("signin");
                      if (joinEmail.trim()) setCustomerLoginEmail(joinEmail.trim());
                      setErrorMsg(null);
                    }}
                    className="px-2.5 py-1 bg-white text-indigo-700 font-bold rounded-lg border border-indigo-200 text-xs shadow-2xs hover:bg-indigo-50 cursor-pointer"
                  >
                    👉 Go to Sign In
                  </button>
                )}
                <button onClick={() => setErrorMsg(null)} className="font-bold underline ml-1 cursor-pointer">
                  Dismiss
                </button>
              </div>
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
                    <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center font-bold text-2xl shrink-0">
                      🎁
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold capitalize px-2 py-0.5 rounded-full bg-white/20 text-white">
                          Promotional Offer Scanned
                        </span>
                        {scannedOfferInfo.isExpired ? (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white">
                            Expired
                          </span>
                        ) : scannedOfferInfo.isDeactivated ? (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white">
                            Deactivated
                          </span>
                        ) : (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-400 text-slate-900">
                            Available Now
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-bold text-white mt-1">{scannedOfferInfo.title}</h3>
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
                    <span className="text-xs font-extrabold capitalize px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                      Promotional Offer Detected
                    </span>

                    <h3 className="text-lg font-bold text-slate-950 mt-2 mb-1">
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
                        className="w-full bg-zinc-950 hover:bg-zinc-800 text-white font-semibold rounded-xl py-3 text-xs shadow-xs cursor-pointer transition-colors"
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
                    {claimResult?.card ? (
                      <>
                        <h3 className="font-display text-xl font-bold text-evergreen-deep mb-1">
                          {claimResult.card.state === "pending"
                            ? "Reward waiting at the counter"
                            : claimResult.card.state === "ready"
                            ? "Your card is full!"
                            : "Stamp added"}
                        </h3>
                        <p className="text-sm text-zinc-600 mb-5 leading-relaxed">{claimResult.message}</p>
                        <div className="-mx-2 mb-5 text-left">
                          <StampCard
                            card={claimResult.card}
                            businessName={hubData.tenant.name}
                            logoUrl={hubData.tenant.logoUrl}
                            brandColor={brandColor}
                            justEarned={claimResult.isIntermediateVisit || claimResult.card.state === "ready"}
                            onClaim={() => handleClaimStampCard(claimResult.card!.offerId)}
                            claiming={claimingOfferId === claimResult.card.offerId}
                          />
                        </div>
                      </>
                    ) : claimResult?.isIntermediateVisit ? (
                      <>
                        <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3 shadow-inner">
                          <Sparkles className="w-8 h-8" />
                        </div>
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                          Visit {claimResult.currentVisit} of {claimResult.requiredVisits} Recorded
                        </span>
                        <h3 className="text-lg font-bold text-slate-950 mt-2 mb-1">
                          Stamp Recorded! ☕
                        </h3>
                        <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                          {claimResult.message}
                        </p>

                        {/* Punch card visual progression dots */}
                        <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200 mb-4">
                          <p className="text-xs font-bold text-amber-900 mb-2">
                            Progress to Free Perk ({claimResult.currentVisit}/{claimResult.requiredVisits})
                          </p>
                          <div className="flex items-center justify-center gap-2">
                            {Array.from({ length: claimResult.requiredVisits || 3 }).map((_, idx) => {
                              const isCompleted = idx < (claimResult.currentVisit || 0);
                              return (
                                <div
                                  key={idx}
                                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs transition-all ${
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
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                          🎉 Reward Unlocked!
                        </span>
                        <h3 className="text-lg font-bold text-slate-950 mt-2 mb-1">
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
                        <h3 className="text-lg font-bold text-slate-950 mb-1">Offer Claimed!</h3>
                        <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                          {claimResult?.message || "Your offer has been credited to your pass."}
                        </p>
                        {claimResult?.newBalance !== undefined && (
                          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 mb-4 text-xs">
                            <span className="text-slate-400 block text-xs capitalize font-bold">Updated Balance</span>
                            <span className="text-xl font-bold text-slate-900">{claimResult.newBalance} pts</span>
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
                      {claimResult?.card ? "See my cards" : "View Digital Pass"}
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

                    <h3 className="text-lg font-bold text-slate-950 mb-1">Offer Unavailable</h3>
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
                <>
                  {/* Hero: the member's own card, and how close they are to the next reward */}
                  <section className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center pt-2 sm:pt-6 pb-6">
                    <div className="lg:col-span-6 lg:order-2" id="my-card">
                      <MemberCard3D
                        businessName={hubData.tenant.name}
                        logoUrl={hubData.tenant.logoUrl}
                        brandColor={brandColor}
                        memberName={member.displayName}
                        memberNumber={member.memberNumber}
                        balance={member.balance}
                        unit={unitWord}
                        qrDataUrl={member.qrDataUrl}
                        flipped={cardFlipped}
                        onFlip={() => setCardFlipped((f) => !f)}
                      />
                      <p className="mt-8 text-center text-sm text-zinc-500">
                        {cardFlipped ? "Tap the card to see your balance" : "Tap the card to show your QR code"}
                      </p>
                    </div>

                    <div className="lg:col-span-6 lg:order-1">
                      <p className="rise-in text-lg text-zinc-600" style={{ "--d": "200ms" } as React.CSSProperties}>
                        Hello, {member.displayName.split(" ")[0]}
                      </p>
                      <h2
                        className="rise-in mt-2 font-display text-4xl sm:text-5xl font-bold text-evergreen-deep leading-[1.05] max-w-[16ch]"
                        style={{ "--d": "300ms" } as React.CSSProperties}
                      >
                        {nextLockedReward
                          ? `${nextLockedReward.pointsShortfall} more ${nextLockedReward.pointsShortfall === 1 ? unitWord.slice(0, -1) : unitWord} for ${nextLockedReward.title}`
                          : highestEligibleReward
                            ? `${highestEligibleReward.title} is ready for you`
                            : `You have ${member.balance} ${unitWord} here`}
                      </h2>

                      {hubData.programme.status === "paused" ? (
                        <p className="rise-in mt-4 max-w-md rounded-2xl bg-marigold/25 px-4 py-3 text-sm text-zinc-900" style={{ "--d": "350ms" } as React.CSSProperties}>
                          {hubData.tenant.name} has paused earning for now. Your {unitWord} are safe and you can still spend them.
                        </p>
                      ) : (
                        hubData.programme.earningRule && (
                          <p className="rise-in mt-3 text-zinc-600" style={{ "--d": "350ms" } as React.CSSProperties}>
                            {tr("you_get", { rule: hubData.programme.earningRule })}
                            {hubData.programme.expiryRule && <> {hubData.programme.expiryRule}.</>}
                          </p>
                        )
                      )}

                      {(hubData.programme.activeBoost || member.tier || ((hubData.programme.referralPoints ?? 0) > 0 && member.referralCode)) && (
                        <div className="rise-in mt-5 max-w-md space-y-3" style={{ "--d": "380ms" } as React.CSSProperties}>
                          {hubData.programme.activeBoost && (
                            <p className="rounded-2xl bg-marigold/25 px-4 py-3 text-sm text-zinc-900">
                              <strong>{hubData.programme.activeBoost.label}:</strong> earn {hubData.programme.activeBoost.percent}% of the usual {unitWord}
                              {hubData.programme.activeBoost.endsAt && <> until {new Date(hubData.programme.activeBoost.endsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</>}.
                            </p>
                          )}
                          {member.tier && (
                            <p className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800">
                              {member.tier.name ? (
                                <>
                                  You&rsquo;re <strong>{member.tier.name}</strong>
                                  {member.tier.earnPercent > 100 && <> and earn {member.tier.earnPercent}% on every purchase</>}.{" "}
                                </>
                              ) : (
                                <>Collect {unitWord} to reach your first level. </>
                              )}
                              {member.tier.next && (
                                <>
                                  {member.tier.pointsToNext} more {unitWord} in the last {hubData.programme.tierMonths ?? 12} months to reach {member.tier.next}.
                                </>
                              )}
                            </p>
                          )}
                          {(hubData.programme.referralPoints ?? 0) > 0 && member.referralCode && (
                            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800">
                              <p>
                                {tr("invite_text", { n: hubData.programme.referralPoints ?? 0, unit: unitText })}
                              </p>
                              <button
                                type="button"
                                onClick={async () => {
                                  const link = `${window.location.origin}/b/${slug}?ref=${member.referralCode}`;
                                  try {
                                    await navigator.clipboard.writeText(link);
                                    setInviteCopied(true);
                                    setTimeout(() => setInviteCopied(false), 2000);
                                  } catch {
                                    window.prompt("Copy your invite link", link);
                                  }
                                }}
                                className="press mt-2 min-h-[40px] px-4 rounded-full border border-zinc-300 text-sm font-semibold text-zinc-800 hover:border-evergreen cursor-pointer"
                              >
                                {inviteCopied ? tr("link_copied") : tr("copy_invite")}
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {nextLockedReward && (
                        <div className="rise-in mt-6 max-w-md" style={{ "--d": "400ms" } as React.CSSProperties}>
                          <div className="h-3 rounded-full bg-white border border-zinc-200 overflow-hidden">
                            <div
                              className="bar-fill h-full rounded-full bg-marigold"
                              style={{ width: `${Math.min(100, (member.balance / nextLockedReward.costPoints) * 100)}%` }}
                            />
                          </div>
                          <p className="mt-2 text-sm text-zinc-600 tabular-nums">
                            {member.balance} of {nextLockedReward.costPoints} {unitWord}
                          </p>
                        </div>
                      )}

                      <div className="rise-in mt-8 flex flex-wrap gap-3" style={{ "--d": "500ms" } as React.CSSProperties}>
                        <button
                          type="button"
                          onClick={() => setCardFlipped(true)}
                          className="press inline-flex items-center gap-2 min-h-[48px] px-6 rounded-full bg-evergreen text-white font-semibold hover:bg-evergreen-deep cursor-pointer"
                        >
                          <QrCode className="w-5 h-5" />
                          {tr("show_qr")}
                        </button>
                        <a
                          href="#points-menu"
                          className="press inline-flex items-center min-h-[48px] px-6 rounded-full border border-zinc-300 bg-white text-zinc-800 font-semibold hover:border-evergreen"
                        >
                          See what I can get
                        </a>
                      </div>
                    </div>
                  </section>

                  {/* Phones: stamp cards, points menu, chat, activity. Desktop: two aligned columns. */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-[auto_1fr] gap-6 lg:gap-x-8 items-start pt-4">
                    {member.stampCards && member.stampCards.length > 0 && (
                      <section aria-labelledby="stamp-cards-heading" className="lg:col-span-5 lg:col-start-8 lg:row-start-1 min-w-0">
                        <h2 id="stamp-cards-heading" className="font-display text-lg font-bold text-evergreen-deep">
                          Your stamp cards
                        </h2>
                        <p className="text-sm text-zinc-600 mt-0.5">A stamp each time you buy. Fill a card for your reward.</p>
                        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-8">
                          {member.stampCards.map((card) => (
                            <StampCard
                              key={card.offerId}
                              card={card}
                              businessName={hubData.tenant.name}
                              logoUrl={hubData.tenant.logoUrl}
                              brandColor={brandColor}
                              onClaim={() => handleClaimStampCard(card.offerId)}
                              claiming={claimingOfferId === card.offerId}
                            />
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Main column: spending points and talking to the shop */}
                    <div className="lg:col-span-7 lg:col-start-1 lg:row-start-1 lg:row-span-2 space-y-6 min-w-0">
                      <div id="points-menu" className="scroll-mt-28">
                        <PointsMenu
                          rewards={hubData.rewards}
                          balance={member.balance}
                          unit={unitWord}
                          onClaim={(reward) => handleStartRedeem(reward.id, reward.title, reward.costPoints)}
                        />
                      </div>
                      <CustomerChat membershipId={member.membershipId} businessName={hubData.tenant.name} />
                    </div>

                    {/* Side column: what happened, and where to find the shop online */}
                    <div className="lg:col-span-5 lg:col-start-8 lg:row-start-2 space-y-6 min-w-0">
                      <section className="bg-white rounded-3xl border border-zinc-200 p-5 sm:p-7">
                        <h3 className="font-display text-lg font-bold text-evergreen-deep flex items-center gap-2">
                          <History className="h-5 w-5 text-evergreen" />
                          {tr("recent_activity")}
                        </h3>
                        {member.recentHistory.length === 0 ? (
                          <p className="mt-4 text-sm text-zinc-500">
                            Nothing yet. Show your QR code when you pay and your {unitWord} will appear here.
                          </p>
                        ) : (
                          <ul className="mt-4 divide-y divide-zinc-100">
                            {member.recentHistory.map((item) => {
                              const gained = item.pointsDelta > 0;
                              const Icon = item.type === "redeem" ? Gift : gained ? Plus : Minus;
                              return (
                                <li key={item.id} className="flex items-center gap-3 py-3">
                                  <span
                                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                                      item.type === "redeem"
                                        ? "bg-marigold/30 text-evergreen-deep"
                                        : gained
                                          ? "bg-mist text-evergreen"
                                          : "bg-zinc-100 text-zinc-600"
                                    }`}
                                  >
                                    <Icon className="w-4 h-4" />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-semibold text-zinc-900 truncate">{historyLabel(item)}</span>
                                    <span className="block text-xs text-zinc-500">
                                      {new Date(item.occurredAt).toLocaleDateString([], {
                                        day: "numeric",
                                        month: "short",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                  </span>
                                  <span
                                    className={`text-sm font-semibold tabular-nums shrink-0 ${gained ? "text-evergreen" : "text-zinc-700"}`}
                                  >
                                    {gained ? `+${item.pointsDelta}` : item.pointsDelta}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        <ReportProblem
                          tenantId={hubData.tenant.id}
                          membershipId={member.membershipId}
                          unit={unitWord}
                          history={member.recentHistory.map((h) => ({ ...h, label: historyLabel(h) }))}
                        />
                      </section>

                      {hubData.links.length > 0 && (
                        <section className="bg-white rounded-3xl border border-zinc-200 p-5 sm:p-7">
                          <h3 className="font-display text-lg font-bold text-evergreen-deep flex items-center gap-2">
                            <Star className="h-5 w-5 text-evergreen" />
                            Find us online
                          </h3>
                          <p className="text-sm text-zinc-600 mt-0.5">Reviews help other people find {hubData.tenant.name}.</p>
                          <div className="mt-4 space-y-2">
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
                                  className="press group flex items-center gap-3 min-h-[52px] px-4 rounded-2xl border border-zinc-200 hover:border-evergreen hover:bg-mist/50"
                                >
                                  <IconComponent
                                    className={`h-5 w-5 shrink-0 ${
                                      link.type === "google_review"
                                        ? "text-marigold fill-marigold"
                                        : link.type === "instagram"
                                          ? "text-pink-600"
                                          : link.type === "facebook"
                                            ? "text-blue-600"
                                            : "text-zinc-600"
                                    }`}
                                  />
                                  <span className="flex-1 text-sm font-semibold text-zinc-800">{link.label}</span>
                                  <ArrowUpRight className="h-4 w-4 text-zinc-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                                </a>
                              );
                            })}
                          </div>
                        </section>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                /* PUBLIC CUSTOMER JOIN / SIGN IN ENTERPRISE 2-COLUMN VIEW */
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left Column: Store Value Proposition & Teaser Rewards (6 cols) */}
                  <div className="lg:col-span-6 space-y-6">
                    <div className="bg-white rounded-2xl border border-zinc-200/90 p-6 sm:p-8 shadow-xs relative overflow-hidden">
                      <div className="w-10 h-10 rounded-xl bg-zinc-100 border border-zinc-200/60 text-zinc-900 flex items-center justify-center mb-4 shadow-2xs">
                        <Sparkles className="h-5 w-5 stroke-[1.8]" />
                      </div>

                      <h2 className="text-2xl sm:text-3xl font-bold text-zinc-950 tracking-tight leading-tight">
                        Join {hubData.tenant.name} and get rewarded
                      </h2>

                      <p className="mt-3 text-xs sm:text-sm text-zinc-600 leading-relaxed">
                        Earn {isStamps ? "stamps" : "loyalty points"} every time you make a purchase at our store. Exchange your balance for complimentary food, drinks, and VIP perks.
                      </p>

                      <div className="mt-6 pt-5 border-t border-zinc-100 flex flex-wrap items-center gap-4 text-xs text-zinc-600">
                        <div className="flex items-center gap-1.5 font-medium text-zinc-900">
                          <CheckCircle2 className="w-4 h-4 text-zinc-900 stroke-[1.8]" />
                          <span>Your card is ready instantly</span>
                        </div>
                        <div className="flex items-center gap-1.5 font-medium text-zinc-900">
                          <CheckCircle2 className="w-4 h-4 text-zinc-900 stroke-[1.8]" />
                          <span>No app to download</span>
                        </div>
                      </div>
                    </div>

                    {/* Featured Rewards Preview */}
                    {hubData.rewards.length > 0 && (
                      <div className="bg-white rounded-2xl border border-zinc-200/90 shadow-xs p-5 sm:p-6 space-y-3">
                        <span className="text-xs font-semibold text-zinc-400 block">
                          {tr("rewards_you_can_get")}
                        </span>
                        <div className="space-y-2">
                          {hubData.rewards.slice(0, 4).map((r) => (
                            <div
                              key={r.id}
                              className="p-3 rounded-xl border border-zinc-200/80 bg-zinc-50/60 flex items-center justify-between text-xs shadow-2xs"
                            >
                              <div className="font-semibold text-zinc-900">{r.title}</div>
                              <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white text-zinc-800 border border-zinc-200">
                                {r.costPoints} {isStamps ? "stamps" : "pts"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Customer Join / Sign In Card (6 cols) */}
                  <div className="lg:col-span-6">
                    <div className="bg-white rounded-2xl shadow-xs p-6 sm:p-8 border border-zinc-200/90 space-y-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-4">
                        <div>
                          <h3 className="text-lg sm:text-xl font-bold text-zinc-950">
                            {customerAuthMode === "join" ? tr("card_join_title") : tr("card_signin_title")}
                          </h3>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            {customerAuthMode === "join"
                              ? tr("card_join_subtitle")
                              : tr("card_signin_subtitle")}
                          </p>
                        </div>

                        {/* Customer Mode Switcher */}
                        <div className="flex bg-zinc-100 p-1 rounded-xl border border-zinc-200 text-xs font-semibold self-start sm:self-auto">
                          <button
                            type="button"
                            onClick={() => setCustomerAuthMode("join")}
                            className={`py-1.5 px-3 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                              customerAuthMode === "join"
                                ? "bg-white text-zinc-950 shadow-2xs font-bold"
                                : "text-zinc-600 hover:text-zinc-900"
                            }`}
                          >
                            {tr("tab_new")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setCustomerAuthMode("signin")}
                            className={`py-1.5 px-3 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                              customerAuthMode === "signin"
                                ? "bg-white text-zinc-950 shadow-2xs font-bold"
                                : "text-zinc-600 hover:text-zinc-900"
                            }`}
                          >
                            {tr("tab_signin")}
                          </button>
                        </div>
                      </div>

                      {/* Google Quick Join Button with PRESERVED COLOURED GOOGLE LOGO */}
                      <div>
                        <a
                          href={`/api/v1/auth/google?role=customer&returnTo=${encodeURIComponent(
                            scannedClaimCode ? `/b/${slug}?claimQr=${scannedClaimCode}` : `/b/${slug}`
                          )}`}
                          className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border border-zinc-200 hover:border-zinc-300 bg-white hover:bg-zinc-50 transition-all font-semibold text-xs shadow-2xs text-zinc-800"
                        >
                          {/* Coloured Google Logo explicitly preserved */}
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
                            {customerAuthMode === "join" ? tr("join_google") : tr("signin_google")}
                          </span>
                        </a>

                        <div className="flex items-center my-4">
                          <div className="flex-1 border-t border-zinc-200" />
                          <span className="px-3 text-xs font-semibold text-zinc-400">
                            {tr("or_with_email")}
                          </span>
                          <div className="flex-1 border-t border-zinc-200" />
                        </div>
                      </div>

                      {customerAuthMode === "join" ? (
                        /* JOIN FORM */
                        <form onSubmit={handleJoin} className="space-y-3.5">
                          <div>
                            <label className="text-xs font-semibold text-zinc-800 block mb-1">
                              {tr("email_address")} <span className="text-rose-500">*</span>
                            </label>
                            <Input
                              type="email"
                              required
                              placeholder="name@example.com"
                              value={joinEmail}
                              onChange={(e) => setJoinEmail(e.target.value)}
                              className="text-xs rounded-xl bg-zinc-50/70 border-zinc-200 focus:bg-white focus:ring-1 focus:ring-zinc-900 font-medium text-zinc-900"
                            />
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-zinc-800 block mb-1">
                              {tr("name_optional")}
                            </label>
                            <Input
                              type="text"
                              placeholder="First & Last Name"
                              value={joinName}
                              onChange={(e) => setJoinName(e.target.value)}
                              className="text-xs rounded-xl bg-zinc-50/70 border-zinc-200 focus:bg-white focus:ring-1 focus:ring-zinc-900 font-medium text-zinc-900"
                            />
                          </div>

                          <div>
                            <label className="text-xs font-semibold text-zinc-800 block mb-1">
                              {tr("password_create_optional")}
                            </label>
                            <Input
                              type="password"
                              placeholder="Min 6 characters to sign in anytime"
                              value={joinPassword}
                              onChange={(e) => setJoinPassword(e.target.value)}
                              className="text-xs rounded-xl bg-zinc-50/70 border-zinc-200 focus:bg-white focus:ring-1 focus:ring-zinc-900 font-medium text-zinc-900"
                            />
                          </div>

                          <div className="space-y-2 pt-1">
                            <label className="flex items-start space-x-2 text-xs text-zinc-600 cursor-pointer">
                              <input
                                type="checkbox"
                                required
                                checked={termsAgreed}
                                onChange={(e) => setTermsAgreed(e.target.checked)}
                                className="mt-0.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                              />
                              <span>
                                I accept the{" "}
                                <Link href={`/b/${slug}/terms`} target="_blank" className="font-semibold text-evergreen underline">
                                  programme terms
                                </Link>{" "}
                                and{" "}
                                <Link href="/privacy" target="_blank" className="font-semibold text-evergreen underline">
                                  privacy notice
                                </Link>
                                . Points have no cash value.
                              </span>
                            </label>

                            <label className="flex items-start space-x-2 text-xs text-zinc-600 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={marketingOptIn}
                                onChange={(e) => setMarketingOptIn(e.target.checked)}
                                className="mt-0.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
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
                            className="w-full font-semibold text-xs bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl shadow-xs h-11 cursor-pointer transition-colors"
                            disabled={joining || !joinEmail}
                          >
                            {joining ? tr("creating_card") : tr("get_my_card")}
                          </Button>
                        </form>
                      ) : (
                        /* SIGN IN FORM */
                        <form onSubmit={handleCustomerLogin} className="space-y-3.5">
                          <div>
                            <label className="text-xs font-semibold text-zinc-800 block mb-1">
                              Email Address
                            </label>
                            <Input
                              type="email"
                              required
                              placeholder="customer@example.com"
                              value={customerLoginEmail}
                              onChange={(e) => setCustomerLoginEmail(e.target.value)}
                              className="text-xs rounded-xl bg-zinc-50/70 border-zinc-200 focus:bg-white focus:ring-1 focus:ring-zinc-900 font-medium text-zinc-900"
                            />
                          </div>

                          <div>
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <label className="text-xs font-semibold text-zinc-800">
                              Password
                            </label>
                              <Link href="/forgot-password?role=customer" className="text-xs font-semibold text-evergreen hover:underline">
                                {tr("forgot_password")}
                              </Link>
                            </div>
                            <Input
                              type="password"
                              required
                              placeholder="••••••••"
                              value={customerLoginPassword}
                              onChange={(e) => setCustomerLoginPassword(e.target.value)}
                              className="text-xs rounded-xl bg-zinc-50/70 border-zinc-200 focus:bg-white focus:ring-1 focus:ring-zinc-900 font-medium text-zinc-900"
                            />
                          </div>

                          <Button
                            type="submit"
                            variant="default"
                            size="lg"
                            className="w-full font-semibold text-xs bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl shadow-xs h-11 cursor-pointer transition-colors"
                            disabled={customerLoggingIn || !customerLoginEmail || !customerLoginPassword}
                          >
                            {customerLoggingIn ? tr("signing_in") : tr("signin_view_pass")}
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
            <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xs p-6 sm:p-8 border border-zinc-200/90 space-y-5 animate-in fade-in">
              <div className="text-center pb-3 border-b border-zinc-100">
                <div className="w-11 h-11 rounded-xl bg-zinc-100 border border-zinc-200/60 text-zinc-900 flex items-center justify-center mx-auto mb-2.5 shadow-2xs">
                  <Smartphone className="w-5 h-5 stroke-[1.8]" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-zinc-950 tracking-tight">Frontline Staff Scanner</h2>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto leading-relaxed">
                  Enter your staff credentials provisioned by {hubData.tenant.name} to launch the scanner terminal.
                </p>
              </div>

              <form onSubmit={handleStaffLogin} className="space-y-3.5">
                <div>
                  <label className="text-xs font-semibold text-zinc-800 block mb-1">Staff Email Address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3 stroke-[1.8]" />
                    <Input
                      type="email"
                      required
                      placeholder="staff@store.com"
                      value={staffEmail}
                      onChange={(e) => setStaffEmail(e.target.value)}
                      className="pl-10 text-xs rounded-xl bg-zinc-50/70 border-zinc-200 focus:bg-white focus:ring-1 focus:ring-zinc-900 font-medium text-zinc-900"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-xs font-semibold text-zinc-800">Staff Password</label>
                    <Link href="/forgot-password?role=staff" className="text-xs font-semibold text-evergreen hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3 stroke-[1.8]" />
                    <Input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={staffPassword}
                      onChange={(e) => setStaffPassword(e.target.value)}
                      className="pl-10 text-xs rounded-xl bg-zinc-50/70 border-zinc-200 focus:bg-white focus:ring-1 focus:ring-zinc-900 font-medium text-zinc-900"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="default"
                  size="lg"
                  className="w-full font-semibold text-xs bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl shadow-xs h-11 cursor-pointer transition-colors"
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
            <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xs p-6 sm:p-8 border border-zinc-200/90 space-y-5 animate-in fade-in">
              <div className="text-center pb-3 border-b border-zinc-100">
                <div className="w-11 h-11 rounded-xl bg-zinc-100 border border-zinc-200/60 text-zinc-900 flex items-center justify-center mx-auto mb-2.5 shadow-2xs">
                  <Store className="w-5 h-5 stroke-[1.8]" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-zinc-950 tracking-tight">Store Owner Dashboard</h2>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto leading-relaxed">
                  Access store analytics, product catalog, discounts, staff RBAC credentials, and customer ledger.
                </p>
              </div>

              <form onSubmit={handleOwnerLogin} className="space-y-3.5">
                <div>
                  <label className="text-xs font-semibold text-zinc-800 block mb-1">Owner Email Address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3 stroke-[1.8]" />
                    <Input
                      type="email"
                      required
                      placeholder="owner@store.com"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      className="pl-10 text-xs rounded-xl bg-zinc-50/70 border-zinc-200 focus:bg-white focus:ring-1 focus:ring-zinc-900 font-medium text-zinc-900"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-xs font-semibold text-zinc-800">Password</label>
                    <Link href="/forgot-password?role=owner" className="text-xs font-semibold text-evergreen hover:underline">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3 stroke-[1.8]" />
                    <Input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={ownerPassword}
                      onChange={(e) => setOwnerPassword(e.target.value)}
                      className="pl-10 text-xs rounded-xl bg-zinc-50/70 border-zinc-200 focus:bg-white focus:ring-1 focus:ring-zinc-900 font-medium text-zinc-900"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="default"
                  size="lg"
                  className="w-full font-semibold text-xs bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl shadow-xs h-11 cursor-pointer transition-colors"
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
      <footer className="mt-16 border-t border-zinc-200 bg-white py-5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <span>&copy; {new Date().getFullYear()} {hubData.tenant.name}. Loyalty card by LoyaltyPlatform</span>
          <div className="flex items-center space-x-4">
            <Link href="/" className="hover:text-slate-800">LoyaltyPlatform</Link>
            <Link href={`/b/${slug}/terms`} className="hover:text-slate-800">Card terms</Link>
            <Link href="/privacy" className="hover:text-slate-800">Privacy</Link>
          </div>
        </div>
      </footer>

      {/* Redemption Code One-Time Modal (With Live Polling & Countdown) */}
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

            <h3 className="text-xl font-bold text-slate-900">{activeRedemption.rewardTitle}</h3>
            <p className="text-xs text-slate-500 mb-2">Present this voucher code to staff at counter</p>

            {/* Voucher QR Code */}
            {redemptionQrUrl && (
              <div className="my-2.5 flex justify-center">
                <div className="p-2.5 bg-white rounded-2xl border-2 border-slate-200 shadow-xs inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={redemptionQrUrl} alt="Voucher QR Code" className="w-36 h-36 mx-auto rounded-lg" />
                </div>
              </div>
            )}

            <div className="my-2.5 py-2.5 px-4 bg-slate-100 rounded-2xl font-mono text-2xl font-bold tracking-widest text-slate-900 border border-slate-200">
              {activeRedemption.code}
            </div>

            {redemptionExpired ? (
              <div className="py-2 px-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 mb-3">
                This voucher code has expired. Tap close to claim again.
              </div>
            ) : (
              <div className="flex items-center justify-center space-x-1.5 text-xs text-amber-700 font-bold mb-2.5">
                <Clock className="h-3.5 w-3.5" />
                <span>Expires in {redemptionTimeLeft || "10:00"}</span>
              </div>
            )}

            <div className="text-xs text-slate-500 flex items-center justify-center space-x-2 mb-3">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Awaiting staff scanner confirmation...</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveRedemption(null)}
              className="w-full text-xs font-bold border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl cursor-pointer"
            >
              Cancel Voucher
            </Button>
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
            <h3 className="text-2xl font-bold text-slate-900">Enjoy Your Reward!</h3>
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
