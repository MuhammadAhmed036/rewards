"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { BusinessLogo } from "@/components/brand/BusinessLogo";
import { QrCameraScanner } from "@/components/staff/QrCameraScanner";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { parsePence } from "@/lib/money";
import {
  QrCode,
  Search,
  Gift,
  History,
  CheckCircle2,
  AlertCircle,
  MapPin,
  RefreshCw,
  Sparkles,
  LogOut,
  Package,
  X,
  Plus,
  Stamp,
  Check,
} from "lucide-react";

interface LocationItem {
  id: string;
  name: string;
  publicId: string;
}

interface MemberSummary {
  membershipId: string;
  memberNumber: string;
  displayName: string;
  name?: string;
  email?: string;
  balance: number;
  lifetimeEarned?: number;
  lifetimeRedeemed?: number;
  status: string;
  joinedAt?: string;
  stampCards?: StaffStampCard[];
  availableRewards: Array<{
    id: string;
    title: string;
    costPoints: number;
    eligible: boolean;
    pointsShortfall: number;
  }>;
}

interface StaffStampCard {
  offerId: string;
  title: string;
  rewardName: string;
  requiredStamps: number;
  stamps: number;
  state: "collecting" | "ready" | "pending";
  rewardsClaimed: number;
  offerStatus: "active" | "expired" | "deactivated";
}

interface BusinessInfo {
  name: string;
  logoUrl: string | null;
  brandPrimaryHex: string | null;
  programmeType: "points" | "stamps";
}

interface TransactionItem {
  id: string;
  type: string;
  pointsDelta: number;
  occurredAt: string;
  memberNumber: string;
  displayName: string;
}

interface ProductItem {
  id: string;
  name: string;
  category: string;
  priceMinor: number;
  pointsAwarded: number;
  discountPercent: number;
  isActive: boolean;
}

interface StaffCampaignQrItem {
  id: string;
  code: string;
  title: string;
  offerType: "points_bonus" | "stamps_bonus" | "free_product" | "discount_promo";
  pointsToAward: number;
  requiredVisits: number;
  productId?: string | null;
  productRewardName?: string | null;
  discountPercent: number;
  status: "active" | "expired" | "deactivated";
  validityDays: number;
  expiresAt: string;
  totalScans: number;
  totalClaims: number;
  qrDataUrl: string;
  scanUrl: string;
  createdAt: string;
}

interface StaffPromoReportItem {
  id: string;
  campaignTitle: string;
  offerType: string;
  productRewardName?: string;
  memberName: string;
  memberNumber: string;
  pointsAwarded: number;
  visitNumber: number;
  requiredVisits: number;
  status: string;
  approvedByName?: string;
  approvedAt?: string;
  scannedAt: string;
}

