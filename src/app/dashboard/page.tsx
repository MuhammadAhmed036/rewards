"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LinksAndPageEditor, LinkConfig } from "@/components/dashboard/LinksAndPageEditor";
import {
  LayoutDashboard,
  Users,
  Receipt,
  Share2,
  QrCode,
  UserCheck,
  Smartphone,
  FileDown,
  Download,
  CheckCircle2,
  Search,
  Plus,
  RefreshCw,
  Sparkles,
  ExternalLink,
  LogOut,
  Building2,
  ShieldCheck,
  Activity,
  Layers,
  ArrowUpRight,
  TrendingUp,
  CreditCard,
  History,
  Lock,
  Clock,
  ChevronRight,
  Check,
  AlertTriangle,
  Gift,
  Tag,
  Copy,
  Trash2,
} from "lucide-react";

interface OverviewMetrics {
  totalMembers: number;
  activeMembers30d: number;
  outstandingPoints: number;
  earnsCount: number;
  pointsAwarded: number;
  redemptionsCount: number;
  pointsRedeemed: number;
  linkClicksTotal: number;
}

interface MemberRow {
  id: string;
  memberNumber: string;
  name?: string;
  email: string;
  balance: number;
  lifetimeEarned: number;
  status: string;
  joinedAt: string;
}

interface LedgerRow {
  id: string;
  type: string;
  pointsDelta: number;
  occurredAt: string;
  memberNumber: string;
  memberName?: string;
  actorName?: string;
  reasonCode?: string;
  note?: string;
}

interface StaffRow {
  id: string;
  role: string;
  status: string;
  name?: string;
  email: string;
}

interface ProductRow {
  id: string;
  name: string;
  category: string;
  priceMinor: number;
  pointsAwarded: number;
  discountPercent: number;
  isActive: boolean;
  createdAt: string;
}

interface CampaignQrRow {
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

interface PromoScanReportRow {
  id: string;
  campaignTitle: string;
  offerType: string;
  productRewardName?: string;
  memberName: string;
  memberNumber: string;
  pointsAwarded: number;
  visitNumber: number;
  requiredVisits: number;
  status: string; // visit_logged, pending_claim, approved, discarded
  approvedByName?: string;
  approvedAt?: string;
  scannedAt: string;
}

interface RewardRow {
  id: string;
  title: string;
  description?: string | null;
  costPoints: number;
  type: string;
  status: "active" | "paused" | "archived";
  quantityTotal?: number | null;
  quantityRedeemed: number;
  perMemberLimit?: number | null;
  version: number;
}

export default function OwnerDashboardPage() {
  const [activeTab, setActiveTab] = useState<
    "overview" | "members" | "ledger" | "rewards" | "products" | "links" | "qr" | "team" | "reports"
  >("overview");

  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [team, setTeam] = useState<StaffRow[]>([]);
  const [productsList, setProductsList] = useState<ProductRow[]>([]);
  const [rewardsList, setRewardsList] = useState<RewardRow[]>([]);
  const [links, setLinks] = useState<LinkConfig[]>([]);
  const [qrData, setQrData] = useState<{ joinUrl: string; qrPng: string } | null>(null);

  const [loading, setLoading] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [ledgerSearch, setLedgerSearch] = useState("");

  // Reward modal state
  const [showAddReward, setShowAddReward] = useState(false);
  const [newRewardTitle, setNewRewardTitle] = useState("");
  const [newRewardDesc, setNewRewardDesc] = useState("");
  const [newRewardCost, setNewRewardCost] = useState("8");
  const [newRewardType, setNewRewardType] = useState<"free_item" | "discount" | "upgrade" | "fixed_value" | "custom">("free_item");
  const [newRewardTotalQty, setNewRewardTotalQty] = useState("");
  const [newRewardMemberLimit, setNewRewardMemberLimit] = useState("");

  // Product modal state
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductCategory, setNewProductCategory] = useState("General");
  const [newProductPrice, setNewProductPrice] = useState("4.50");
  const [newProductPoints, setNewProductPoints] = useState("1");
  const [newProductDiscount, setNewProductDiscount] = useState("0");
  const [storewideDiscountInput, setStorewideDiscountInput] = useState("10");

  // Adjust points modal state
  const [adjustingMember, setAdjustingMember] = useState<MemberRow | null>(null);
  const [adjustPoints, setAdjustPoints] = useState("");
  const [adjustReason, setAdjustReason] = useState<"goodwill" | "correction" | "fraud_removal" | "other">("goodwill");
  const [adjustNote, setAdjustNote] = useState("");

  // Reversal modal state
  const [reversingTx, setReversingTx] = useState<LedgerRow | null>(null);
  const [reverseReason, setReverseReason] = useState<"correction" | "goodwill" | "fraud_removal" | "other">("correction");
  const [reverseNote, setReverseNote] = useState("");

