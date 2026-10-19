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
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 pb-16">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white font-bold text-sm dark:bg-slate-100 dark:text-slate-900">
              LP
            </span>
            <span className="font-bold text-lg">Staff Terminal</span>
          </div>

          <div className="flex items-center space-x-2">
            {/* Location Selector */}
            {locations.length > 0 && (
              <div className="flex items-center space-x-1 text-xs">
                <MapPin className="h-4 w-4 text-slate-500" />
                <select
                  value={selectedLocationId}
                  onChange={(e) => handleSelectLocation(e.target.value)}
                  className="bg-transparent font-medium py-1 px-1 rounded focus:outline-none border-b border-dashed border-slate-400"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id} className="text-slate-900">
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
              className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container (Mobile-first max-w-md) */}
      <main className="mx-auto max-w-md px-4 pt-4">
        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-4 flex items-start space-x-3 rounded-2xl bg-rose-50 p-4 border border-rose-200 text-rose-800 dark:bg-rose-950/50 dark:border-rose-900 dark:text-rose-200 animate-in fade-in">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-rose-600" />
            <div className="flex-1 text-sm font-medium">{errorMsg}</div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-xs font-bold text-rose-700 hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Success Modal / Screen */}
        {successData && (
          <div className="mb-6 rounded-3xl bg-emerald-600 text-white p-6 shadow-lg text-center animate-in zoom-in-95">
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-100 mb-3" />
            <h2 className="text-2xl font-extrabold">{successData.title}</h2>
            <p className="mt-2 text-emerald-100 text-base">{successData.message}</p>
            <div className="my-5 rounded-2xl bg-emerald-700/60 p-4">
              <span className="text-xs uppercase tracking-wider text-emerald-200 font-semibold">
                Updated Balance
              </span>
              <div className="text-3xl font-extrabold mt-1">
                {successData.newBalance} pts
              </div>
            </div>
            <Button
              variant="secondary"
              size="lg"
              className="w-full font-bold text-emerald-950 shadow-md bg-white hover:bg-emerald-50"
              onClick={() => setSuccessData(null)}
            >
              Done / Next Customer
            </Button>
          </div>
        )}

        {/* Active Member Selected Card */}
        {activeMember ? (
          <Card className="mb-6 border-slate-900/10 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-xl">{activeMember.displayName}</CardTitle>
                <div className="text-xs text-slate-500 font-mono mt-0.5">
                  #{activeMember.memberNumber}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveMember(null)}
                className="text-slate-500 hover:text-slate-900"
              >
                Change
              </Button>
            </CardHeader>

            <CardContent>
              {/* Balance Banner */}
              <div className="flex items-center justify-between rounded-xl bg-slate-100 dark:bg-slate-800 p-4 mb-4">
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  Current Balance
                </span>
                <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
                  {activeMember.balance} pts
                </span>
              </div>

              {/* Earn Form */}
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Qualifying Spend (£)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-3 text-lg font-bold text-slate-400">
                      £
                    </span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={spendInput}
                      onChange={(e) => setSpendInput(e.target.value)}
                      className="pl-8 text-xl font-bold tracking-tight"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">
                    Tip (£) — Excluded from points
                  </label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={tipInput}
                    onChange={(e) => setTipInput(e.target.value)}
                    className="text-sm"
                  />
                </div>

                {/* Points Preview Indicator */}
                {previewLoading ? (
                  <div className="flex items-center space-x-2 text-xs text-slate-500 py-1">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    <span>Calculating points...</span>
                  </div>
                ) : previewPoints !== null ? (
                  <div className="rounded-xl bg-indigo-50 border border-indigo-100 dark:bg-indigo-950/40 dark:border-indigo-900 p-3 flex items-center justify-between text-indigo-900 dark:text-indigo-200">
                    <span className="flex items-center text-sm font-semibold">
                      <Sparkles className="h-4 w-4 mr-1.5 text-indigo-600" />
                      Will award:
                    </span>
                    <span className="text-lg font-black">+{previewPoints} points</span>
                  </div>
                ) : null}

                {/* Duplicate Visit Manager Override */}
                {managerOverride && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-amber-900 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-200">
                    <label className="text-xs font-bold block mb-1">
                      Manager Override Reason (Required)
                    </label>
                    <Input
                      placeholder="e.g. Customer split bill / second round"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      className="text-sm bg-white dark:bg-slate-900"
                    />
                  </div>
                )}

                {/* Confirm Earn Button */}
                <Button
                  variant="default"
                  size="lg"
                  className="w-full text-base font-bold shadow-md"
                  onClick={handleConfirmEarn}
                  disabled={loading || !spendInput}
                >
                  {loading ? "Confirming..." : "Confirm & Award Points"}
                </Button>
              </div>

              {/* Available Rewards Quick Redeem */}
              {activeMember.availableRewards.length > 0 && (
                <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800">
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center">
                    <Gift className="h-4 w-4 mr-1 text-purple-600" />
                    Available Rewards
                  </h4>
                  <div className="space-y-2">
                    {activeMember.availableRewards.map((reward) => (
                      <div
                        key={reward.id}
                        className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900"
                      >
                        <div>
                          <div className="font-semibold text-sm">{reward.title}</div>
                          <div className="text-xs text-slate-500">
                            {reward.costPoints} points
                          </div>
                        </div>
                        {reward.eligible ? (
                          <Badge variant="success">Eligible</Badge>
                        ) : (
                          <Badge variant="secondary">
                            Need {reward.pointsShortfall} more
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          /* Main Tab Navigation */
          <div>
            <div className="grid grid-cols-4 gap-1 p-1 mb-5 bg-slate-200 dark:bg-slate-800 rounded-2xl">
              <button
                onClick={() => setActiveTab("scan")}
                className={`flex flex-col items-center justify-center py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === "scan"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
                }`}
              >
                <QrCode className="h-5 w-5 mb-1" />
                Scan
              </button>
              <button
                onClick={() => setActiveTab("search")}
                className={`flex flex-col items-center justify-center py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === "search"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
                }`}
              >
                <Search className="h-5 w-5 mb-1" />
                Search
              </button>
              <button
                onClick={() => setActiveTab("code")}
                className={`flex flex-col items-center justify-center py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === "code"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
                }`}
              >
                <Gift className="h-5 w-5 mb-1" />
                Redeem
              </button>
              <button
                onClick={handleLoadHistory}
                className={`flex flex-col items-center justify-center py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === "history"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400"
                }`}
              >
                <History className="h-5 w-5 mb-1" />
                Recent
              </button>
            </div>

            {/* Tab 1: Scan Screen */}
            {activeTab === "scan" && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Scan Member QR</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-8 text-center flex flex-col items-center justify-center bg-slate-50/50 dark:bg-slate-900/50">
                    <QrCode className="h-16 w-16 text-slate-400 mb-2 animate-pulse" />
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                      Point camera at Member QR code
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Camera scanner active or paste token below
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">
                      Manual QR Token / Camera Decode Fallback
                    </label>
                    <Input
                      placeholder="e.g. LP1.mem_... or test token"
                      value={qrInput}
                      onChange={(e) => setQrInput(e.target.value)}
                    />
                  </div>

                  <Button
                    variant="default"
                    size="lg"
                    className="w-full font-bold"
                    onClick={() => handleResolveScan()}
                    disabled={loading || !qrInput.trim()}
                  >
                    {loading ? "Resolving..." : "Lookup Scanned Code"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Tab 2: Search Member Screen */}
            {activeTab === "search" && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Find Member</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex space-x-2">
                    <Input
                      placeholder="Member number (e.g. 7X8Y9Z) or name"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    />
                    <Button onClick={handleSearch} disabled={loading}>
                      Search
                    </Button>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="space-y-2 pt-2">
                      {searchResults.map((member) => (
                        <div
                          key={member.membershipId}
                          onClick={() => setActiveMember(member)}
                          className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between cursor-pointer hover:border-slate-400 transition-colors"
                        >
                          <div>
                            <div className="font-bold text-base">{member.displayName}</div>
                            <div className="text-xs text-slate-500 font-mono">
                              #{member.memberNumber}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-extrabold text-base text-slate-900 dark:text-slate-100">
                              {member.balance} pts
                            </div>
                            <Badge variant="outline" className="text-[10px]">
                              Select
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Tab 3: Redemption Code Screen */}
            {activeTab === "code" && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Enter Redemption Code</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-slate-600 block mb-1">
                      8-Character One-Time Code
                    </label>
                    <Input
                      type="text"
                      maxLength={8}
                      placeholder="e.g. 7K9X2B4P"
                      value={redeemCodeInput}
                      onChange={(e) => setRedeemCodeInput(e.target.value.toUpperCase())}
                      className="text-center font-mono tracking-widest text-2xl font-bold uppercase"
                    />
                  </div>

                  <Button
                    variant="outline"
                    className="w-full font-bold"
                    onClick={handleValidateRedeemCode}
                    disabled={validatingRedeemCode || redeemCodeInput.length < 8}
                  >
                    {validatingRedeemCode ? "Checking..." : "Validate Code"}
                  </Button>

                  {/* Validation Preview Card */}
                  {redeemValidation && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 p-4 animate-in fade-in">
                      <div className="flex items-center space-x-2 text-emerald-800 dark:text-emerald-200 font-bold mb-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        <span>Valid Code</span>
                      </div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Reward: {redeemValidation.reward.title}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                        Cost: {redeemValidation.reward.costPoints} points (Member Balance:{" "}
                        {redeemValidation.memberBalance} pts)
                      </div>

                      <Button
                        variant="success"
                        size="lg"
                        className="w-full mt-4 font-bold shadow-md"
                        onClick={handleConfirmRedemption}
                        disabled={loading}
                      >
                        {loading ? "Confirming..." : "Confirm & Redeem Reward"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Tab 4: Recent Transactions Screen */}
            {activeTab === "history" && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg">Recent Terminal Activity</CardTitle>
                  <Button variant="ghost" size="sm" onClick={handleLoadHistory}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent>
                  {transactions.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-6">
                      No recent transactions recorded on this terminal.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {transactions.map((tx) => (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-sm"
                        >
                          <div>
                            <div className="font-semibold">{tx.displayName}</div>
                            <div className="text-xs text-slate-400 font-mono">
                              #{tx.memberNumber} •{" "}
                              {new Date(tx.occurredAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>
                          <div className="text-right">
                            <span
                              className={`font-black text-base ${
                                tx.pointsDelta > 0 ? "text-emerald-600" : "text-rose-600"
                              }`}
                            >
                              {tx.pointsDelta > 0 ? `+${tx.pointsDelta}` : tx.pointsDelta} pts
                            </span>
                            <div className="text-[10px] uppercase font-bold text-slate-400">
                              {tx.type}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