export default function StaffPage() {
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"scan" | "search" | "code" | "products" | "history">("scan");

  // Products state for Staff
  const [productsList, setProductsList] = useState<ProductItem[]>([]);
  const [showAddProdModal, setShowAddProdModal] = useState(false);
  const [newProdName, setNewProdName] = useState("");
  const [newProdCategory, setNewProdCategory] = useState("General");
  const [newProdPrice, setNewProdPrice] = useState("3.50");
  const [newProdPoints, setNewProdPoints] = useState("2");
  const [newProdDiscount, setNewProdDiscount] = useState("0");
  const [dailyDiscountSetting, setDailyDiscountSetting] = useState("10");

  // Campaign QR state for Staff
  const [campaignQrs, setCampaignQrs] = useState<StaffCampaignQrItem[]>([]);
  const [promoReports, setPromoReports] = useState<StaffPromoReportItem[]>([]);
  const [showCreatePromoModal, setShowCreatePromoModal] = useState(false);
  const [promoTitle, setPromoTitle] = useState("");
  const [promoOfferType, setPromoOfferType] = useState<"points_bonus" | "stamps_bonus" | "free_product" | "discount_promo">("points_bonus");
  const [promoPoints, setPromoPoints] = useState("10");
  const [promoRequiredVisits, setPromoRequiredVisits] = useState("3");
  const [promoValidityDays, setPromoValidityDays] = useState("30");
  const [promoDiscountPct, setPromoDiscountPct] = useState("15");
  const [promoSelectedProdId, setPromoSelectedProdId] = useState("");
  const [fullscreenQr, setFullscreenQr] = useState<StaffCampaignQrItem | null>(null);

  // Business shown in the header
  const [business, setBusiness] = useState<BusinessInfo | null>(null);

  // Scanner & Member state
  const [qrInput, setQrInput] = useState("");
  const [customerIdInput, setCustomerIdInput] = useState("");
  const [stampBusyId, setStampBusyId] = useState<string | null>(null);
  const [stampNotice, setStampNotice] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MemberSummary[]>([]);
  const [activeMember, setActiveMember] = useState<MemberSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Earn state
  const [spendInput, setSpendInput] = useState("");
  const [tipInput, setTipInput] = useState("");
  const [previewPoints, setPreviewPoints] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [managerOverride, setManagerOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  // Result state
  const [successData, setSuccessData] = useState<{
    title: string;
    message: string;
    newBalance: number;
    pointsDelta: number;
  } | null>(null);

  // Redemption code state
  const [redeemCodeInput, setRedeemCodeInput] = useState("");
  const [validatingRedeemCode, setValidatingRedeemCode] = useState(false);
  const [redeemValidation, setRedeemValidation] = useState<{
    redemption: { id: string; costPoints: number };
    reward: { title: string; costPoints: number };
    memberBalance: number;
    hasSufficientBalance: boolean;
  } | null>(null);

  // History state
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);

  // Load locations on mount
  useEffect(() => {
    async function fetchLocations() {
      try {
        const res = await fetch("/api/v1/staff/locations");
        if (res.status === 401 || res.status === 403) {
          window.location.href = "/login?redirect=/staff";
          return;
        }
        if (res.ok) {
          const json = await res.json();
          setLocations(json.data || []);
          const savedLoc = localStorage.getItem("loyalty_staff_loc");
          if (savedLoc && json.data.some((l: LocationItem) => l.id === savedLoc)) {
            setSelectedLocationId(savedLoc);
          } else if (json.data.length > 0) {
            setSelectedLocationId(json.data[0].id);
            localStorage.setItem("loyalty_staff_loc", json.data[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load staff locations", err);
      }
    }
    fetchLocations();

    fetch("/api/v1/business")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => json?.data && setBusiness(json.data))
      .catch(() => {});
  }, []);

  const handleSelectLocation = (locId: string) => {
    setSelectedLocationId(locId);
    localStorage.setItem("loyalty_staff_loc", locId);
  };

  // Resolve QR scan
  const handleResolveScan = async (tokenToResolve?: string) => {
    const rawToken = tokenToResolve || qrInput.trim();
    if (!rawToken) return;

    // Detect if scanned code is an 8-character voucher code (Crockford Base32)
    const cleanToken = rawToken.trim().toUpperCase();
    if (cleanToken.length === 8 && /^[0-9A-HJ-NP-Z]{8}$/i.test(cleanToken)) {
      setQrInput("");
      await handleValidateRedeemCode(cleanToken);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/v1/staff/scan/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: rawToken, locationId: selectedLocationId }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Failed to resolve QR");
      }
      setActiveMember(json.data);
      setStampNotice(null);
      setQrInput("");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error resolving QR");
    } finally {
      setLoading(false);
    }
  };

  // Open a customer by typed customer ID (walk-ins without their phone) or from search results
  const openMember = async (lookup: { memberNumber: string } | { membershipId: string }) => {
    setLoading(true);
    setErrorMsg(null);
    setStampNotice(null);
    try {
      const res = await fetch("/api/v1/staff/scan/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...lookup, locationId: selectedLocationId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Customer not found");
      setActiveMember(json.data);
      setCustomerIdInput("");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Customer not found");
    } finally {
      setLoading(false);
    }
  };

  // Add a stamp for a qualifying purchase, or hand over a full card's reward
  const handleStampAction = async (offerId: string, action: "add" | "give_reward") => {
    if (!activeMember) return;
    setStampBusyId(offerId);
    setErrorMsg(null);
    setStampNotice(null);
    try {
      const res = await fetch("/api/v1/staff/stamps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: activeMember.membershipId, offerId, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Stamp action failed");
      setActiveMember((m) => (m ? { ...m, stampCards: json.data.stampCards } : m));
      setStampNotice(json.data.message);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Stamp action failed");
    } finally {
      setStampBusyId(null);
    }
  };

  // Search Members & Registered Customers
  const handleSearch = async (queryOverride?: string) => {
    const q = queryOverride !== undefined ? queryOverride : searchQuery;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/v1/staff/members/search?q=${encodeURIComponent(q.trim())}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Search failed");
      setSearchResults(json.data || []);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Search error");
    } finally {
      setLoading(false);
    }
  };

  // Preview points live when spend changes
  const updatePointsPreview = useCallback(async () => {
    if (!activeMember || !spendInput) {
      setPreviewPoints(null);
      return;
    }

    try {
      setPreviewLoading(true);
      const amountMinor = parsePence(spendInput);
      const tipMinor = tipInput ? parsePence(tipInput) : 0;

      const res = await fetch("/api/v1/staff/earn/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membershipId: activeMember.membershipId,
          locationId: selectedLocationId,
          amountMinor,
          tipMinor,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setPreviewPoints(json.data.pointsToAward);
      } else {
        setPreviewPoints(null);
      }
    } catch {
      setPreviewPoints(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [activeMember, spendInput, tipInput, selectedLocationId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      updatePointsPreview();
    }, 250);
    return () => clearTimeout(timer);
  }, [updatePointsPreview]);

  // Submit Earn
  const handleConfirmEarn = async () => {
    if (!activeMember || !selectedLocationId) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const amountMinor = spendInput ? parsePence(spendInput) : 0;
      const tipMinor = tipInput ? parsePence(tipInput) : 0;
      const idempotencyKey = crypto.randomUUID();

      const res = await fetch("/api/v1/staff/earn", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          membershipId: activeMember.membershipId,
          locationId: selectedLocationId,
          amountMinor,
          tipMinor,
          managerOverrideReason: managerOverride ? overrideReason || "Staff override" : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        if (json.error?.code === "DUPLICATE_VISIT") {
          setManagerOverride(true);
        }
        throw new Error(json.error?.message || "Failed to award points");
      }

      setSuccessData({
        title: "Points Awarded!",
        message: `Successfully credited ${json.data.pointsDelta} points to ${activeMember.displayName}.`,
        newBalance: json.data.newBalance,
        pointsDelta: json.data.pointsDelta,
      });
      setActiveMember(null);
      setSpendInput("");
      setTipInput("");
      setManagerOverride(false);
      setOverrideReason("");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error processing earn");
    } finally {
      setLoading(false);
    }
  };

  // Validate Redemption Code
  const handleValidateRedeemCode = async (codeOverride?: string) => {
    const code = (typeof codeOverride === "string" ? codeOverride : redeemCodeInput).trim().toUpperCase();
    if (!code) return;
    setValidatingRedeemCode(true);
    setErrorMsg(null);
    setRedeemValidation(null);
    try {
      const res = await fetch("/api/v1/staff/redemptions/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Validation failed");
      setRedeemValidation(json.data);
      setRedeemCodeInput(code);
      setActiveTab("code");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error validating code");
    } finally {
      setValidatingRedeemCode(false);
    }
  };

  // Staff-Initiated Direct Redemption (PRS 5.4 Alternative)
  const handleStaffDirectRedeem = async (reward: { id: string; title: string; costPoints: number }) => {
    if (!activeMember || !selectedLocationId) return;
    if (
      !confirm(
        `Confirm redemption of "${reward.title}" for ${activeMember.displayName}? This will deduct ${reward.costPoints} points from the customer's balance.`
      )
    ) {
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Initiate redemption voucher
      const reqRes = await fetch("/api/v1/customer/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membershipId: activeMember.membershipId,
          rewardId: reward.id,
        }),
      });
      const reqJson = await reqRes.json();
      if (!reqRes.ok) throw new Error(reqJson.error?.message || "Failed to initiate redemption");

      const code = reqJson.data.code;

      // 2. Atomically confirm redemption at counter
      const confirmRes = await fetch("/api/v1/staff/redemptions/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          code,
          locationId: selectedLocationId,
        }),
      });
      const confirmJson = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirmJson.error?.message || "Failed to confirm redemption");

      setSuccessData({
        title: "Reward Redeemed by Staff!",
        message: `Successfully confirmed "${reward.title}" for ${activeMember.displayName}.`,
        newBalance: confirmJson.data.newBalance,
        pointsDelta: -confirmJson.data.pointsDeducted,
      });

      // Update active member's balance and recompute reward eligibility
      const updatedBalance = confirmJson.data.newBalance;
      setActiveMember({
        ...activeMember,
        balance: updatedBalance,
        availableRewards: activeMember.availableRewards.map((r) => {
          const eligible = updatedBalance >= r.costPoints;
          return {
            ...r,
            eligible,
            pointsShortfall: eligible ? 0 : r.costPoints - updatedBalance,
          };
        }),
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to redeem reward");
    } finally {
      setLoading(false);
    }
  };

  // Confirm Redemption
  const handleConfirmRedemption = async () => {
    if (!redeemCodeInput.trim() || !selectedLocationId) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/v1/staff/redemptions/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          code: redeemCodeInput.trim(),
          locationId: selectedLocationId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Failed to confirm redemption");

      setSuccessData({
        title: "Reward Redeemed!",
        message: `Confirmed redemption for "${json.data.rewardTitle}".`,
        newBalance: json.data.newBalance,
        pointsDelta: -json.data.pointsDeducted,
      });
      setRedeemCodeInput("");
      setRedeemValidation(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error confirming redemption");
    } finally {
      setLoading(false);
    }
  };

  // Fetch recent transactions
  const handleLoadHistory = async () => {
    setActiveTab("history");
    try {
      const res = await fetch("/api/v1/staff/transactions");
      if (res.ok) {
        const json = await res.json();
        setTransactions(json.data || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Fetch store products & campaign QRs
  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/products");
      if (res.ok) {
        const json = await res.json();
        setProductsList(json.data || []);
      }
    } catch (err) {
      console.error("Failed to load products", err);
    }
  }, []);

  const fetchCampaignQrs = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/campaign-qrs");
      if (res.ok) {
        const json = await res.json();
        setCampaignQrs(json.data || []);
      }
    } catch (e) {
      console.error("Failed to load campaign QRs", e);
    }
  }, []);

  const fetchPromoReports = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/campaign-qrs/reports");
      if (res.ok) {
        const json = await res.json();
        setPromoReports(json.data || []);
      }
    } catch (e) {
      console.error("Failed to load promo scan reports", e);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchCampaignQrs();
    fetchPromoReports();
  }, [fetchProducts, fetchCampaignQrs, fetchPromoReports]);

  const handleCreatePromoQr = async () => {
    if (!promoTitle.trim()) {
      alert("Please enter a campaign title");
      return;
    }
    try {
      setLoading(true);
      const res = await fetch("/api/v1/campaign-qrs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: promoTitle.trim(),
          offerType: promoOfferType,
          pointsToAward: promoOfferType === "points_bonus" ? parseInt(promoPoints || "0", 10) : undefined,
          productId: promoOfferType === "free_product" && promoSelectedProdId ? promoSelectedProdId : undefined,
          discountPercent: promoOfferType === "discount_promo" ? parseInt(promoDiscountPct || "0", 10) : undefined,
          requiredVisits: parseInt(promoRequiredVisits || "1", 10),
          validityDays: parseInt(promoValidityDays || "30", 10),
          locationId: selectedLocationId || undefined,
        }),
      });
      if (res.ok) {
        setShowCreatePromoModal(false);
        setPromoTitle("");
        setPromoPoints("10");
        setPromoRequiredVisits("3");
        setPromoValidityDays("30");
        setPromoSelectedProdId("");
        fetchCampaignQrs();
        fetchPromoReports();
      } else {
        const json = await res.json();
        alert(json.error?.message || "Failed to generate offer QR code");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApproveScan = async (scanId: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/campaign-qrs/scans/${scanId}/approve`, {
        method: "PATCH",
      });
      if (res.ok) {
        fetchPromoReports();
        fetchCampaignQrs();
      } else {
        const json = await res.json();
        alert(json.error?.message || "Failed to approve claim");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDiscardScan = async (scanId: string) => {
    if (!confirm("Are you sure you want to discard / reset this claim?")) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/campaign-qrs/scans/${scanId}/discard`, {
        method: "PATCH",
      });
      if (res.ok) {
        fetchPromoReports();
      } else {
        const json = await res.json();
        alert(json.error?.message || "Failed to discard claim");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivatePromoQr = async (qrId: string) => {
    if (!confirm("Are you sure you want to expire and deactivate this QR code?")) return;
    try {
      const res = await fetch(`/api/v1/campaign-qrs/${qrId}/deactivate`, {
        method: "PATCH",
      });
      if (res.ok) {
        fetchCampaignQrs();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Create Product as Staff
  const handleCreateProduct = async () => {
    if (!newProdName.trim()) return;
    try {
      setLoading(true);
      const res = await fetch("/api/v1/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProdName.trim(),
          category: newProdCategory,
          priceMinor: Math.round(parseFloat(newProdPrice || "0") * 100),
          pointsAwarded: parseInt(newProdPoints || "0", 10),
          discountPercent: parseInt(newProdDiscount || "0", 10),
        }),
      });
      if (res.ok) {
        setShowAddProdModal(false);
        setNewProdName("");
        fetchProducts();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Set Today's Storewide Discount
  const handleApplyDailyDiscount = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discountPercent: parseInt(dailyDiscountSetting || "0", 10),
        }),
      });
      if (res.ok) {
        fetchProducts();
        alert(`Today's storewide promotional discount (${dailyDiscountSetting}%) applied to all products!`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Quick tap product to add to spend
  const handleTapProduct = (prod: ProductItem) => {
    const discountedPrice = Math.round(prod.priceMinor * (1 - (prod.discountPercent || 0) / 100)) / 100;
    const current = parseFloat(spendInput || "0");
    const nextTotal = (current + discountedPrice).toFixed(2);
    setSpendInput(nextTotal);
  };

  return (
    <div className="min-h-screen bg-paper text-zinc-900 pb-20 overflow-x-hidden w-full max-w-full">
      {/* Top Header Bar - High-End POS Shell */}
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white px-4 sm:px-6 lg:px-8 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <BusinessLogo
              name={business?.name || "Business"}
              logoUrl={business?.logoUrl}
              brandColor={business?.brandPrimaryHex}
              size="md"
            />
            <div className="min-w-0">
              <p className="font-display font-bold text-base text-evergreen-deep leading-tight truncate">
                {business?.name || "Staff scanner"}
              </p>
              <p className="text-xs text-zinc-500">Staff scanner</p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {/* Location Selector */}
            {locations.length > 0 && (
              <div className="flex items-center space-x-1 text-xs bg-zinc-50 border border-zinc-200 px-2 py-1 rounded-lg">
                <MapPin className="h-3.5 w-3.5 text-zinc-700 shrink-0 stroke-[1.8]" />
                <select
                  value={selectedLocationId}
                  onChange={(e) => handleSelectLocation(e.target.value)}
                  className="bg-transparent font-semibold text-zinc-800 text-xs py-0.5 focus:outline-none cursor-pointer max-w-[110px] sm:max-w-none truncate"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id} className="text-zinc-900 font-medium">
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={async () => {
                await fetch("/api/v1/auth/logout", { method: "POST" });
                window.location.href = "/login";
              }}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 px-3 py-1.5 rounded-full hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container (Enterprise Responsive max-w-5xl) */}
      <main className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-6">
        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-4 flex items-start space-x-3 rounded-2xl bg-rose-50 p-4 border border-rose-200 text-rose-800 animate-in fade-in shadow-xs">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-rose-600" />
            <div className="flex-1 text-xs font-semibold">{errorMsg}</div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-xs font-bold text-rose-700 hover:underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Success Modal / Screen */}
        {successData && (
          <div className="mb-6 rounded-3xl bg-white border-2 border-emerald-500/80 p-6 shadow-xl text-center animate-in zoom-in-95 relative overflow-hidden">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 mx-auto flex items-center justify-center mb-3 shadow-inner">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">{successData.title}</h2>
            <p className="mt-1 text-slate-600 text-xs font-medium">{successData.message}</p>
            <div className="my-4 rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
              <span className="text-xs text-emerald-700 font-extrabold block">
                New balance
              </span>
              <div className="text-3xl font-bold text-emerald-800 mt-1 tabular-nums">
                {successData.newBalance} pts
              </div>
            </div>
            <Button
              variant="default"
              size="lg"
              className="w-full font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md rounded-2xl cursor-pointer"
              onClick={() => setSuccessData(null)}
            >
              Next customer
            </Button>
          </div>
        )}

        {/* Active Member Selected Card */}
        {activeMember ? (
          <div className="mb-6 bg-white rounded-3xl border border-slate-200/90 shadow-lg p-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <span className="text-sm text-zinc-500">Serving</span>
                <h3 className="text-2xl font-bold text-evergreen-deep">{activeMember.displayName}</h3>
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  Card #{activeMember.memberNumber}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveMember(null)}
                className="text-xs font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Change customer
              </Button>
            </div>

            <div>
              {/* Balance Banner */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-2xl bg-marigold p-4 text-evergreen-deep">
                  <p className="text-sm font-semibold">
                    {business?.programmeType === "stamps" ? "Stamps to spend" : "Points to spend"}
                  </p>
                  <p className="font-display text-3xl font-bold tabular-nums">{activeMember.balance}</p>
                </div>
                <div className="rounded-2xl bg-paper border border-zinc-200 p-4 text-evergreen-deep">
                  <p className="text-sm text-zinc-600">Earned all-time</p>
                  <p className="font-display text-3xl font-bold tabular-nums">{activeMember.lifetimeEarned ?? 0}</p>
                </div>
              </div>

              {/* Stamp cards */}
              {activeMember.stampCards && activeMember.stampCards.length > 0 && (
                <div className="mb-5">
                  <h4 className="font-display text-lg font-bold text-evergreen-deep mb-2">Stamp cards</h4>
                  {stampNotice && (
                    <p className="mb-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                      {stampNotice}
                    </p>
                  )}
                  <div className="space-y-2.5">
                    {activeMember.stampCards.map((card) => {
                      const busy = stampBusyId === card.offerId;
                      const live = card.offerStatus === "active";
                      return (
                        <div key={card.offerId} className="rounded-2xl border border-zinc-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-zinc-900">{card.title}</p>
                              <p className="text-sm text-zinc-500">Reward: free {card.rewardName}</p>
                            </div>
                            <span className="font-display text-xl font-bold text-evergreen-deep tabular-nums shrink-0">
                              {card.stamps}/{card.requiredStamps}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1.5" aria-hidden>
                            {Array.from({ length: card.requiredStamps }).map((_, i) => (
                              <span
                                key={i}
                                className={`w-7 h-7 rounded-full flex items-center justify-center ${
                                  i < card.stamps ? "bg-marigold text-evergreen-deep" : "border-2 border-dashed border-zinc-300"
                                }`}
                              >
                                {i < card.stamps && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                              </span>
                            ))}
                          </div>
                          <div className="mt-3">
                            {card.state === "collecting" ? (
                              <button
                                type="button"
                                disabled={busy || !live}
                                onClick={() => handleStampAction(card.offerId, "add")}
                                className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full bg-evergreen text-white text-sm font-semibold hover:bg-evergreen-deep cursor-pointer disabled:opacity-60"
                              >
                                <Stamp className="w-4 h-4" />
                                {busy ? "Adding..." : live ? "Add a stamp" : "Offer ended"}
                              </button>
                            ) : (
                              <div className="flex flex-wrap items-center gap-3">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleStampAction(card.offerId, "give_reward")}
                                  className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full bg-marigold text-evergreen-deep text-sm font-bold hover:brightness-95 cursor-pointer disabled:opacity-60"
                                >
                                  <Gift className="w-4 h-4" />
                                  {busy ? "Saving..." : `Hand over free ${card.rewardName}`}
                                </button>
                                <span className="text-sm text-zinc-600">
                                  {card.state === "pending" ? "Customer has claimed it" : "Card is full"}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Earn Form */}
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-extrabold text-slate-700">
                      Qualifying Spend (£)
                    </label>
                    <span className="text-[11px] text-slate-400 font-medium">Integer minor pence arithmetic</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-4 top-3 text-xl font-bold text-slate-400">
                      £
                    </span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={spendInput}
                      onChange={(e) => setSpendInput(e.target.value)}
                      className="pl-8 text-2xl font-bold tracking-tight text-slate-900 h-13 rounded-2xl bg-slate-50/70 border-slate-200 focus:bg-white"
                    />
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="grid grid-cols-5 gap-1.5 mt-2">
                    {[5, 10, 20, 50, 100].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setSpendInput(preset.toFixed(2))}
                        className="py-1.5 px-2 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
                      >
                        +£{preset}
                      </button>
                    ))}
                  </div>

                  {/* Quick Tap Products from Store Menu */}
                  {productsList.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-extrabold text-slate-500">
                          Tap Menu Item to Add to Bill
                        </span>
                        <button
                          type="button"
                          onClick={() => setSpendInput("0.00")}
                          className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
                        >
                          Clear Bill
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                        {productsList.map((prod) => {
                          const discount = prod.discountPercent || 0;
                          const finalPrice = ((prod.priceMinor * (1 - discount / 100)) / 100).toFixed(2);
                          return (
                            <button
                              key={prod.id}
                              type="button"
                              onClick={() => handleTapProduct(prod)}
                              className="py-1 px-2.5 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 border border-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                            >
                              <span>{prod.name}</span>
                              <span className="font-mono font-bold text-indigo-700">£{finalPrice}</span>
                              {discount > 0 && (
                                <span className="text-[11px] bg-rose-100 text-rose-700 font-extrabold px-1 rounded-sm">
                                  -{discount}%
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">
                    Tip (£) — Excluded from loyalty calculation
                  </label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={tipInput}
                    onChange={(e) => setTipInput(e.target.value)}
                    className="text-xs rounded-xl bg-slate-50 border-slate-200"
                  />
                </div>

                {/* Points Preview Indicator */}
                {previewLoading ? (
                  <div className="flex items-center space-x-2 text-xs text-slate-500 py-1.5 px-3 bg-slate-50 rounded-xl">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-600" />
                    <span>Calculating ledger reward...</span>
                  </div>
                ) : previewPoints !== null ? (
                  <div className="rounded-2xl bg-indigo-50/80 border border-indigo-200 p-3.5 flex items-center justify-between text-indigo-950 shadow-2xs">
                    <span className="flex items-center text-xs font-extrabold">
                      <Sparkles className="h-4 w-4 mr-1.5 text-indigo-600" />
                      Will award to ledger:
                    </span>
                    <span className="text-lg font-bold text-indigo-600 tabular-nums">+{previewPoints} points</span>
                  </div>
                ) : null}

                {/* Duplicate Visit Manager Override */}
                {managerOverride && (
                  <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3.5 text-amber-900 shadow-2xs">
                    <label className="text-xs font-bold block mb-1">
                      ⚠️ Duplicate Visit Protection: Manager Override Reason
                    </label>
                    <Input
                      placeholder="e.g. Split bill / second purchase with manager consent"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      className="text-xs bg-white border-amber-300 rounded-xl"
                    />
                  </div>
                )}

                {/* Confirm Earn Button */}
                <Button
                  variant="default"
                  size="lg"
                  className="w-full text-sm font-bold shadow-md bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl h-12 cursor-pointer transition-all"
                  onClick={handleConfirmEarn}
                  disabled={loading || !spendInput}
                >
                  {loading ? "Recording in Ledger..." : "Confirm & Award Points →"}
                </Button>
              </div>

              {/* Available Rewards Quick Redeem */}
              {activeMember.availableRewards.length > 0 && (
                <div className="mt-6 pt-5 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-slate-700 mb-3 flex items-center">
                    <Gift className="h-4 w-4 mr-1.5 text-purple-600" />
                    Available Rewards for Customer
                  </h4>
                  <div className="space-y-2">
                    {activeMember.availableRewards.map((reward) => (
                      <div
                        key={reward.id}
                        className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-slate-50/70"
                      >
                        <div>
                          <div className="font-bold text-xs text-slate-900">{reward.title}</div>
                          <div className="text-[11px] text-slate-500 font-semibold">
                            Cost: {reward.costPoints} points
                          </div>
                        </div>
                        {reward.eligible ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="success" className="bg-emerald-100 text-emerald-800 border-emerald-300 font-bold text-xs">
                              Eligible
                            </Badge>
                            <Button
                              size="sm"
                              onClick={() => handleStaffDirectRedeem(reward)}
                              disabled={loading}
                              className="h-7 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-2.5 cursor-pointer shadow-2xs"
                            >
                              Redeem Now →
                            </Button>
                          </div>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Need {reward.pointsShortfall} more
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Main Tab Navigation */
          <div>
            <div className="grid grid-cols-5 gap-1 p-1.5 mb-5 bg-white rounded-2xl border border-zinc-200">
              <button
                onClick={() => setActiveTab("scan")}
                className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                  activeTab === "scan"
                    ? "bg-evergreen text-white"
                    : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
                }`}
              >
                <QrCode className="h-4 w-4 mb-1 stroke-[1.8]" />
                <span className="truncate">Scan</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab("search");
                  handleSearch("");
                }}
                className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                  activeTab === "search"
                    ? "bg-evergreen text-white"
                    : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
                }`}
              >
                <Search className="h-4 w-4 mb-1 stroke-[1.8]" />
                <span className="truncate">Find</span>
              </button>
              <button
                onClick={() => setActiveTab("code")}
                className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                  activeTab === "code"
                    ? "bg-evergreen text-white"
                    : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
                }`}
              >
                <Gift className="h-4 w-4 mb-1 stroke-[1.8]" />
                <span className="truncate">Redeem</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab("products");
                  fetchProducts();
                }}
                className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                  activeTab === "products"
                    ? "bg-evergreen text-white"
                    : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
                }`}
              >
                <Package className="h-4 w-4 mb-1 stroke-[1.8]" />
                <span className="truncate">Products</span>
              </button>
              <button
                onClick={handleLoadHistory}
                className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                  activeTab === "history"
                    ? "bg-evergreen text-white"
                    : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
                }`}
              >
                <History className="h-4 w-4 mb-1 stroke-[1.8]" />
                <span className="truncate">Recent</span>
              </button>
            </div>

            {/* Tab 1: Scan Screen */}
            {activeTab === "scan" && (
              <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-lg font-bold text-evergreen-deep">Find the customer</h3>
                  <span className="text-sm text-zinc-500">Scan their QR or type their ID</span>
                </div>

                <QrCameraScanner onResult={(text) => handleResolveScan(text)} disabled={loading} />

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (customerIdInput.trim()) openMember({ memberNumber: customerIdInput });
                  }}
                  className="pt-4 border-t border-zinc-100"
                >
                  <label htmlFor="customer-id" className="block font-semibold text-zinc-900">
                    No QR code? Type their customer ID
                  </label>
                  <p className="text-sm text-zinc-500">It&rsquo;s shown under the QR code on the customer&rsquo;s card.</p>
                  <div className="mt-2 flex gap-2">
                    <Input
                      id="customer-id"
                      placeholder="e.g. YEQVHBSY"
                      value={customerIdInput}
                      onChange={(e) => setCustomerIdInput(e.target.value.toUpperCase())}
                      autoCapitalize="characters"
                      autoComplete="off"
                      className="text-lg font-semibold tracking-wider rounded-xl bg-zinc-50 border-zinc-200"
                    />
                    <Button
                      type="submit"
                      disabled={loading || !customerIdInput.trim()}
                      className="rounded-xl px-5 font-semibold cursor-pointer"
                    >
                      {loading ? "Looking up..." : "Look up"}
                    </Button>
                  </div>
                </form>

                <details className="rounded-2xl bg-zinc-50 border border-zinc-200 px-4 py-3 text-sm">
                  <summary className="cursor-pointer font-medium text-zinc-600">Testing tools</summary>
                  <div className="mt-3 space-y-3">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Paste a QR token, e.g. LP1.mem_..."
                        value={qrInput}
                        onChange={(e) => setQrInput(e.target.value)}
                        className="font-mono text-xs rounded-xl bg-white border-zinc-200"
                      />
                      <Button
                        variant="outline"
                        onClick={() => handleResolveScan()}
                        disabled={loading || !qrInput.trim()}
                        className="rounded-xl text-sm cursor-pointer"
                      >
                        Open
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleResolveScan("LP1.mem_barber1")}
                        className="p-2.5 bg-white hover:border-evergreen border border-zinc-200 rounded-xl text-left cursor-pointer"
                      >
                        <p className="font-semibold text-zinc-900">James (barber)</p>
                        <p className="text-xs text-zinc-500">Points customer</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResolveScan("LP1.mem_coffee1")}
                        className="p-2.5 bg-white hover:border-evergreen border border-zinc-200 rounded-xl text-left cursor-pointer"
                      >
                        <p className="font-semibold text-zinc-900">Sarah (coffee)</p>
                        <p className="text-xs text-zinc-500">Stamps customer</p>
                      </button>
                    </div>
                  </div>
                </details>
              </div>
            )}

            {/* Tab 2: Registered Customers & Search Screen */}
            {activeTab === "search" && (
              <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Enrolled Customers Directory</h3>
                    <p className="text-[11px] text-slate-500">Live list of customers registered at your store</p>
                  </div>
                  <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                    {searchResults.length} Customers
                  </span>
                </div>

                <div className="flex space-x-2">
                  <Input
                    placeholder="Search by customer name, email, or member #..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="text-xs rounded-xl bg-slate-50 border-slate-200"
                  />
                  <Button
                    onClick={() => handleSearch()}
                    disabled={loading}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs px-4 cursor-pointer"
                  >
                    Search
                  </Button>
                </div>

                {searchResults.length > 0 ? (
                  <div className="space-y-2 pt-1 max-h-96 overflow-y-auto pr-1">
                    {searchResults.map((member) => (
                      <div
                        key={member.membershipId}
                        onClick={() => openMember({ membershipId: member.membershipId })}
                        className="p-3.5 rounded-2xl border border-slate-200 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/30 flex items-center justify-between cursor-pointer transition-all shadow-2xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-900">{member.name || member.displayName}</span>
                            <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                              #{member.memberNumber}
                            </span>
                          </div>
                          {member.email && (
                            <div className="text-sm text-slate-500">
                              {member.email}
                            </div>
                          )}
                          {member.joinedAt && (
                            <div className="text-xs text-slate-400">
                              Enrolled: {new Date(member.joinedAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-sm text-indigo-700">
                            {member.balance} pts
                          </div>
                          <span className="inline-block mt-0.5 text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                            Select Member →
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    {searchQuery ? `No customers found matching "${searchQuery}".` : "No registered customers yet."}
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Redemption Code Screen */}
            {activeTab === "code" && (
              <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-900">Validate 8-Char Claim Voucher</h3>
                  <span className="text-xs font-bold text-slate-400">One-Time Token</span>
                </div>

                <div>
                  <label className="text-xs font-extrabold text-slate-600 block mb-1">
                    Redemption Code (from Customer Screen)
                  </label>
                  <Input
                    type="text"
                    maxLength={8}
                    placeholder="e.g. 7K9X2B4P"
                    value={redeemCodeInput}
                    onChange={(e) => setRedeemCodeInput(e.target.value.toUpperCase())}
                    className="text-center font-mono tracking-widest text-2xl font-bold uppercase h-14 rounded-2xl bg-slate-50 border-slate-200 text-slate-900"
                  />
                </div>

                <Button
                  variant="outline"
                  className="w-full font-bold text-xs rounded-xl border-slate-300 hover:bg-slate-50 cursor-pointer"
                  onClick={() => handleValidateRedeemCode()}
                  disabled={validatingRedeemCode || redeemCodeInput.length < 8}
                >
                  {validatingRedeemCode ? "Checking ledger..." : "Verify Code Validity"}
                </Button>

                {/* Validation Preview Card */}
                {redeemValidation && (
                  <div className="rounded-2xl border-2 border-emerald-400 bg-emerald-50/70 p-4 animate-in fade-in shadow-xs">
                    <div className="flex items-center space-x-2 text-emerald-800 font-bold mb-2 text-xs">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>VALID REWARD VOUCHER</span>
                    </div>
                    <div className="text-sm font-bold text-slate-900">
                      Reward: {redeemValidation.reward.title}
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      Cost: <span className="font-bold">{redeemValidation.reward.costPoints} points</span> (Customer Balance:{" "}
                      {redeemValidation.memberBalance} pts)
                    </div>

                    <Button
                      variant="default"
                      size="lg"
                      className="w-full mt-4 font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-md rounded-xl cursor-pointer"
                      onClick={handleConfirmRedemption}
                      disabled={loading}
                    >
                      {loading ? "Redeeming..." : "Confirm & Burn Voucher →"}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: Recent Transactions Screen */}
            {activeTab === "history" && (
              <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-900">Recent Terminal Activity</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLoadHistory}
                    className="p-1 text-slate-500 hover:text-slate-900 rounded-lg cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>

                <div>
                  {transactions.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-6">
                      No recent transactions recorded on this terminal session.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {transactions.map((tx) => (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between p-3 rounded-2xl border border-slate-200/80 bg-slate-50/60 text-xs shadow-2xs"
                        >
                          <div>
                            <div className="font-bold text-slate-900">{tx.displayName}</div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              #{tx.memberNumber} •{" "}
                              {new Date(tx.occurredAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>
                          <div className="text-right">
                            <span
                              className={`font-bold text-sm tabular-nums ${
                                tx.pointsDelta > 0 ? "text-emerald-600" : "text-rose-600"
                              }`}
                            >
                              {tx.pointsDelta > 0 ? `+${tx.pointsDelta}` : tx.pointsDelta} pts
                            </span>
                            <div className="text-[11px] capitalize font-extrabold text-slate-400">
                              {tx.type}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 5: Products & Daily Discount Screen */}
            {activeTab === "products" && (
              <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 pb-3 gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Products & Counter Offer QR Codes</h3>
                    <p className="text-xs text-slate-400">Generate dynamic promotional QR codes for customers at the counter</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setPromoTitle("");
                        setPromoOfferType("points_bonus");
                        setPromoPoints("10");
                        setPromoValidityDays("30");
                        setPromoSelectedProdId("");
                        setShowCreatePromoModal(true);
                      }}
                      className="bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs cursor-pointer flex items-center gap-1.5 shadow-sm"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>⚡ Generate Offer QR</span>
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setShowAddProdModal(true)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Add Item</span>
                    </Button>
                  </div>
                </div>

                {/* Today's Storewide Discount Control */}
                <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                      Today&apos;s Storewide Promo Discount
                    </span>
                    <span className="text-xs font-extrabold text-amber-700">{dailyDiscountSetting}% OFF</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {["0", "5", "10", "15", "20", "25", "50"].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setDailyDiscountSetting(pct)}
                        className={`px-2.5 py-1 text-xs rounded-lg font-bold border cursor-pointer transition-colors ${
                          dailyDiscountSetting === pct
                            ? "bg-amber-600 text-white border-amber-600"
                            : "bg-white text-slate-700 border-amber-200 hover:bg-amber-100"
                        }`}
                      >
                        {pct === "0" ? "None (0%)" : `${pct}%`}
                      </button>
                    ))}
                    <Button
                      size="sm"
                      onClick={handleApplyDailyDiscount}
                      className="ml-auto bg-amber-700 hover:bg-amber-800 text-white font-bold text-[11px] rounded-xl h-7"
                    >
                      Apply to All Items
                    </Button>
                  </div>
                </div>

                {/* ACTIVE PROMOTIONAL QR CODES FOR COUNTER DISPLAY */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <QrCode className="w-4 h-4 text-purple-600" />
                      <h4 className="text-xs font-extrabold text-slate-700">
                        Counter Promotional QR Codes
                      </h4>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={fetchCampaignQrs}
                      className="text-xs font-bold text-purple-600 hover:bg-purple-50"
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Refresh
                    </Button>
                  </div>

                  {campaignQrs.length === 0 ? (
                    <div className="p-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-center">
                      <p className="text-xs text-slate-500">
                        No promotional QR codes yet. Click <strong>&quot;⚡ Generate Offer QR&quot;</strong> to create one for customers to scan!
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {campaignQrs.map((qr) => {
                        const isExpired = qr.status === "expired" || new Date(qr.expiresAt) < new Date();
                        const isDeactivated = qr.status === "deactivated";
                        const isActive = !isExpired && !isDeactivated;
                        const daysLeft = Math.max(
                          0,
                          Math.ceil((new Date(qr.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                        );

                        return (
                          <div
                            key={qr.id}
                            className={`p-3.5 rounded-2xl border transition-all ${
                              isActive
                                ? "bg-white border-purple-200 shadow-2xs hover:shadow-md"
                                : "bg-slate-50 border-slate-200 opacity-60"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <span
                                className={`text-[11px] font-extrabold capitalize px-2 py-0.5 rounded-full border ${
                                  isActive
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : isDeactivated
                                    ? "bg-rose-50 text-rose-700 border-rose-200"
                                    : "bg-slate-100 text-slate-600 border-slate-200"
                                }`}
                              >
                                {isActive ? `Active • ${daysLeft}d left` : isDeactivated ? "Deactivated" : "Expired"}
                              </span>
                              <span className="text-xs font-mono text-slate-400 font-bold">{qr.code}</span>
                            </div>

                            <div className="flex items-center gap-3 mb-3">
                              <div
                                onClick={() => setFullscreenQr(qr)}
                                className="w-14 h-14 rounded-xl border border-slate-200 p-1 bg-white cursor-pointer hover:border-purple-500 shadow-2xs shrink-0"
                              >
                                <img src={qr.qrDataUrl} alt={qr.title} className="w-full h-full object-contain" />
                              </div>
                              <div className="min-w-0">
                                <h5 className="font-bold text-xs text-slate-900 truncate">{qr.title}</h5>
                                <p className="text-[11px] text-purple-700 font-semibold mt-0.5">
                                  {qr.offerType === "free_product" && `🎁 Free ${qr.productRewardName || "Item"}`}
                                  {qr.offerType === "points_bonus" && `+${qr.pointsToAward} Bonus Points`}
                                  {qr.offerType === "stamps_bonus" && `+1 Stamp`}
                                  {qr.offerType === "discount_promo" && `${qr.discountPercent}% OFF`}
                                </p>
                                <span className="text-xs text-slate-400 font-mono">
                                  {qr.totalScans} scans • {qr.totalClaims} claims
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                              <Button
                                size="sm"
                                onClick={() => setFullscreenQr(qr)}
                                className="flex-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-[11px] font-bold h-7 rounded-lg"
                              >
                                Show on Tablet Screen
                              </Button>

                              {isActive && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeactivatePromoQr(qr.id)}
                                  className="text-[11px] font-bold text-rose-600 hover:bg-rose-50 h-7 px-2 rounded-lg"
                                >
                                  Expire
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Product Catalog List */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-xs font-extrabold text-slate-700">
                      Product Catalog &amp; Menu
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">{productsList.length} items</span>
                  </div>

                  {productsList.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-xs">
                      No products added yet. Click &quot;+ Add Item&quot; to create your first menu item.
                    </div>
                  ) : (
                    productsList.map((prod) => {
                      const originalPrice = (prod.priceMinor / 100).toFixed(2);
                      const finalPrice = ((prod.priceMinor * (1 - (prod.discountPercent || 0) / 100)) / 100).toFixed(2);
                      return (
                        <div
                          key={prod.id}
                          className="p-3 rounded-2xl border border-slate-200 bg-slate-50/60 flex items-center justify-between text-xs shadow-2xs"
                        >
                          <div>
                            <div className="font-bold text-slate-900 text-xs flex items-center gap-2">
                              <span>{prod.name}</span>
                              <span className="text-xs bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-md font-semibold">
                                {prod.category}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Awards <span className="font-bold text-indigo-600">+{prod.pointsAwarded} pts</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="font-bold text-sm text-slate-900 tabular-nums">
                                £{finalPrice}
                              </div>
                              {prod.discountPercent > 0 && (
                                <div className="text-xs text-slate-400 line-through">
                                  £{originalPrice} ({prod.discountPercent}% off)
                                </div>
                              )}
                            </div>

                            <button
                              onClick={() => {
                                setPromoTitle(`Free ${prod.name} Counter Perk`);
                                setPromoOfferType("free_product");
                                setPromoSelectedProdId(prod.id);
                                setPromoValidityDays("30");
                                setShowCreatePromoModal(true);
                              }}
                              className="text-[11px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2 py-1 rounded-lg cursor-pointer transition-colors"
                            >
                              + QR
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* LIVE SCAN AUDIT REPORT IN STAFF TERMINAL */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-purple-600" />
                      <h4 className="text-xs font-extrabold text-slate-700">
                        Customer Scan Audit Log
                      </h4>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={fetchPromoReports}
                      className="text-xs font-bold text-purple-600 hover:bg-purple-50"
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Refresh
                    </Button>
                  </div>

                  {promoReports.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">
                      No customer promo scans recorded yet.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {promoReports.slice(0, 15).map((r) => {
                        const isPending = r.status === "pending_claim";
                        const isApproved = r.status === "approved";
                        const isDiscarded = r.status === "discarded";

                        return (
                          <div
                            key={r.id}
                            className={`p-3 rounded-2xl border text-xs transition-all ${
                              isPending
                                ? "bg-amber-50/70 border-amber-300 shadow-xs"
                                : "bg-white border-slate-200"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="font-bold text-slate-900 block">{r.memberName}</span>
                                <span className="text-xs text-slate-400 font-mono">
                                  #{r.memberNumber} • {new Date(r.scannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-bold text-xs border border-purple-200 inline-block">
                                  {r.requiredVisits > 1 ? `Visit ${r.visitNumber}/${r.requiredVisits}` : "1-Time Claim"}
                                </span>
                              </div>
                            </div>

                            <div className="mt-1 flex items-center justify-between text-[11px]">
                              <span className="font-semibold text-slate-700 truncate max-w-[160px]">
                                {r.campaignTitle}
                              </span>
                              {isPending && (
                                <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full animate-pulse">
                                  ⏳ Needs Counter Approval
                                </span>
                              )}
                              {isApproved && (
                                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                  ✓ Handed Over
                                </span>
                              )}
                              {isDiscarded && (
                                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                  Discarded
                                </span>
                              )}
                            </div>

                            {/* Counter Action Buttons for Staff */}
                            {isPending && (
                              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-amber-200/80">
                                <Button
                                  size="sm"
                                  onClick={() => handleApproveScan(r.id)}
                                  disabled={loading}
                                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] h-7 rounded-lg shadow-xs"
                                >
                                  ✓ Approve &amp; Give Perk
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDiscardScan(r.id)}
                                  disabled={loading}
                                  className="bg-white border-rose-200 text-rose-700 hover:bg-rose-50 font-bold text-[11px] h-7 px-2 rounded-lg"
                                >
                                  ✕ Discard
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add Product Modal */}
      {showAddProdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl relative border border-slate-200">
            <button
              onClick={() => setShowAddProdModal(false)}
              className="absolute right-4 top-4 p-2 text-slate-400 hover:text-slate-900 rounded-xl cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-1">Add Store Product</h3>
            <p className="text-xs text-slate-500 mb-4">Add a new item to store catalog with points and price.</p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Product Name</label>
                <Input
                  placeholder="e.g. Americano or Standard Haircut"
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  className="text-xs rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Price (£)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(e.target.value)}
                    className="text-xs rounded-xl"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Points Awarded</label>
                  <Input
                    type="number"
                    value={newProdPoints}
                    onChange={(e) => setNewProdPoints(e.target.value)}
                    className="text-xs rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Category</label>
                <select
                  value={newProdCategory}
                  onChange={(e) => setNewProdCategory(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 bg-slate-50 p-2.5 font-medium"
                >
                  <option value="Beverages">Beverages</option>
                  <option value="Food & Pastry">Food & Pastry</option>
                  <option value="Services">Services</option>
                  <option value="Retail & Merch">Retail & Merch</option>
                  <option value="General">General</option>
                </select>
              </div>

              <Button
                onClick={handleCreateProduct}
                disabled={loading || !newProdName.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl mt-2 cursor-pointer"
              >
                {loading ? "Adding Product..." : "Save Product"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Staff Generate Offer QR Modal */}
      {showCreatePromoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl relative border border-slate-200">
            <button
              onClick={() => setShowCreatePromoModal(false)}
              className="absolute right-4 top-4 p-2 text-slate-400 hover:text-slate-900 rounded-xl cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                <QrCode className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Generate Counter Offer QR</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Create a promotional QR code for customers to scan at the counter or table.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Offer Title</label>
                <Input
                  placeholder="e.g. Free Coffee, 10 Bonus Points, 15% Off"
                  value={promoTitle}
                  onChange={(e) => setPromoTitle(e.target.value)}
                  className="rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Offer Type</label>
                <select
                  value={promoOfferType}
                  onChange={(e) => setPromoOfferType(e.target.value as any)}
                  className="w-full text-xs rounded-xl border border-slate-200 bg-slate-50 p-2.5 font-medium"
                >
                  <option value="points_bonus">Bonus Points upon Scan</option>
                  <option value="free_product">Free Product / Item Perk</option>
                  <option value="discount_promo">Promotional Discount %</option>
                  <option value="stamps_bonus">Bonus Stamp (+1)</option>
                </select>
              </div>

              {promoOfferType === "free_product" && (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Select Free Product</label>
                  <select
                    value={promoSelectedProdId}
                    onChange={(e) => setPromoSelectedProdId(e.target.value)}
                    className="w-full text-xs rounded-xl border border-purple-200 bg-purple-50/50 p-2.5 font-medium"
                  >
                    <option value="">-- Choose from menu --</option>
                    {productsList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (£{(p.priceMinor / 100).toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {promoOfferType === "points_bonus" && (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Points to Award</label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="e.g. 10"
                    value={promoPoints}
                    onChange={(e) => setPromoPoints(e.target.value)}
                    className="rounded-xl text-xs"
                  />
                </div>
              )}

              {promoOfferType === "discount_promo" && (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Discount %</label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    placeholder="e.g. 15"
                    value={promoDiscountPct}
                    onChange={(e) => setPromoDiscountPct(e.target.value)}
                    className="rounded-xl text-xs"
                  />
                </div>
              )}

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Purchases / Visits Required (e.g. 3)
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    max="50"
                    placeholder="3"
                    value={promoRequiredVisits}
                    onChange={(e) => setPromoRequiredVisits(e.target.value)}
                    className="rounded-xl text-xs font-bold w-20"
                  />
                  <span className="text-[11px] text-slate-500">
                    {parseInt(promoRequiredVisits || "1", 10) > 1
                      ? `Must scan ${promoRequiredVisits} times to unlock reward`
                      : "Instant claim on 1st scan"}
                  </span>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Validity (Expiry)</label>
                <select
                  value={promoValidityDays}
                  onChange={(e) => setPromoValidityDays(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 bg-slate-50 p-2.5 font-medium"
                >
                  <option value="1">1 Day (Today Only)</option>
                  <option value="3">3 Days (Weekend Flash)</option>
                  <option value="7">7 Days (1 Week)</option>
                  <option value="14">14 Days (2 Weeks)</option>
                  <option value="30">30 Days (1 Month)</option>
                  <option value="90">90 Days</option>
                </select>
              </div>

              <Button
                onClick={handleCreatePromoQr}
                disabled={loading || !promoTitle.trim()}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl mt-2 cursor-pointer"
              >
                {loading ? "Generating..." : "Generate QR Code"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Counter Tablet QR Modal */}
      {fullscreenQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl relative border-2 border-purple-500">
            <button
              onClick={() => setFullscreenQr(null)}
              className="absolute right-4 top-4 p-2 text-slate-400 hover:text-slate-900 rounded-xl cursor-pointer"
            >
              <X className="h-6 w-6" />
            </button>

            <span className="text-xs font-extrabold capitalize px-3 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
              Point Phone Camera to Scan
            </span>

            <h3 className="text-xl font-bold text-slate-950 mt-3 mb-1">
              {fullscreenQr.title}
            </h3>
            <p className="text-xs text-purple-700 font-bold mb-4">
              {fullscreenQr.offerType === "free_product" && `🎁 Unlock Free ${fullscreenQr.productRewardName || "Perk"}!`}
              {fullscreenQr.offerType === "points_bonus" && `🎉 Claim +${fullscreenQr.pointsToAward} Bonus Points!`}
              {fullscreenQr.offerType === "stamps_bonus" && `🎉 Claim +1 Stamp on your card!`}
              {fullscreenQr.offerType === "discount_promo" && `🔥 Enjoy ${fullscreenQr.discountPercent}% Discount!`}
            </p>

            <div className="p-4 bg-white border-2 border-slate-200 rounded-2xl inline-block shadow-inner mb-4">
              <img
                src={fullscreenQr.qrDataUrl}
                alt={fullscreenQr.title}
                className="w-60 h-60 object-contain mx-auto"
              />
            </div>

            <p className="text-[11px] text-slate-400 font-medium">
              Valid until {new Date(fullscreenQr.expiresAt).toLocaleDateString()} • {fullscreenQr.totalScans} customers scanned
            </p>

            <Button
              variant="outline"
              onClick={() => setFullscreenQr(null)}
              className="w-full mt-4 font-bold text-xs rounded-xl"
            >
              Close Counter Screen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
