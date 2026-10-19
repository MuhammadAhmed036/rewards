"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
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
  balance: number;
  status: string;
  availableRewards: Array<{
    id: string;
    title: string;
    costPoints: number;
    eligible: boolean;
    pointsShortfall: number;
  }>;
}

interface TransactionItem {
  id: string;
  type: string;
  pointsDelta: number;
  occurredAt: string;
  memberNumber: string;
  displayName: string;
}

export default function StaffPage() {
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"scan" | "search" | "code" | "history">("scan");

  // Scanner & Member state
  const [qrInput, setQrInput] = useState("");
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
  }, []);

  const handleSelectLocation = (locId: string) => {
    setSelectedLocationId(locId);
    localStorage.setItem("loyalty_staff_loc", locId);
  };

  // Resolve QR scan
  const handleResolveScan = async (tokenToResolve?: string) => {
    const token = tokenToResolve || qrInput.trim();
    if (!token) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/v1/staff/scan/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, locationId: selectedLocationId }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Failed to resolve QR");
      }
      setActiveMember(json.data);
      setQrInput("");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error resolving QR");
    } finally {
      setLoading(false);
    }
  };

  // Search Members
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/v1/staff/members/search?q=${encodeURIComponent(searchQuery)}`);
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
  const handleValidateRedeemCode = async () => {
    if (!redeemCodeInput.trim()) return;
    setValidatingRedeemCode(true);
    setErrorMsg(null);
    setRedeemValidation(null);
    try {
      const res = await fetch("/api/v1/staff/redemptions/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: redeemCodeInput.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Validation failed");
      setRedeemValidation(json.data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error validating code");
    } finally {
      setValidatingRedeemCode(false);
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

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 pb-20 selection:bg-indigo-500 selection:text-white">
      {/* Top Header Bar - High-End POS Shell */}
      <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/95 backdrop-blur-md px-4 py-3 shadow-2xs">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white flex items-center justify-center font-black text-sm shadow-sm shadow-indigo-500/20">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-slate-900">Staff POS Terminal</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  LIVE
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Frontline Cashier • Double-Entry Ledger</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Location Selector */}
            {locations.length > 0 && (
              <div className="flex items-center space-x-1 text-xs bg-slate-50 border border-slate-200 px-2 py-1 rounded-xl">
                <MapPin className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                <select
                  value={selectedLocationId}
                  onChange={(e) => handleSelectLocation(e.target.value)}
                  className="bg-transparent font-bold text-slate-800 text-xs py-0.5 focus:outline-none cursor-pointer"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id} className="text-slate-900 font-medium">
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
              title="Sign Out"
              className="text-slate-400 hover:text-rose-600 p-2 rounded-xl hover:bg-rose-50 transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container (Mobile-first max-w-md) */}
      <main className="mx-auto max-w-md px-4 pt-5">
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
            <h2 className="text-2xl font-black text-slate-900">{successData.title}</h2>
            <p className="mt-1 text-slate-600 text-xs font-medium">{successData.message}</p>
            <div className="my-4 rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
              <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-extrabold block">
                Audited Ledger Balance
              </span>
              <div className="text-3xl font-black text-emerald-800 mt-1 tabular-nums">
                {successData.newBalance} pts
              </div>
            </div>
            <Button
              variant="default"
              size="lg"
              className="w-full font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md rounded-2xl cursor-pointer"
              onClick={() => setSuccessData(null)}
            >
              Done / Next Customer →
            </Button>
          </div>
        )}

        {/* Active Member Selected Card */}
        {activeMember ? (
          <div className="mb-6 bg-white rounded-3xl border border-slate-200/90 shadow-lg p-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600">Active Member</span>
                <h3 className="text-lg font-black text-slate-900">{activeMember.displayName}</h3>
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  ID: #{activeMember.memberNumber}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveMember(null)}
                className="text-xs font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Change Member
              </Button>
            </div>

            <div>
              {/* Balance Banner */}
              <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-slate-50 to-indigo-50/40 border border-slate-200/80 p-4 mb-4">
                <span className="text-xs font-bold text-slate-600">
                  Current Verified Balance
                </span>
                <span className="text-2xl font-black text-indigo-700 tabular-nums">
                  {activeMember.balance} pts
                </span>
              </div>

              {/* Earn Form */}
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                      Qualifying Spend (£)
                    </label>
                    <span className="text-[11px] text-slate-400 font-medium">Integer minor pence arithmetic</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-4 top-3 text-xl font-black text-slate-400">
                      £
                    </span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={spendInput}
                      onChange={(e) => setSpendInput(e.target.value)}
                      className="pl-8 text-2xl font-black tracking-tight text-slate-900 h-13 rounded-2xl bg-slate-50/70 border-slate-200 focus:bg-white"
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
                    <span className="flex items-center text-xs font-extrabold uppercase tracking-wide">
                      <Sparkles className="h-4 w-4 mr-1.5 text-indigo-600" />
                      Will award to ledger:
                    </span>
                    <span className="text-lg font-black text-indigo-600 tabular-nums">+{previewPoints} points</span>
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
                  className="w-full text-sm font-black shadow-md bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl h-12 cursor-pointer transition-all"
                  onClick={handleConfirmEarn}
                  disabled={loading || !spendInput}
                >
                  {loading ? "Recording in Ledger..." : "Confirm & Award Points →"}
                </Button>
              </div>

              {/* Available Rewards Quick Redeem */}
              {activeMember.availableRewards.length > 0 && (
                <div className="mt-6 pt-5 border-t border-slate-100">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3 flex items-center">
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
                          <Badge variant="success" className="bg-emerald-100 text-emerald-800 border-emerald-300 font-bold text-[10px]">Eligible</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">
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
            <div className="grid grid-cols-4 gap-1 p-1 mb-5 bg-slate-200/80 rounded-2xl border border-slate-300/60 shadow-2xs">
              <button
                onClick={() => setActiveTab("scan")}
                className={`flex flex-col items-center justify-center py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "scan"
                    ? "bg-white text-indigo-600 shadow-sm font-black"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <QrCode className="h-4 w-4 mb-1" />
                Scan QR
              </button>
              <button
                onClick={() => setActiveTab("search")}
                className={`flex flex-col items-center justify-center py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "search"
                    ? "bg-white text-indigo-600 shadow-sm font-black"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Search className="h-4 w-4 mb-1" />
                Lookup
              </button>
              <button
                onClick={() => setActiveTab("code")}
                className={`flex flex-col items-center justify-center py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "code"
                    ? "bg-white text-indigo-600 shadow-sm font-black"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Gift className="h-4 w-4 mb-1" />
                Redeem
              </button>
              <button
                onClick={handleLoadHistory}
                className={`flex flex-col items-center justify-center py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === "history"
                    ? "bg-white text-indigo-600 shadow-sm font-black"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <History className="h-4 w-4 mb-1" />
                Audit Log
              </button>
            </div>

            {/* Tab 1: Scan Screen */}
            {activeTab === "scan" && (
              <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-black text-slate-900">Scan Member QR Code</h3>
                  <span className="text-[10px] font-bold text-slate-400">High-speed optical scan</span>
                </div>

                {/* Laser Viewport Visualizer */}
                <div className="border-2 border-dashed border-indigo-200 rounded-2xl p-7 text-center flex flex-col items-center justify-center bg-gradient-to-b from-indigo-50/30 to-white relative overflow-hidden">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-3 text-indigo-600 shadow-inner">
                    <QrCode className="h-8 w-8 animate-pulse" />
                  </div>
                  <p className="text-xs font-bold text-slate-800">
                    Camera & Optical Scanner Active
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Align customer&apos;s digital pass QR inside frame
                  </p>
                </div>

                <div>
                  <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
                    Manual QR Token / Scanner Input
                  </label>
                  <Input
                    placeholder="e.g. LP1.mem_... or test token"
                    value={qrInput}
                    onChange={(e) => setQrInput(e.target.value)}
                    className="font-mono text-xs rounded-xl bg-slate-50 border-slate-200"
                  />
                </div>

                {/* Quick Simulation Buttons for 1-Click Testing */}
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block mb-2">
                    ⚡ Instant 1-Click Test Scans
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => handleResolveScan("LP1.mem_barber1")}
                      className="p-2 bg-white hover:bg-indigo-50 hover:border-indigo-300 border border-slate-200 rounded-xl text-left cursor-pointer transition-colors shadow-2xs"
                    >
                      <p className="font-bold text-slate-900 text-xs">Scan James Barber</p>
                      <p className="text-[10px] text-slate-400">#BM-001 • Points</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResolveScan("LP1.mem_coffee1")}
                      className="p-2 bg-white hover:bg-amber-50 hover:border-amber-300 border border-slate-200 rounded-xl text-left cursor-pointer transition-colors shadow-2xs"
                    >
                      <p className="font-bold text-slate-900 text-xs">Scan Sarah Coffee</p>
                      <p className="text-[10px] text-slate-400">#CM-002 • Stamps</p>
                    </button>
                  </div>
                </div>

                <Button
                  variant="default"
                  size="lg"
                  className="w-full font-black text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl h-11 cursor-pointer shadow-md"
                  onClick={() => handleResolveScan()}
                  disabled={loading || !qrInput.trim()}
                >
                  {loading ? "Resolving Token..." : "Resolve Scanned QR Code →"}
                </Button>
              </div>
            )}

            {/* Tab 2: Search Member Screen */}
            {activeTab === "search" && (
              <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-black text-slate-900">Search Member Directory</h3>
                  <span className="text-[10px] font-bold text-slate-400">Phone, Name or Number</span>
                </div>

                <div className="flex space-x-2">
                  <Input
                    placeholder="Member number (e.g. 7X8Y9Z) or name"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="text-xs rounded-xl bg-slate-50 border-slate-200"
                  />
                  <Button
                    onClick={handleSearch}
                    disabled={loading}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs px-4 cursor-pointer"
                  >
                    Search
                  </Button>
                </div>

                {searchResults.length > 0 && (
                  <div className="space-y-2 pt-1">
                    {searchResults.map((member) => (
                      <div
                        key={member.membershipId}
                        onClick={() => setActiveMember(member)}
                        className="p-3.5 rounded-2xl border border-slate-200 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/30 flex items-center justify-between cursor-pointer transition-all shadow-2xs"
                      >
                        <div>
                          <div className="font-bold text-sm text-slate-900">{member.displayName}</div>
                          <div className="text-xs text-slate-400 font-mono">
                            #{member.memberNumber}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-black text-sm text-indigo-700">
                            {member.balance} pts
                          </div>
                          <span className="inline-block mt-0.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                            Select Member →
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Redemption Code Screen */}
            {activeTab === "code" && (
              <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-black text-slate-900">Validate 8-Char Claim Voucher</h3>
                  <span className="text-[10px] font-bold text-slate-400">One-Time Token</span>
                </div>

                <div>
                  <label className="text-xs font-extrabold uppercase tracking-wider text-slate-600 block mb-1">
                    Redemption Code (from Customer Screen)
                  </label>
                  <Input
                    type="text"
                    maxLength={8}
                    placeholder="e.g. 7K9X2B4P"
                    value={redeemCodeInput}
                    onChange={(e) => setRedeemCodeInput(e.target.value.toUpperCase())}
                    className="text-center font-mono tracking-widest text-2xl font-black uppercase h-14 rounded-2xl bg-slate-50 border-slate-200 text-slate-900"
                  />
                </div>

                <Button
                  variant="outline"
                  className="w-full font-bold text-xs rounded-xl border-slate-300 hover:bg-slate-50 cursor-pointer"
                  onClick={handleValidateRedeemCode}
                  disabled={validatingRedeemCode || redeemCodeInput.length < 8}
                >
                  {validatingRedeemCode ? "Checking ledger..." : "Verify Code Validity"}
                </Button>

                {/* Validation Preview Card */}
                {redeemValidation && (
                  <div className="rounded-2xl border-2 border-emerald-400 bg-emerald-50/70 p-4 animate-in fade-in shadow-xs">
                    <div className="flex items-center space-x-2 text-emerald-800 font-black mb-2 text-xs">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>VALID REWARD VOUCHER</span>
                    </div>
                    <div className="text-sm font-black text-slate-900">
                      Reward: {redeemValidation.reward.title}
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      Cost: <span className="font-bold">{redeemValidation.reward.costPoints} points</span> (Customer Balance:{" "}
                      {redeemValidation.memberBalance} pts)
                    </div>

                    <Button
                      variant="default"
                      size="lg"
                      className="w-full mt-4 font-black text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-md rounded-xl cursor-pointer"
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
                  <h3 className="text-sm font-black text-slate-900">Recent Terminal Activity</h3>
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
                              className={`font-black text-sm tabular-nums ${
                                tx.pointsDelta > 0 ? "text-emerald-600" : "text-rose-600"
                              }`}
                            >
                              {tx.pointsDelta > 0 ? `+${tx.pointsDelta}` : tx.pointsDelta} pts
                            </span>
                            <div className="text-[9px] uppercase font-extrabold text-slate-400 tracking-wider">
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
          </div>
        )}
      </main>
    </div>
  );
}