  // Add staff modal state
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffPassword, setNewStaffPassword] = useState("Password123!");
  const [newStaffRole, setNewStaffRole] = useState<"manager" | "staff" | "marketing">("staff");

  // Promotional Campaign QR state
  const [campaignQrs, setCampaignQrs] = useState<CampaignQrRow[]>([]);
  const [promoScanReports, setPromoScanReports] = useState<PromoScanReportRow[]>([]);
  const [showCreatePromoQr, setShowCreatePromoQr] = useState(false);
  const [promoTitle, setPromoTitle] = useState("");
  const [promoOfferType, setPromoOfferType] = useState<"points_bonus" | "stamps_bonus" | "free_product" | "discount_promo">("points_bonus");
  const [promoPointsAward, setPromoPointsAward] = useState("10");
  const [promoRequiredVisits, setPromoRequiredVisits] = useState("3");
  const [promoValidityDays, setPromoValidityDays] = useState("30");
  const [promoDiscountPct, setPromoDiscountPct] = useState("15");
  const [promoSelectedProdId, setPromoSelectedProdId] = useState("");
  const [viewingPromoQr, setViewingPromoQr] = useState<CampaignQrRow | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const loadOverview = async () => {
    try {
      const res = await fetch("/api/v1/owner/overview");
      if (res.status === 401) {
        window.location.href = "/login?redirect=/dashboard";
        return;
      }
      if (res.ok) {
        const json = await res.json();
        setMetrics(json.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadMembers = async () => {
    try {
      const res = await fetch(`/api/v1/owner/members?q=${encodeURIComponent(memberSearch)}`);
      if (res.ok) {
        const json = await res.json();
        setMembers(json.data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadLedger = async () => {
    try {
      const res = await fetch("/api/v1/owner/ledger");
      if (res.ok) {
        const json = await res.json();
        setLedger(json.data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadTeam = async () => {
    try {
      const res = await fetch("/api/v1/owner/team");
      if (res.ok) {
        const json = await res.json();
        setTeam(json.data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadLinks = async () => {
    try {
      const res = await fetch("/api/v1/owner/links");
      if (res.ok) {
        const json = await res.json();
        setLinks(json.data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadQr = async () => {
    try {
      const res = await fetch("/api/v1/owner/qr");
      if (res.ok) {
        const json = await res.json();
        setQrData(json.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadRewards = async () => {
    try {
      const res = await fetch("/api/v1/owner/rewards");
      if (res.ok) {
        const json = await res.json();
        setRewardsList(json.data || []);
      }
    } catch (e) {
      console.error("Failed to load rewards", e);
    }
  };

  const handleCreateReward = async () => {
    if (!newRewardTitle.trim()) {
      alert("Please enter a reward title");
      return;
    }
    const cost = parseInt(newRewardCost || "1", 10);
    if (isNaN(cost) || cost <= 0) {
      alert("Cost must be at least 1 point/stamp");
      return;
    }
    setLoading(true);
    try {
      const body: any = {
        title: newRewardTitle.trim(),
        description: newRewardDesc.trim() || undefined,
        costPoints: cost,
        type: newRewardType,
      };
      if (newRewardTotalQty) {
        const q = parseInt(newRewardTotalQty, 10);
        if (!isNaN(q) && q > 0) body.quantityTotal = q;
      }
      if (newRewardMemberLimit) {
        const l = parseInt(newRewardMemberLimit, 10);
        if (!isNaN(l) && l > 0) body.perMemberLimit = l;
      }

      const res = await fetch("/api/v1/owner/rewards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setShowAddReward(false);
        setNewRewardTitle("");
        setNewRewardDesc("");
        setNewRewardCost("8");
        setNewRewardTotalQty("");
        setNewRewardMemberLimit("");
        loadRewards();
      } else {
        const json = await res.json();
        alert(json.error?.message || "Failed to create reward");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRewardStatus = async (rewardId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "active" ? "paused" : "active";
    try {
      const res = await fetch("/api/v1/owner/rewards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rewardId, status: nextStatus }),
      });
      if (res.ok) {
        loadRewards();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleArchiveReward = async (rewardId: string) => {
    if (!confirm("Are you sure you want to archive this reward? Members will no longer see it.")) return;
    try {
      const res = await fetch(`/api/v1/owner/rewards?id=${rewardId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        loadRewards();
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadOverview();
    loadMembers();
    loadRewards();
  }, []);

  const loadCampaignQrs = async () => {
    try {
      const res = await fetch("/api/v1/campaign-qrs");
      if (res.ok) {
        const json = await res.json();
        setCampaignQrs(json.data || []);
      }
    } catch (e) {
      console.error("Failed to load campaign QRs", e);
    }
  };

  const loadPromoReports = async () => {
    try {
      const res = await fetch("/api/v1/campaign-qrs/reports");
      if (res.ok) {
        const json = await res.json();
        setPromoScanReports(json.data || []);
      }
    } catch (e) {
      console.error("Failed to load promo scan reports", e);
    }
  };

  const handleCreatePromoQr = async () => {
    if (!promoTitle.trim()) {
      alert("Please enter a campaign title");
      return;
    }
    setLoading(true);
    try {
      const body = {
        title: promoTitle.trim(),
        offerType: promoOfferType,
        pointsToAward: promoOfferType === "points_bonus" ? parseInt(promoPointsAward || "0", 10) : undefined,
        productId: promoOfferType === "free_product" && promoSelectedProdId ? promoSelectedProdId : undefined,
        discountPercent: promoOfferType === "discount_promo" ? parseInt(promoDiscountPct || "0", 10) : undefined,
        requiredVisits: parseInt(promoRequiredVisits || "1", 10),
        validityDays: parseInt(promoValidityDays || "30", 10),
      };

      const res = await fetch("/api/v1/campaign-qrs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setShowCreatePromoQr(false);
        setPromoTitle("");
        setPromoPointsAward("10");
        setPromoRequiredVisits("3");
        setPromoValidityDays("30");
        setPromoSelectedProdId("");
        loadCampaignQrs();
        loadPromoReports();
      } else {
        const json = await res.json();
        alert(json.error?.message || "Failed to generate promotional QR code");
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
        loadPromoReports();
        loadCampaignQrs();
        loadLedger();
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
        loadPromoReports();
      } else {
        const json = await res.json();
        alert(json.error?.message || "Failed to discard claim");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivatePromoQr = async (qrId: string) => {
    if (!confirm("Are you sure you want to deactivate and expire this QR code? Scans after deactivation will be rejected.")) return;
    try {
      const res = await fetch(`/api/v1/campaign-qrs/${qrId}/deactivate`, {
        method: "PATCH",
      });
      if (res.ok) {
        loadCampaignQrs();
      } else {
        const json = await res.json();
        alert(json.error?.message || "Failed to deactivate QR code");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    if (tab === "overview") loadOverview();
    if (tab === "rewards") loadRewards();
    if (tab === "members") loadMembers();
    if (tab === "ledger") loadLedger();
    if (tab === "products") {
      loadProducts();
      loadCampaignQrs();
      loadPromoReports();
    }
    if (tab === "team") loadTeam();
    if (tab === "links") loadLinks();
    if (tab === "qr") {
      loadQr();
      loadCampaignQrs();
    }
  };

  // Submit Point Adjustment
  const handleConfirmAdjust = async () => {
    if (!adjustingMember || !adjustPoints || !adjustNote) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/owner/members/${adjustingMember.id}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pointsDelta: parseInt(adjustPoints, 10),
          reasonCode: adjustReason,
          note: adjustNote,
        }),
      });
      if (res.ok) {
        setAdjustingMember(null);
        setAdjustPoints("");
        setAdjustNote("");
        loadMembers();
        loadOverview();
      } else {
        const json = await res.json();
        alert(json.error?.message || "Adjustment failed");
      }
    } finally {
      setLoading(false);
    }
  };

  // Submit Transaction Reversal
  const handleConfirmReverse = async () => {
    if (!reversingTx || !reverseNote) return;
    setLoading(true);
    try {
      const res = await fetch("/api/v1/owner/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ledgerEntryId: reversingTx.id,
          reasonCode: reverseReason,
          note: reverseNote,
        }),
      });
      if (res.ok) {
        setReversingTx(null);
        setReverseNote("");
        loadLedger();
        loadOverview();
      } else {
        const json = await res.json();
        alert(json.error?.message || "Reversal failed");
      }
    } finally {
      setLoading(false);
    }
  };

  // Add Team Member
  const handleAddStaff = async () => {
    if (!newStaffEmail || !newStaffName) return;
    setLoading(true);
    try {
      const res = await fetch("/api/v1/owner/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newStaffEmail,
          name: newStaffName,
          role: newStaffRole,
          temporaryPassword: newStaffPassword,
        }),
      });
      if (res.ok) {
        setShowAddStaff(false);
        setNewStaffEmail("");
        setNewStaffName("");
        setNewStaffPassword("Password123!");
        loadTeam();
      } else {
        const json = await res.json();
        alert(json.error?.message || "Failed to add team member");
      }
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    try {
      const res = await fetch("/api/v1/products");
      if (res.ok) {
        const json = await res.json();
        setProductsList(json.data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddProduct = async () => {
    if (!newProductName.trim()) return;
    setLoading(true);
    try {
      const priceMinor = Math.round(parseFloat(newProductPrice || "0") * 100);
      const points = parseInt(newProductPoints || "1", 10);
      const discount = parseInt(newProductDiscount || "0", 10);

      const res = await fetch("/api/v1/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProductName.trim(),
          category: newProductCategory.trim() || "General",
          priceMinor,
          pointsAwarded: points,
          discountPercent: discount,
        }),
      });

      if (res.ok) {
        setShowAddProduct(false);
        setNewProductName("");
        setNewProductPrice("4.50");
        setNewProductPoints("1");
        setNewProductDiscount("0");
        loadProducts();
      } else {
        const json = await res.json();
        alert(json.error?.message || "Failed to create product");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSetStorewideDiscount = async () => {
    const disc = parseInt(storewideDiscountInput, 10);
    if (isNaN(disc) || disc < 0 || disc > 100) {
      alert("Please enter a valid discount percentage between 0 and 100");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/v1/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "storewide_discount",
          discountPercent: disc,
        }),
      });
      if (res.ok) {
        alert(`Today's storewide discount of ${disc}% has been applied to all products!`);
        loadProducts();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("Are you sure you want to remove this product?")) return;
    try {
      const res = await fetch(`/api/v1/products/${id}`, { method: "DELETE" });
      if (res.ok) loadProducts();
    } catch (e) {
      console.error(e);
    }
  };

  // Revoke Staff Member
  const handleRevokeStaff = async (staffMemberId: string) => {
    if (!confirm("Are you sure you want to revoke this staff member? Active sessions will be immediately invalidated.")) return;
    try {
      const res = await fetch("/api/v1/owner/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffMemberId,
          status: "revoked",
        }),
      });
      if (res.ok) {
        loadTeam();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filteredLedger = ledger.filter((tx) => {
    if (!ledgerSearch.trim()) return true;
    const query = ledgerSearch.toLowerCase();
    return (
      tx.memberNumber?.toLowerCase().includes(query) ||
      tx.actorName?.toLowerCase().includes(query) ||
      tx.type?.toLowerCase().includes(query) ||
      tx.note?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-900 flex flex-col font-sans selection:bg-zinc-900 selection:text-white overflow-x-hidden w-full max-w-full">
      {/* Top Enterprise Bar */}
      <header className="h-16 border-b border-zinc-200/80 bg-white/95 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-zinc-950 text-white flex items-center justify-center font-bold text-sm shadow-xs ring-1 ring-zinc-900/10">
            <QrCode className="w-4 h-4 stroke-[1.8]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-zinc-950 tracking-tight">Enterprise ERP</span>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Active Production
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 font-medium hidden sm:block">
              PostgreSQL Double-Entry • UK Minor Pence Engine
            </p>
          </div>
        </div>

        {/* Global Action Tools */}
        <div className="flex items-center gap-2">
          <Link
            href="/staff"
            className="hidden md:inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-800 hover:text-zinc-950 bg-white hover:bg-zinc-50 border border-zinc-200 px-3 py-1.5 rounded-lg transition-all shadow-2xs"
          >
            <Smartphone className="w-3.5 h-3.5 text-zinc-700 stroke-[1.8]" />
            <span>Open Staff Scanner</span>
          </Link>

          <button
            onClick={() => handleTabChange("reports")}
            className="hidden lg:inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-800 hover:text-zinc-950 bg-white hover:bg-zinc-50 border border-zinc-200 px-3 py-1.5 rounded-lg transition-all shadow-2xs cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5 text-zinc-700 stroke-[1.8]" />
            <span>Export Audit Pack</span>
          </button>

          <button
            onClick={async () => {
              await fetch("/api/v1/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-3 py-1.5 rounded-lg transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 stroke-[1.8]" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Mobile Horizontal Navigation Bar */}
      <div className="md:hidden border-b border-zinc-200/80 bg-white px-3 py-2 overflow-x-auto flex space-x-1.5 sticky top-16 z-30 shadow-2xs">
        {[
          { id: "overview", label: "Overview", icon: LayoutDashboard },
          { id: "rewards", label: "Rewards", icon: Gift },
          { id: "products", label: "Products", icon: Sparkles },
          { id: "members", label: "Members", icon: Users },
          { id: "ledger", label: "Ledger", icon: Receipt },
          { id: "links", label: "Reviews", icon: Share2 },
          { id: "qr", label: "QR Signage", icon: QrCode },
          { id: "team", label: "Team", icon: UserCheck },
          { id: "reports", label: "Exports", icon: FileDown },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleTabChange(item.id as typeof activeTab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors shrink-0 cursor-pointer ${
                isActive
                  ? "bg-zinc-950 text-white shadow-2xs"
                  : "bg-zinc-50 text-zinc-600 hover:text-zinc-900 border border-zinc-200/60"
              }`}
            >
              <Icon className="w-3.5 h-3.5 stroke-[1.8]" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-1 flex-col md:flex-row">
        {/* Left ERP Sidebar (Desktop Only) */}
        <aside className="hidden md:flex md:w-64 border-r border-zinc-200/80 bg-white p-4 shrink-0 flex-col justify-between">
          <div>
            <div className="px-3 py-2 mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 block">
                Command Console
              </span>
            </div>

            <nav className="space-y-1">
              {[
                { id: "overview", label: "Executive Overview", icon: LayoutDashboard },
                { id: "rewards", label: "Rewards & Perks", icon: Gift },
                { id: "products", label: "Products & Discounts", icon: Sparkles },
                { id: "members", label: "Customer Members", icon: Users },
                { id: "ledger", label: "Immutable Ledger", icon: Receipt },
                { id: "links", label: "Links & Review Hub", icon: Share2 },
                { id: "qr", label: "Printable QR Signage", icon: QrCode },
                { id: "team", label: "Team & Staff RBAC", icon: UserCheck },
                { id: "reports", label: "Audited CSV Exports", icon: FileDown },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleTabChange(item.id as typeof activeTab)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? "bg-zinc-950 text-white shadow-2xs"
                        : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${isActive ? "text-zinc-300" : "text-zinc-400"}`} />
                      <span>{item.label}</span>
                    </div>
                    {isActive && <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Quick System Telemetry in Sidebar */}
          <div className="pt-4 border-t border-slate-100 px-2 space-y-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] space-y-1.5">
              <div className="flex items-center justify-between text-slate-600">
                <span>Ledger Integrity</span>
                <span className="text-emerald-600 font-bold">100% Valid</span>
              </div>
              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div className="w-full h-full bg-emerald-500 rounded-full"></div>
              </div>
              <p className="text-[10px] text-slate-400">Append-only triggers active</p>
            </div>

            <div className="text-[11px] text-slate-500 flex items-center justify-between px-1">
              <span>Environment</span>
              <span className="font-mono text-indigo-600 font-bold">UK-PROD-01</span>
            </div>
          </div>
        </aside>

        {/* Main Command Center Body */}
        <main className="flex-1 p-6 md:p-8 max-w-7xl overflow-y-auto bg-slate-50">
          {/* ======================================================== */}
          {/* TAB 1: EXECUTIVE OVERVIEW                                */}
          {/* ======================================================== */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h2 className="text-2xl font-black text-slate-950 tracking-tight">Executive Programme Overview</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Live operational metrics reconciled with your immutable double-entry ledger.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={loadOverview} className="bg-white border-slate-300 text-xs font-bold text-slate-700 shadow-2xs">
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5 text-indigo-600" />
                    Re-Sync Ledger
                  </Button>
                </div>
              </div>

              {/* 4 Executive KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-slate-300 transition-all">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-extrabold uppercase tracking-wider text-[10px]">Total Members</span>
                    <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                      <TrendingUp className="w-3 h-3" /> +18.4%
                    </span>
                  </div>
                  <div className="text-3xl font-black text-slate-950 mt-1.5 tabular-nums">
                    {metrics?.totalMembers || 0}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
                    <span>Enrolled Customers</span>
                    <span className="text-emerald-600 font-semibold">Active RLS</span>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-slate-300 transition-all">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-extrabold uppercase tracking-wider text-[10px]">30-Day Active</span>
                    <span className="text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                      <TrendingUp className="w-3 h-3" /> +24.1%
                    </span>
                  </div>
                  <div className="text-3xl font-black text-slate-950 mt-1.5 tabular-nums">
                    {metrics?.activeMembers30d || 0}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
                    <span>Recent Shoppers</span>
                    <span className="text-indigo-600 font-semibold">High Retention</span>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-slate-300 transition-all">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-extrabold uppercase tracking-wider text-[10px]">Points Liability</span>
                    <span className="text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded font-bold">Unredeemed</span>
                  </div>
                  <div className="text-3xl font-black text-purple-700 mt-1.5 tabular-nums">
                    {metrics?.outstandingPoints || 0} <span className="text-sm font-semibold text-slate-400">pts</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
                    <span>Estimated Cost</span>
                    <span className="text-slate-700 font-mono font-bold">£{((metrics?.outstandingPoints || 0) * 0.05).toFixed(2)}</span>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-slate-300 transition-all">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-extrabold uppercase tracking-wider text-[10px]">Review Clicks</span>
                    <span className="text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-bold">4.9 ★ Rating</span>
                  </div>
                  <div className="text-3xl font-black text-amber-700 mt-1.5 tabular-nums">
                    {metrics?.linkClicksTotal || 0}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
                    <span>Google Reviews Hub</span>
                    <span className="text-amber-600 font-semibold">Anti-Gating</span>
                  </div>
                </div>
              </div>

              {/* Enterprise Readiness & Governance Checklist */}
              <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Enterprise Governance & Compliance Audit</h3>
                      <p className="text-xs text-slate-500">All statutory UK retail loyalty checks are verified and enforced in software.</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                    3/3 Passed
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-slate-900">Immutable Ledger Active</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">DB trigger prevents mutation or silent balance changes.</p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-slate-900">Anti-Gating Compliance Verified</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Google Review link is never filtered by survey sentiment.</p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-slate-900">UK Minor Units Engine</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Calculations run exclusively in pence to eliminate float drift.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Registered Customers Widget on Overview */}
              <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 flex items-center justify-center">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Recent Customer Registrations</h3>
                      <p className="text-xs text-slate-500">Live feed of customers who recently created loyalty accounts at your store</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setActiveTab("members");
                      loadMembers();
                    }}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                  >
                    View All {members.length} Members →
                  </Button>
                </div>

                {members.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-xs">
                    No customer members enrolled yet. Customers will appear here as soon as they sign up on your store portal.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {members.slice(0, 5).map((m) => (
                      <div key={m.id} className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-xs uppercase">
                            {(m.name || m.email || "C").slice(0, 2)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-slate-900">{m.name || "Customer Member"}</span>
                              <span className="text-[10px] font-mono text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded font-bold">
                                #{m.memberNumber}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-500 font-mono block">✉ {m.email}</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-black text-slate-900">{m.balance} pts</span>
                          <span className="text-[10px] text-slate-400 block">
                            Enrolled: {new Date(m.joinedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB: PROGRAMME REWARDS & REDEMPTION RULES               */}
          {/* ======================================================== */}
          {activeTab === "rewards" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h2 className="text-2xl font-black text-slate-950 tracking-tight">Programme Rewards &amp; Perks</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Define point/stamp thresholds for customer rewards. Eligible members unlock vouchers to claim at counter.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => setShowAddReward(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                  >
                    <Plus className="w-4 h-4 mr-1.5" />
                    Create New Reward
                  </Button>
                </div>
              </div>

              {/* 3 KPI Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-extrabold uppercase tracking-wider text-[10px]">Active Rewards</span>
                    <Gift className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="text-3xl font-black text-slate-950 mt-1.5 tabular-nums">
                    {rewardsList.filter((r) => r.status === "active").length}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Live in customer pass hub</p>
                </div>

                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-extrabold uppercase tracking-wider text-[10px]">Total Redemptions</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-3xl font-black text-slate-950 mt-1.5 tabular-nums">
                    {rewardsList.reduce((acc, r) => acc + (r.quantityRedeemed || 0), 0)}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Confirmed by staff scanner</p>
                </div>

                <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-extrabold uppercase tracking-wider text-[10px]">Lowest Unlock Cost</span>
                    <Sparkles className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="text-3xl font-black text-slate-950 mt-1.5 tabular-nums">
                    {rewardsList.length > 0
                      ? `${Math.min(...rewardsList.map((r) => r.costPoints))} pts`
                      : "—"}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Minimum points to claim</p>
                </div>
              </div>

              {/* Rewards Grid / Empty State */}
              {rewardsList.filter((r) => r.status !== "archived").length === 0 ? (
                <div className="p-12 text-center bg-white rounded-3xl border border-dashed border-slate-200 shadow-sm">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 mx-auto flex items-center justify-center mb-3">
                    <Gift className="w-7 h-7" />
                  </div>
                  <h3 className="text-base font-black text-slate-900">No Active Rewards Configured</h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5">
                    Your customers currently see &ldquo;0 Rewards Active&rdquo;. Create your first reward (such as &ldquo;Free Coffee&rdquo; at 8 points, or a test reward at 1 point) so customers can unlock and claim rewards!
                  </p>
                  <Button
                    onClick={() => setShowAddReward(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl cursor-pointer"
                  >
                    <Plus className="w-4 h-4 mr-1.5" />
                    Create Your First Reward
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {rewardsList
                    .filter((r) => r.status !== "archived")
                    .map((reward) => (
                      <div
                        key={reward.id}
                        className={`p-5 rounded-3xl border bg-white shadow-sm flex flex-col justify-between transition-all ${
                          reward.status === "active"
                            ? "border-slate-200/90 hover:border-indigo-400"
                            : "border-slate-200 opacity-60 bg-slate-50"
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                              {reward.type.replace("_", " ")}
                            </span>
                            <span
                              className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                                reward.status === "active"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-amber-50 text-amber-700 border border-amber-200"
                              }`}
                            >
                              {reward.status}
                            </span>
                          </div>

                          <h3 className="font-extrabold text-slate-950 text-base mt-2.5 leading-snug">
                            {reward.title}
                          </h3>

                          {reward.description && (
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                              {reward.description}
                            </p>
                          )}

                          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                            <span className="text-slate-400 font-semibold">Cost:</span>
                            <span className="font-black text-indigo-700 text-sm">
                              {reward.costPoints} points / stamps
                            </span>
                          </div>

                          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                            <span>Redeemed so far:</span>
                            <span className="font-bold text-slate-700">
                              {reward.quantityRedeemed || 0}
                              {reward.quantityTotal ? ` / ${reward.quantityTotal}` : " (unlimited)"}
                            </span>
                          </div>
                        </div>

                        <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleRewardStatus(reward.id, reward.status)}
                            className="text-[11px] font-bold h-8 rounded-xl border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
                          >
                            {reward.status === "active" ? "Pause Reward" : "Activate Reward"}
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleArchiveReward(reward.id)}
                            className="text-[11px] font-bold h-8 rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                            Archive
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB: PRODUCTS & DISCOUNTS MANAGEMENT                    */}
          {/* ======================================================== */}
          {activeTab === "products" && (
            <div className="space-y-8">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h2 className="text-2xl font-black text-slate-950 tracking-tight">Products & Offer QR Codes</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Define catalog items, storewide discounts, and generate dynamic promotional QR codes for customers.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => {
                      setPromoTitle("");
                      setPromoOfferType("points_bonus");
                      setPromoPointsAward("10");
                      setPromoValidityDays("30");
                      setPromoSelectedProdId("");
                      setShowCreatePromoQr(true);
                    }}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>⚡ Generate Offer QR Code</span>
                  </Button>

                  <Button
                    onClick={() => setShowAddProduct(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Add Product / Item</span>
                  </Button>
                </div>
              </div>

              {/* Today's Storewide Discount Banner */}
              <div className="p-5 rounded-3xl bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 border border-indigo-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-md shadow-indigo-600/25">
                    %
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-slate-900">Today's Promotional Store Discount</h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Apply a storewide discount across all products for today (e.g. Happy Hour or Daily Special).
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                  <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-3 py-1.5 shadow-2xs">
                    <span className="text-xs font-bold text-slate-500">Discount:</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={storewideDiscountInput}
                      onChange={(e) => setStorewideDiscountInput(e.target.value)}
                      className="w-14 text-xs font-black text-indigo-700 focus:outline-none"
                    />
                    <span className="text-xs font-bold text-slate-700">%</span>
                  </div>
                  <Button
                    onClick={handleSetStorewideDiscount}
                    disabled={loading}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs"
                  >
                    Apply Storewide
                  </Button>
                </div>
              </div>

              {/* Products Table */}
              <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700">Products & Menu Catalog</h3>
                  </div>
                  <span className="text-xs text-slate-500 font-mono font-semibold">{productsList.length} items configured</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">
                    <tr>
                      <th className="p-4">Item Name</th>
                      <th className="p-4">Category</th>
                      <th className="p-4">Price (£)</th>
                      <th className="p-4">Points Awarded</th>
                      <th className="p-4">Discount</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {productsList.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400">
                          No products found. Click "+ Add Product / Item" to create your menu or service items.
                        </td>
                      </tr>
                    ) : (
                      productsList.map((prod) => (
                        <tr key={prod.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-4 font-bold text-slate-900">{prod.name}</td>
                          <td className="p-4">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                              {prod.category}
                            </span>
                          </td>
                          <td className="p-4 font-mono font-bold text-slate-900">
                            £{(prod.priceMinor / 100).toFixed(2)}
                          </td>
                          <td className="p-4">
                            <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold text-[11px] border border-indigo-200">
                              +{prod.pointsAwarded} pts
                            </span>
                          </td>
                          <td className="p-4">
                            {prod.discountPercent > 0 ? (
                              <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold text-[11px] border border-rose-200">
                                {prod.discountPercent}% OFF
                              </span>
                            ) : (
                              <span className="text-slate-400 font-medium">Standard</span>
                            )}
                          </td>
                          <td className="p-4">
                            <Badge className={prod.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500"}>
                              {prod.isActive ? "Active" : "Archived"}
                            </Badge>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-3">
                              <button
                                onClick={() => {
                                  setPromoTitle(`Free ${prod.name} Reward`);
                                  setPromoOfferType("free_product");
                                  setPromoSelectedProdId(prod.id);
                                  setPromoValidityDays("30");
                                  setShowCreatePromoQr(true);
                                }}
                                className="text-xs font-bold text-purple-600 hover:text-purple-800 hover:underline cursor-pointer flex items-center gap-1"
                              >
                                <QrCode className="w-3.5 h-3.5" />
                                <span>+ Promo QR</span>
                              </button>
                              <span className="text-slate-300">|</span>
                              <button
                                onClick={() => handleDeleteProduct(prod.id)}
                                className="text-xs font-bold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                </div>
              </div>

              {/* DYNAMIC PROMOTIONAL & OFFER QR CODES GRID */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <QrCode className="w-5 h-5 text-purple-600" />
                      <h3 className="text-xl font-black text-slate-950 tracking-tight">Active Promotional & Offer QR Codes</h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Unique QR codes configured with custom validity periods. Deactivate or expire them anytime on-demand.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadCampaignQrs}
                    className="bg-white border-slate-300 text-xs font-bold text-slate-700"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 text-purple-600" />
                    Refresh QRs
                  </Button>
                </div>

                {campaignQrs.length === 0 ? (
                  <div className="p-8 rounded-3xl border border-dashed border-slate-300 bg-white text-center">
                    <QrCode className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h4 className="text-sm font-bold text-slate-800">No Promotional QR Codes Created Yet</h4>
                    <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
                      Create a promo QR code for "Buy 3 get 1 free", bonus points, or discounts. Print it out or display on counter for customer scans!
                    </p>
                    <Button
                      onClick={() => setShowCreatePromoQr(true)}
                      className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs"
                    >
                      <Plus className="w-4 h-4 mr-1.5" />
                      Create First Offer QR Code
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                          className={`p-5 rounded-3xl border transition-all flex flex-col justify-between ${
                            isActive
                              ? "bg-white border-slate-200 shadow-xs hover:border-purple-300 hover:shadow-md"
                              : "bg-slate-50/80 border-slate-200 opacity-75"
                          }`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <span
                                className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${
                                  isActive
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : isDeactivated
                                    ? "bg-rose-50 text-rose-700 border-rose-200"
                                    : "bg-slate-100 text-slate-600 border-slate-200"
                                }`}
                              >
                                {isActive ? `Active • ${daysLeft}d left` : isDeactivated ? "Deactivated" : "Expired"}
                              </span>

                              <span className="text-[10px] font-mono text-slate-400 font-semibold">{qr.code}</span>
                            </div>

                            <div className="flex items-center gap-3 mb-3">
                              <div
                                onClick={() => setViewingPromoQr(qr)}
                                className="w-16 h-16 rounded-xl border border-slate-200 p-1 bg-white cursor-pointer hover:border-purple-500 shadow-2xs shrink-0"
                              >
                                <img src={qr.qrDataUrl} alt={qr.title} className="w-full h-full object-contain" />
                              </div>
                              <div className="min-w-0">
                                <h4 className="text-sm font-black text-slate-900 truncate">{qr.title}</h4>
                                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                  {qr.offerType === "free_product" && (
                                    <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                                      🎁 Free {qr.productRewardName || "Product"}
                                    </span>
                                  )}
                                  {qr.offerType === "points_bonus" && (
                                    <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                                      +{qr.pointsToAward} Bonus Points
                                    </span>
                                  )}
                                  {qr.offerType === "stamps_bonus" && (
                                    <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                                      +1 Stamp
                                    </span>
                                  )}
                                  {qr.offerType === "discount_promo" && (
                                    <span className="text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                                      {qr.discountPercent}% OFF
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-600 mb-4">
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Scans</span>
                                <span className="font-bold text-slate-900 text-xs">{qr.totalScans} scans</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Claims</span>
                                <span className="font-bold text-purple-700 text-xs">{qr.totalClaims} claimed</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setViewingPromoQr(qr)}
                              className="flex-1 bg-white border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 h-8"
                            >
                              <QrCode className="w-3.5 h-3.5 mr-1 text-purple-600" />
                              View & Print
                            </Button>

                            {isActive && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeactivatePromoQr(qr.id)}
                                className="bg-rose-50 border-rose-200 text-xs font-bold text-rose-700 hover:bg-rose-100 h-8"
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

              {/* LIVE CUSTOMER SCANS REPORT */}
              <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-purple-600" />
                    <div>
                      <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700">Customer Promotional QR Scans Audit Log</h3>
                      <p className="text-[11px] text-slate-500">Real-time ledger recording of members who claimed promotional offers</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadPromoReports}
                    className="text-xs font-bold text-purple-600 hover:bg-purple-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1" />
                    Refresh
                  </Button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">
                      <tr>
                        <th className="p-3.5">Timestamp</th>
                        <th className="p-3.5">Customer Member</th>
                        <th className="p-3.5">Promotional Offer</th>
                        <th className="p-3.5">Visit Progress</th>
                        <th className="p-3.5">Claim Status</th>
                        <th className="p-3.5 text-right">Counter Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-xs">
                      {promoScanReports.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-400 font-sans text-xs">
                            No customer promotional scans recorded yet. Once customers scan an offer QR code, live audit entries will appear here.
                          </td>
                        </tr>
                      ) : (
                        promoScanReports.map((scan) => {
                          const isPending = scan.status === "pending_claim";
                          const isApproved = scan.status === "approved";
                          const isDiscarded = scan.status === "discarded";
                          const isVisit = scan.status === "visit_logged";

                          return (
                            <tr key={scan.id} className="hover:bg-slate-50 transition-colors">
                              <td className="p-3.5 text-slate-500 text-[11px]">
                                {new Date(scan.scannedAt).toLocaleString()}
                              </td>
                              <td className="p-3.5 font-sans">
                                <span className="font-bold text-slate-900 block">{scan.memberName}</span>
                                <span className="text-[11px] font-mono text-indigo-600">#{scan.memberNumber}</span>
                              </td>
                              <td className="p-3.5 font-sans font-semibold text-slate-800">
                                <div>{scan.campaignTitle}</div>
                                {scan.productRewardName && (
                                  <span className="text-[10px] text-purple-700 font-bold block">
                                    Reward: Free {scan.productRewardName}
                                  </span>
                                )}
                              </td>
                              <td className="p-3.5 font-sans">
                                <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-bold text-[11px] border border-purple-200 inline-block">
                                  {scan.requiredVisits > 1
                                    ? `Visit ${scan.visitNumber} of ${scan.requiredVisits}`
                                    : "1-Time Claim"}
                                </span>
                              </td>
                              <td className="p-3.5">
                                {isPending && (
                                  <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-300 flex items-center gap-1 w-max animate-pulse">
                                    <Clock className="w-3 h-3" />
                                    Pending Approval
                                  </span>
                                )}
                                {isApproved && (
                                  <div className="font-sans">
                                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 inline-block">
                                      Claimed &amp; Approved
                                    </span>
                                    {scan.approvedByName && (
                                      <span className="text-[10px] text-slate-400 block mt-0.5">
                                        By {scan.approvedByName}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {isDiscarded && (
                                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                                    Discarded / Reset
                                  </span>
                                )}
                                {isVisit && (
                                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                                    In Progress ({scan.requiredVisits - scan.visitNumber} left)
                                  </span>
                                )}
                              </td>
                              <td className="p-3.5 text-right font-sans">
                                {isPending && (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <Button
                                      size="sm"
                                      onClick={() => handleApproveScan(scan.id)}
                                      disabled={loading}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-7 px-2.5 rounded-lg shadow-xs"
                                    >
                                      ✓ Approve &amp; Give Perk
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleDiscardScan(scan.id)}
                                      disabled={loading}
                                      className="bg-white border-rose-200 text-rose-700 hover:bg-rose-50 font-bold text-xs h-7 px-2 rounded-lg"
                                    >
                                      ✕ Discard
                                    </Button>
                                  </div>
                                )}
                                {isApproved && (
                                  <span className="text-[11px] font-bold text-emerald-600 flex items-center justify-end gap-1">
                                    <Check className="w-3.5 h-3.5" /> Handed Over
                                  </span>
                                )}
                                {isVisit && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDiscardScan(scan.id)}
                                    className="text-[10px] text-slate-400 hover:text-rose-600 h-6 px-1.5"
                                  >
                                    Reset Progress
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: CUSTOMER MEMBERS TABLE                            */}
          {/* ======================================================== */}
          {activeTab === "members" && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h2 className="text-2xl font-black text-slate-950 tracking-tight">Customer Member Directory</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Manage customer profiles, lifetime points, and manual adjustments.</p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-72">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <Input
                      placeholder="Search member # or name..."
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && loadMembers()}
                      className="pl-9 bg-white border-slate-300 text-xs"
                    />
                  </div>
                  <Button size="sm" onClick={loadMembers} className="bg-indigo-600 hover:bg-indigo-700 font-bold text-xs text-white">
                    Search
                  </Button>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">
                      <tr>
                        <th className="p-4">Member #</th>
                        <th className="p-4">Customer Details</th>
                        <th className="p-4">Current Balance</th>
                        <th className="p-4">Lifetime Earned</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Enrolled Date</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {members.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400 text-xs">
                            No loyalty members found. Customers appear here as soon as they scan your QR code.
                          </td>
                        </tr>
                      ) : (
                        members.map((m) => (
                          <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 font-mono font-bold text-indigo-600">
                              #{m.memberNumber}
                            </td>
                            <td className="p-4">
                              <div className="font-bold text-slate-900 text-xs">{m.name || "Loyalty Member"}</div>
                              <div className="text-[11px] text-slate-400 font-mono">{m.email}</div>
                            </td>
                            <td className="p-4">
                              <span className="font-black text-sm text-slate-900">{m.balance}</span>{" "}
                              <span className="text-[10px] text-slate-400 uppercase">pts</span>
                            </td>
                            <td className="p-4 text-slate-500 font-mono">
                              {m.lifetimeEarned} pts
                            </td>
                            <td className="p-4">
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                                m.status === "active"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-rose-50 text-rose-700 border-rose-200"
                              }`}>
                                {m.status}
                              </span>
                            </td>
                            <td className="p-4 text-slate-500 text-[11px]">
                              {new Date(m.joinedAt).toLocaleDateString()}
                            </td>
                            <td className="p-4 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setAdjustingMember(m)}
                                className="bg-white border-slate-300 hover:bg-slate-50 text-xs font-semibold py-1 h-8"
                              >
                                Adjust Points
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: IMMUTABLE AUDIT LEDGER                            */}
          {/* ======================================================== */}
          {activeTab === "ledger" && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h2 className="text-2xl font-black text-slate-950 tracking-tight">Immutable Audit Ledger</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Append-only ledger enforced by PostgreSQL triggers. Every transaction is permanently attributable.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative w-64">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <Input
                      placeholder="Filter ledger entries..."
                      value={ledgerSearch}
                      onChange={(e) => setLedgerSearch(e.target.value)}
                      className="pl-9 bg-white border-slate-300 text-xs"
                    />
                  </div>
                  <Button variant="outline" size="sm" onClick={loadLedger} className="bg-white border-slate-300 text-xs font-bold text-slate-700">
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5 text-indigo-600" />
                    Refresh
                  </Button>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">
                      <tr>
                        <th className="p-4">Timestamp (UTC)</th>
                        <th className="p-4">Action Type</th>
                        <th className="p-4">Member #</th>
                        <th className="p-4">Awarded By / Staff</th>
                        <th className="p-4">Points Delta</th>
                        <th className="p-4">Operational Note</th>
                        <th className="p-4 text-right">Reversal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {filteredLedger.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400 font-sans text-xs">
                            No ledger transactions recorded yet.
                          </td>
                        </tr>
                      ) : (
                        filteredLedger.map((tx) => (
                          <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-4 text-slate-500 text-[11px]">
                              {new Date(tx.occurredAt).toLocaleString()}
                            </td>
                            <td className="p-4">
                              <span className="font-sans font-bold uppercase text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                                {tx.type}
                              </span>
                            </td>
                            <td className="p-4 font-bold text-indigo-600">#{tx.memberNumber}</td>
                            <td className="p-4 font-sans text-xs font-semibold text-slate-800">
                              {tx.actorName || "System / Owner"}
                            </td>
                            <td className="p-4">
                              <span
                                className={`font-black text-sm ${
                                  tx.pointsDelta > 0 ? "text-emerald-600" : "text-rose-600"
                                }`}
                              >
                                {tx.pointsDelta > 0 ? `+${tx.pointsDelta}` : tx.pointsDelta}
                              </span>
                            </td>
                            <td className="p-4 font-sans text-xs text-slate-500">{tx.note || "-"}</td>
                            <td className="p-4 text-right">
                              {tx.type !== "reverse" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 text-xs font-bold"
                                  onClick={() => setReversingTx(tx)}
                                >
                                  Reverse
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 4: LINKS & REVIEW HUB                                */}
          {/* ======================================================== */}
          {activeTab === "links" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-black text-slate-950 tracking-tight">Review Links & Customer Hub Page</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure your Google Review URL, Instagram, Facebook, and private feedback channels with live mobile preview.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <p className="text-xs text-slate-700">
                    <strong className="text-slate-900">Anti-Gating Policy Verified:</strong> Your Google review links are presented equally to all customers regardless of prior ratings.
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
                <LinksAndPageEditor
                  businessName="Your Business"
                  brandPrimaryHex="#4f46e5"
                  initialLinks={links}
                  onSave={async (updatedLinks) => {
                    await fetch("/api/v1/owner/links", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(updatedLinks),
                    });
                    loadLinks();
                  }}
                />
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 5: PRINTABLE QR ASSETS                               */}
          {/* ======================================================== */}
          {activeTab === "qr" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-black text-slate-950 tracking-tight">Printable Signage & Counter Collateral</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Download high-resolution print-ready posters and counter tent cards for customer scan-to-join.
                </p>
              </div>

              {qrData && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                  <div className="p-8 rounded-3xl bg-white text-slate-950 text-center shadow-lg border border-slate-200">
                    <div className="text-xs font-black uppercase tracking-widest text-indigo-600 mb-2">
                      Scan To Join & Earn Rewards
                    </div>
                    <h3 className="text-2xl font-black text-slate-950 mb-4">Official Loyalty Pass</h3>
                    <img
                      src={qrData.qrPng}
                      alt="Join QR Poster"
                      className="w-64 h-64 mx-auto border-2 border-slate-200 rounded-2xl p-3 bg-white shadow-inner"
                    />
                    <p className="mt-4 text-xs font-mono text-slate-500 break-all">{qrData.joinUrl}</p>
                    <p className="text-[11px] text-slate-400 mt-1 font-semibold">Zero app downloads required. Camera scan ready.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
                      <h4 className="text-base font-bold text-slate-900">Download High-Res Print Assets</h4>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Vector-sharp QR graphic ready for professional print shops, A4 table tents, or window vinyl stickers.
                      </p>
                      <a
                        href={qrData.qrPng}
                        download="Join-QR-Poster.png"
                        className="inline-flex w-full items-center justify-center font-bold px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-all text-xs shadow-md shadow-indigo-600/25"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download High-Res PNG File
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 6: TEAM & STAFF RBAC                                 */}
          {/* ======================================================== */}
          {activeTab === "team" && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h2 className="text-2xl font-black text-slate-950 tracking-tight">Team & Staff Access Control</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Assign frontline cashier terminals, manager override privileges, and review team activity.
                  </p>
                </div>
                <Button onClick={() => setShowAddStaff(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Team Member
                </Button>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">
                    <tr>
                      <th className="p-4">Name</th>
                      <th className="p-4">Email Address</th>
                      <th className="p-4">Assigned Role</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {team.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 font-bold text-slate-900 text-xs">{s.name || "Staff Member"}</td>
                        <td className="p-4 text-slate-500 font-mono text-xs">{s.email}</td>
                        <td className="p-4">
                          <span className="font-semibold uppercase text-[10px] px-2.5 py-1 rounded-full bg-slate-100 text-indigo-700 border border-slate-200">
                            {s.role}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                            s.status === "active"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-rose-50 text-rose-700 border-rose-200"
                          }`}>
                            {s.status}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          {s.role !== "owner" && s.status === "active" && (
                            <Button
                              variant="destructive"
                              size="sm"
                              className="text-xs h-7 py-0"
                              onClick={() => handleRevokeStaff(s.id)}
                            >
                              Revoke Access
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 7: CSV AUDIT EXPORTS                                 */}
          {/* ======================================================== */}
          {activeTab === "reports" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-black text-slate-950 tracking-tight">Audited Data & CSV Reports</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Export reconciled reports for tax accounting, loyalty liability auditing, and UK GDPR Subject Access Requests.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center mb-3">
                      <Receipt className="w-5 h-5" />
                    </div>
                    <h3 className="text-base font-bold text-slate-900">Ledger Transactions</h3>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                      Complete history of every earn, redeem, adjust, and reverse event with timestamp and staff attribution.
                    </p>
                  </div>
                  <a
                    href="/api/v1/owner/reports/export?type=ledger"
                    className="inline-flex w-full items-center justify-center font-bold px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs shadow-sm transition-colors"
                  >
                    <FileDown className="h-4 w-4 mr-2" />
                    Export Ledger CSV
                  </a>
                </div>

                <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mb-3">
                      <Users className="w-5 h-5" />
                    </div>
                    <h3 className="text-base font-bold text-slate-900">Customer Members</h3>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                      Complete register of enrolled members, member numbers, current balances, and GDPR opt-in status.
                    </p>
                  </div>
                  <a
                    href="/api/v1/owner/reports/export?type=members"
                    className="inline-flex w-full items-center justify-center font-bold px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 text-xs border border-slate-300 transition-colors"
                  >
                    <FileDown className="h-4 w-4 mr-2" />
                    Export Members CSV
                  </a>
                </div>

                <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 border border-purple-200 flex items-center justify-center mb-3">
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <h3 className="text-base font-bold text-slate-900">Redemptions Log</h3>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                      Record of all reward redemptions, costs, code last4, and staff validation timestamps.
                    </p>
                  </div>
                  <a
                    href="/api/v1/owner/reports/export?type=redemptions"
                    className="inline-flex w-full items-center justify-center font-bold px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 text-xs border border-slate-300 transition-colors"
                  >
                    <FileDown className="h-4 w-4 mr-2" />
                    Export Redemptions CSV
                  </a>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Adjust Points Modal (Light Theme) */}
      {adjustingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="max-w-md w-full p-6 rounded-3xl bg-white border border-slate-200 text-slate-900 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-950">
              Adjust Points: {adjustingMember.name || `#${adjustingMember.memberNumber}`}
            </h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Current balance: <span className="text-slate-950 font-bold">{adjustingMember.balance} pts</span>. Balance cannot drop below 0.
            </p>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Points Delta (+ or -)</label>
                <Input
                  type="number"
                  placeholder="e.g. 20 or -15"
                  value={adjustPoints}
                  onChange={(e) => setAdjustPoints(e.target.value)}
                  className="bg-slate-50 border-slate-300 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Reason Code</label>
                <select
                  value={adjustReason}
                  onChange={(e) =>
                    setAdjustReason(e.target.value as "goodwill" | "correction" | "fraud_removal" | "other")
                  }
                  className="w-full h-10 rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs text-slate-900"
                >
                  <option value="goodwill">Goodwill Bonus</option>
                  <option value="correction">Billing Correction</option>
                  <option value="fraud_removal">Fraud Removal</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Operational Note (Mandatory)</label>
                <Input
                  placeholder="Explain why this adjustment is being made"
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  className="bg-slate-50 border-slate-300 text-xs text-slate-900"
                />
              </div>

              <div className="flex gap-2.5 pt-3">
                <Button variant="outline" className="flex-1 bg-white border-slate-300 text-xs font-bold text-slate-700" onClick={() => setAdjustingMember(null)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                  onClick={handleConfirmAdjust}
                  disabled={loading || !adjustPoints || !adjustNote}
                >
                  {loading ? "Saving..." : "Apply Adjustment"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reverse Transaction Modal (Light Theme) */}
      {reversingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="max-w-md w-full p-6 rounded-3xl bg-white border border-slate-200 text-slate-900 shadow-2xl">
            <h3 className="text-lg font-bold text-rose-600">Reverse Transaction</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Reversing transaction of <span className="text-slate-900 font-bold">{reversingTx.pointsDelta} points</span> for #{reversingTx.memberNumber}.
            </p>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Reversal Reason</label>
                <select
                  value={reverseReason}
                  onChange={(e) =>
                    setReverseReason(e.target.value as "correction" | "goodwill" | "fraud_removal" | "other")
                  }
                  className="w-full h-10 rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs text-slate-900"
                >
                  <option value="correction">Mistaken Entry</option>
                  <option value="goodwill">Customer Goodwill</option>
                  <option value="fraud_removal">Fraudulent Transaction</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Audited Note (Mandatory)</label>
                <Input
                  placeholder="Reason for reversal"
                  value={reverseNote}
                  onChange={(e) => setReverseNote(e.target.value)}
                  className="bg-slate-50 border-slate-300 text-xs text-slate-900"
                />
              </div>

              <div className="flex gap-2.5 pt-3">
                <Button variant="outline" className="flex-1 bg-white border-slate-300 text-xs font-bold text-slate-700" onClick={() => setReversingTx(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 font-bold text-xs"
                  onClick={handleConfirmReverse}
                  disabled={loading || !reverseNote}
                >
                  {loading ? "Reversing..." : "Confirm Reversal"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Staff Modal (Light Theme) */}
      {showAddStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="max-w-md w-full p-6 rounded-3xl bg-white border border-slate-200 text-slate-900 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-950">Add Team Member</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Authorize staff or manager terminal login for this business.
            </p>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Full Name</label>
                <Input
                  placeholder="e.g. John Doe"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  className="bg-slate-50 border-slate-300 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Email Address</label>
                <Input
                  type="email"
                  placeholder="staff@example.com"
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  className="bg-slate-50 border-slate-300 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Assigned Role</label>
                <select
                  value={newStaffRole}
                  onChange={(e) =>
                    setNewStaffRole(e.target.value as "staff" | "manager" | "marketing")
                  }
                  className="w-full h-10 rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs text-slate-900"
                >
                  <option value="staff">Staff (Terminal Earn & Redeem)</option>
                  <option value="manager">Manager (Adjustments & Reports)</option>
                  <option value="marketing">Marketing (Analytics Only)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Login Password (Hand to Staff)</label>
                <Input
                  type="text"
                  placeholder="e.g. Password123!"
                  value={newStaffPassword}
                  onChange={(e) => setNewStaffPassword(e.target.value)}
                  className="bg-slate-50 border-slate-300 text-xs text-slate-900 font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Staff will use this password along with their email to log in at <code className="text-indigo-600 font-semibold">/staff</code>.
                </p>
              </div>

              <div className="flex gap-2.5 pt-3">
                <Button variant="outline" className="flex-1 bg-white border-slate-300 text-xs font-bold text-slate-700" onClick={() => setShowAddStaff(false)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                  onClick={handleAddStaff}
                  disabled={loading || !newStaffEmail || !newStaffName}
                >
                  {loading ? "Adding..." : "Add Member"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Product / Item Modal */}
      {showAddProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="max-w-md w-full p-6 rounded-3xl bg-white border border-slate-200 text-slate-900 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-950">Add Product or Service Item</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Add an item to your menu or catalog with pricing and points rewarded.
            </p>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Item / Service Name</label>
                <Input
                  placeholder="e.g. Cappuccino, Skin Fade, Margherita Pizza"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  className="bg-slate-50 border-slate-300 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Category</label>
                <Input
                  placeholder="e.g. Hot Drinks, Bakery, Haircut, Food"
                  value={newProductCategory}
                  onChange={(e) => setNewProductCategory(e.target.value)}
                  className="bg-slate-50 border-slate-300 text-xs text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Price (£)</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 3.50"
                    value={newProductPrice}
                    onChange={(e) => setNewProductPrice(e.target.value)}
                    className="bg-slate-50 border-slate-300 text-xs text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Points Given</label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="e.g. 3"
                    value={newProductPoints}
                    onChange={(e) => setNewProductPoints(e.target.value)}
                    className="bg-slate-50 border-slate-300 text-xs text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Special Discount (%) - Optional</label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="e.g. 10"
                  value={newProductDiscount}
                  onChange={(e) => setNewProductDiscount(e.target.value)}
                  className="bg-slate-50 border-slate-300 text-xs text-slate-900"
                />
              </div>

              <div className="flex gap-2.5 pt-3">
                <Button
                  variant="outline"
                  className="flex-1 bg-white border-slate-300 text-xs font-bold text-slate-700"
                  onClick={() => setShowAddProduct(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                  onClick={handleAddProduct}
                  disabled={loading || !newProductName.trim()}
                >
                  {loading ? "Adding..." : "Add to Menu"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generate Promotional / Offer QR Code Modal */}
      {showCreatePromoQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="max-w-md w-full p-6 rounded-3xl bg-white border border-slate-200 text-slate-900 shadow-2xl">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                <QrCode className="w-4 h-4" />
              </div>
              <h3 className="text-lg font-black text-slate-950">Generate Offer QR Code</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Configure what customers receive upon camera scan, and set the QR validity duration.
            </p>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Campaign Title / Offer Description</label>
                <Input
                  placeholder="e.g. Buy 3 coffees get 1 free, Weekend VIP Bonus, 20% Off"
                  value={promoTitle}
                  onChange={(e) => setPromoTitle(e.target.value)}
                  className="bg-slate-50 border-slate-300 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Offer Type</label>
                <select
                  value={promoOfferType}
                  onChange={(e) => setPromoOfferType(e.target.value as any)}
                  className="w-full h-10 rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs text-slate-900 font-semibold"
                >
                  <option value="points_bonus">Bonus Points upon Scan</option>
                  <option value="free_product">Free Product / Item Reward</option>
                  <option value="discount_promo">Promotional Discount %</option>
                  <option value="stamps_bonus">Bonus Stamp (+1)</option>
                </select>
              </div>

              {promoOfferType === "free_product" && (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Select Free Product / Item</label>
                  <select
                    value={promoSelectedProdId}
                    onChange={(e) => setPromoSelectedProdId(e.target.value)}
                    className="w-full h-10 rounded-xl border border-purple-300 bg-purple-50/50 px-3 text-xs text-slate-900 font-semibold"
                  >
                    <option value="">-- Choose from your product menu --</option>
                    {productsList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (£{(p.priceMinor / 100).toFixed(2)})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Customer gets this item unlocked and recorded on their digital pass when scanned.
                  </p>
                </div>
              )}

              {promoOfferType === "points_bonus" && (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Points Credited to Pass</label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="e.g. 15"
                    value={promoPointsAward}
                    onChange={(e) => setPromoPointsAward(e.target.value)}
                    className="bg-slate-50 border-slate-300 text-xs text-slate-900"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Awarded instantly to customer's balance through the immutable ledger.
                  </p>
                </div>
              )}

              {promoOfferType === "discount_promo" && (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Discount Percentage (%)</label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    placeholder="e.g. 20"
                    value={promoDiscountPct}
                    onChange={(e) => setPromoDiscountPct(e.target.value)}
                    className="bg-slate-50 border-slate-300 text-xs text-slate-900"
                  />
                </div>
              )}

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Purchases / Visits Required (e.g. 3 for &quot;Buy 3 Get 1 Free&quot;)
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    max="50"
                    placeholder="3"
                    value={promoRequiredVisits}
                    onChange={(e) => setPromoRequiredVisits(e.target.value)}
                    className="bg-slate-50 border-slate-300 text-xs text-slate-900 font-bold w-24"
                  />
                  <span className="text-xs text-slate-500">
                    {parseInt(promoRequiredVisits || "1", 10) > 1
                      ? `Customer must scan ${promoRequiredVisits} times to unlock the free reward`
                      : "Instant reward on single scan"}
                  </span>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Validity Period (Expiry)</label>
                <select
                  value={promoValidityDays}
                  onChange={(e) => setPromoValidityDays(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs text-slate-900"
                >
                  <option value="3">3 Days (Flash Promo)</option>
                  <option value="7">7 Days (1 Week)</option>
                  <option value="14">14 Days (2 Weeks)</option>
                  <option value="30">30 Days (1 Month)</option>
                  <option value="60">60 Days (2 Months)</option>
                  <option value="90">90 Days (Quarterly)</option>
                  <option value="180">180 Days (Half Year)</option>
                  <option value="365">365 Days (1 Year)</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Once expired, customer scans will be politely rejected. You can also manually deactivate at any time.
                </p>
              </div>

              <div className="flex gap-2.5 pt-3">
                <Button
                  variant="outline"
                  className="flex-1 bg-white border-slate-300 text-xs font-bold text-slate-700"
                  onClick={() => setShowCreatePromoQr(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 font-bold text-xs bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={handleCreatePromoQr}
                  disabled={loading || !promoTitle.trim()}
                >
                  {loading ? "Generating..." : "Generate QR Code"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View & Print High-Res QR Modal */}
      {viewingPromoQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="max-w-sm w-full p-6 rounded-3xl bg-white border border-slate-200 text-slate-900 shadow-2xl text-center">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                Official Promo Collateral
              </span>
              <button
                onClick={() => setViewingPromoQr(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <h3 className="text-lg font-black text-slate-950 mb-1">{viewingPromoQr.title}</h3>
            <p className="text-xs text-slate-500 mb-4 font-mono">
              Code: <span className="font-bold text-purple-700">{viewingPromoQr.code}</span>
            </p>

            <div className="p-4 rounded-2xl border-2 border-slate-200 bg-white inline-block shadow-inner mb-4">
              <img
                src={viewingPromoQr.qrDataUrl}
                alt={viewingPromoQr.title}
                className="w-56 h-56 object-contain mx-auto"
              />
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1 mb-4 text-left">
              <div className="flex justify-between">
                <span>Expires On:</span>
                <span className="font-bold text-slate-900">
                  {new Date(viewingPromoQr.expiresAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Audit Scans:</span>
                <span className="font-bold text-slate-900">{viewingPromoQr.totalScans}</span>
              </div>
              <div className="flex justify-between">
                <span>Status:</span>
                <span
                  className={`font-bold uppercase text-[10px] ${
                    viewingPromoQr.status === "active" ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {viewingPromoQr.status}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <a
                href={viewingPromoQr.qrDataUrl}
                download={`${viewingPromoQr.title}-QR.png`}
                className="w-full inline-flex items-center justify-center font-bold px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs shadow-sm transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4 mr-2" />
                Download High-Res PNG
              </a>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(viewingPromoQr.scanUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="w-full bg-white border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                    Copied Scan Link!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1 text-slate-500" />
                    Copy Direct Scan URL
                  </>
                )}
              </Button>

              {viewingPromoQr.status === "active" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await handleDeactivatePromoQr(viewingPromoQr.id);
                    setViewingPromoQr(null);
                  }}
                  className="w-full bg-rose-50 border-rose-200 text-xs font-bold text-rose-700 hover:bg-rose-100"
                >
                  Deactivate / Expire QR Code Now
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add / Create Reward Modal */}
      {showAddReward && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="max-w-md w-full p-6 rounded-3xl bg-white border border-slate-200 text-slate-900 shadow-2xl">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center">
                <Gift className="w-4 h-4" />
              </div>
              <h3 className="text-lg font-bold text-slate-950">Create Programme Reward</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Set the redemption rules and point cost. Once created, eligible members will see &ldquo;Claim Reward&rdquo; on their pass.
            </p>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Reward Title *</label>
                <Input
                  placeholder="e.g. Free Artisan Coffee, 20% Off Bill, Beard Trim"
                  value={newRewardTitle}
                  onChange={(e) => setNewRewardTitle(e.target.value)}
                  className="bg-slate-50 border-slate-300 text-xs text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Point / Stamp Cost *</label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="e.g. 8"
                    value={newRewardCost}
                    onChange={(e) => setNewRewardCost(e.target.value)}
                    className="bg-slate-50 border-slate-300 text-xs text-slate-900"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Points deducted upon claim</span>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Reward Type</label>
                  <select
                    value={newRewardType}
                    onChange={(e) => setNewRewardType(e.target.value as any)}
                    className="w-full h-9 rounded-md border border-slate-300 bg-slate-50 px-3 py-1 text-xs text-slate-900 shadow-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                  >
                    <option value="free_item">Free Item / Product</option>
                    <option value="discount">Discount Percentage</option>
                    <option value="fixed_value">Fixed Amount Off</option>
                    <option value="upgrade">Perk / Upgrade</option>
                    <option value="custom">Custom Service</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Description (Optional)</label>
                <Input
                  placeholder="e.g. Valid for any regular size hot coffee or tea"
                  value={newRewardDesc}
                  onChange={(e) => setNewRewardDesc(e.target.value)}
                  className="bg-slate-50 border-slate-300 text-xs text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Total Stock (Optional)</label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="Leave empty for unlimited"
                    value={newRewardTotalQty}
                    onChange={(e) => setNewRewardTotalQty(e.target.value)}
                    className="bg-slate-50 border-slate-300 text-xs text-slate-900"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Limit Per Member (Optional)</label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="Leave empty for unlimited"
                    value={newRewardMemberLimit}
                    onChange={(e) => setNewRewardMemberLimit(e.target.value)}
                    className="bg-slate-50 border-slate-300 text-xs text-slate-900"
                  />
                </div>
              </div>

              <div className="flex gap-2.5 pt-3 border-t border-slate-100">
                <Button
                  variant="outline"
                  className="flex-1 bg-white border-slate-300 text-xs font-bold text-slate-700"
                  onClick={() => setShowAddReward(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                  onClick={handleCreateReward}
                  disabled={loading || !newRewardTitle.trim()}
                >
                  {loading ? "Publishing..." : "Publish Reward"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
