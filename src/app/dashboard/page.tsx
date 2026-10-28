"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LinksAndPageEditor, LinkConfig } from "@/components/dashboard/LinksAndPageEditor";
import { BusinessLogo } from "@/components/brand/BusinessLogo";
import { LogoUploader } from "@/components/brand/LogoUploader";
import { BusinessInbox } from "@/components/chat/BusinessInbox";
import { RewardsManager } from "@/components/rewards/RewardsManager";
import { SpendPointsPanel } from "@/components/rewards/SpendPointsPanel";
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
  LogOut,
  CreditCard,
  History,
  Clock,
  Check,
  Gift,
  Tag,
  Copy,
  MessageSquare,
  X,
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

interface BusinessInfo {
  id: string;
  slug: string;
  name: string;
  brandPrimaryHex: string | null;
  logoUrl: string | null;
  programmeType?: "points" | "stamps";
}

export default function OwnerDashboardPage() {
  const [activeTab, setActiveTab] = useState<
    "overview" | "members" | "ledger" | "rewards" | "products" | "links" | "qr" | "team" | "reports" | "messages"
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
  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [savingLogo, setSavingLogo] = useState(false);
  const [logoMessage, setLogoMessage] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [ledgerSearch, setLedgerSearch] = useState("");

  // Points menu: products table can open the reward form with an item already chosen
  const [rewardStartProductId, setRewardStartProductId] = useState<string | null>(null);
  // Member whose points are being used at the counter
  const [spendingMember, setSpendingMember] = useState<MemberRow | null>(null);
  const clearRewardStart = useCallback(() => setRewardStartProductId(null), []);

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
  const [adjustDirection, setAdjustDirection] = useState<"add" | "remove">("add");
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [memberNotice, setMemberNotice] = useState<string | null>(null);

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

  const loadUnreadMessages = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/business/conversations/unread", { cache: "no-store" });
      if (res.ok) setUnreadMessages((await res.json()).data.unread);
    } catch {
      // Badge only; try again on the next tick.
    }
  }, []);

  // Keep the Messages badge current while the dashboard is open
  useEffect(() => {
    loadUnreadMessages();
    const id = setInterval(() => document.visibilityState === "visible" && loadUnreadMessages(), 20000);
    return () => clearInterval(id);
  }, [loadUnreadMessages]);

  const loadBusiness = async () => {
    try {
      const res = await fetch("/api/v1/business");
      if (res.ok) {
        const json = await res.json();
        setBusiness(json.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveLogo = async (logoDataUrl: string | null) => {
    setSavingLogo(true);
    setLogoMessage(null);
    try {
      const res = await fetch("/api/v1/business", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoDataUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message?.replace(/^LOGO_\w+: /, "") || "Couldn't save the logo");
      setBusiness(json.data);
      setLogoMessage(logoDataUrl ? "Logo saved. It now shows for your staff and customers." : "Logo removed.");
    } catch (err) {
      setLogoMessage(err instanceof Error ? err.message : "Couldn't save the logo");
    } finally {
      setSavingLogo(false);
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

  useEffect(() => {
    loadOverview();
    loadMembers();
    loadRewards();
    loadTeam();
    loadLinks();
    loadBusiness();
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

  const openAdjust = (member: MemberRow) => {
    setAdjustingMember(member);
    setAdjustDirection("add");
    setAdjustPoints("");
    setAdjustReason("goodwill");
    setAdjustNote("");
    setAdjustError(null);
  };

  // Submit Point Adjustment
  const handleConfirmAdjust = async () => {
    if (!adjustingMember) return;
    const amount = parseInt(adjustPoints, 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      setAdjustError("Enter how many points, as a whole number above 0.");
      return;
    }
    if (!adjustNote.trim()) {
      setAdjustError("Add a short note so you remember why later.");
      return;
    }
    const pointsDelta = adjustDirection === "add" ? amount : -amount;
    setLoading(true);
    setAdjustError(null);
    try {
      const res = await fetch(`/api/v1/owner/members/${adjustingMember.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ pointsDelta, reasonCode: adjustReason, note: adjustNote.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setAdjustError(json?.error?.message || "The points couldn't be changed. Try again.");
        return;
      }
      const who = adjustingMember.name || `#${adjustingMember.memberNumber}`;
      setMemberNotice(
        `${pointsDelta > 0 ? "Added" : "Removed"} ${Math.abs(pointsDelta)} points ${pointsDelta > 0 ? "to" : "from"} ${who}. New balance: ${json.data.newBalance} points.`
      );
      setAdjustingMember(null);
      setAdjustPoints("");
      setAdjustNote("");
      loadMembers();
      loadOverview();
    } catch {
      setAdjustError("Couldn't reach the server. Check your connection and try again.");
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

  const navGroups: Array<{
    title?: string;
    items: Array<{ id: typeof activeTab; label: string; icon: typeof LayoutDashboard }>;
  }> = [
    { items: [{ id: "overview", label: "Home", icon: LayoutDashboard }] },
    {
      title: "Your loyalty card",
      items: [
        { id: "rewards", label: "Rewards", icon: Gift },
        { id: "products", label: "Products & offers", icon: Tag },
        { id: "qr", label: "QR posters", icon: QrCode },
        { id: "links", label: "Reviews & links", icon: Share2 },
      ],
    },
    {
      title: "People",
      items: [
        { id: "messages", label: "Messages", icon: MessageSquare },
        { id: "members", label: "Customers", icon: Users },
        { id: "team", label: "Staff", icon: UserCheck },
      ],
    },
    {
      title: "Records",
      items: [
        { id: "ledger", label: "Points history", icon: History },
        { id: "reports", label: "Downloads", icon: FileDown },
      ],
    },
  ];
  const allNavItems = navGroups.flatMap((g) => g.items);

  const activeRewards = rewardsList.filter((r) => r.status === "active").length;
  const setupSteps: Array<{ done: boolean; title: string; detail: string; action: string; tab: typeof activeTab }> = [
    {
      done: Boolean(business?.logoUrl),
      title: "Add your logo",
      detail: "It appears on your customers' cards and the staff scanner.",
      action: "Add logo",
      tab: "overview",
    },
    {
      done: activeRewards > 0,
      title: "Add your first reward",
      detail: "Something customers work towards, like a free coffee at 8 stamps.",
      action: "Add a reward",
      tab: "rewards",
    },
    {
      done: links.length > 0,
      title: "Add your Google review link",
      detail: "Customers see it on their card after each visit.",
      action: "Add links",
      tab: "links",
    },
    {
      done: team.some((t) => t.role !== "owner" && t.status !== "revoked"),
      title: "Give your staff a login",
      detail: "So they can scan cards and add points at the till.",
      action: "Add staff",
      tab: "team",
    },
    {
      done: (metrics?.totalMembers || 0) > 0,
      title: "Print your QR poster",
      detail: "Put it by the till. Customers scan it to get their card.",
      action: "Get poster",
      tab: "qr",
    },
  ];
  const stepsDone = setupSteps.filter((s) => s.done).length;

  return (
    <div className="min-h-screen bg-paper text-zinc-900 flex flex-col overflow-x-hidden w-full max-w-full">
      {/* Top bar */}
      <header className="h-16 border-b border-zinc-200 bg-white px-4 sm:px-6 flex items-center justify-between gap-3 sticky top-0 z-40">
        <div className="flex items-center gap-3 min-w-0">
          <BusinessLogo
            name={business?.name || "Your business"}
            logoUrl={business?.logoUrl}
            brandColor={business?.brandPrimaryHex}
            size="md"
          />
          <div className="min-w-0">
            <p className="font-display font-bold text-evergreen-deep leading-tight truncate">
              {business?.name || "Your business"}
            </p>
            <p className="text-xs text-zinc-500">Owner dashboard</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/staff"
            className="inline-flex items-center gap-2 text-sm font-semibold bg-evergreen text-white hover:bg-evergreen-deep px-4 py-2 rounded-full transition-colors"
          >
            <Smartphone className="w-4 h-4" />
            <span className="hidden sm:inline">Open scanner</span>
            <span className="sm:hidden">Scan</span>
          </Link>
          <button
            onClick={async () => {
              await fetch("/api/v1/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
            className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 px-3 py-2 rounded-full transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* Mobile navigation */}
      <nav className="md:hidden border-b border-zinc-200 bg-white px-3 py-2 overflow-x-auto flex gap-1.5 sticky top-16 z-30">
        {allNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleTabChange(item.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                isActive ? "bg-evergreen text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
              {item.id === "messages" && unreadMessages > 0 && (
                <span className="min-w-5 h-5 px-1.5 rounded-full bg-marigold text-evergreen-deep text-xs font-bold flex items-center justify-center">
                  {unreadMessages}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex flex-1 flex-col md:flex-row">
        {/* Sidebar */}
        <aside className="hidden md:flex md:w-60 border-r border-zinc-200 bg-white px-3 py-5 shrink-0 flex-col gap-6">
          {navGroups.map((group, gi) => (
            <div key={gi}>
              {group.title && <p className="px-3 mb-1.5 text-xs font-semibold text-zinc-400">{group.title}</p>}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabChange(item.id)}
                      aria-current={isActive ? "page" : undefined}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                        isActive ? "bg-mist text-evergreen-deep font-semibold" : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
                      }`}
                    >
                      <Icon className={`w-[18px] h-[18px] ${isActive ? "text-evergreen" : "text-zinc-400"}`} />
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.id === "messages" && unreadMessages > 0 && (
                        <span
                          className="min-w-5 h-5 px-1.5 rounded-full bg-marigold text-evergreen-deep text-xs font-bold flex items-center justify-center"
                          aria-label={`${unreadMessages} unread`}
                        >
                          {unreadMessages}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 px-4 py-6 sm:px-8 sm:py-8 max-w-6xl">
          {/* ======================================================== */}
          {/* HOME                                                     */}
          {/* ======================================================== */}
          {activeTab === "overview" && (
            <div className="space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                  <h2 className="font-display text-3xl font-bold text-evergreen-deep">Welcome back</h2>
                  <p className="text-zinc-600 mt-1">Here&rsquo;s how your loyalty card is doing.</p>
                </div>
                <button
                  onClick={() => {
                    loadOverview();
                    loadMembers();
                  }}
                  className="self-start sm:self-auto inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-evergreen-deep px-3 py-2 rounded-full hover:bg-white border border-transparent hover:border-zinc-200 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              </div>

              {/* Numbers */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {[
                  { label: "Customers", value: metrics?.totalMembers ?? 0, note: "signed up to your card" },
                  { label: "Came back", value: metrics?.activeMembers30d ?? 0, note: "visited in the last 30 days" },
                  { label: "Rewards claimed", value: metrics?.redemptionsCount ?? 0, note: "handed out so far" },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-2xl bg-white border border-zinc-200 p-4 sm:p-5">
                    <p className="text-sm text-zinc-600">{stat.label}</p>
                    <p className="font-display text-3xl sm:text-4xl font-bold text-evergreen-deep mt-1 tabular-nums">
                      {stat.value.toLocaleString("en-GB")}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">{stat.note}</p>
                  </div>
                ))}
                <div className="rounded-2xl bg-marigold p-4 sm:p-5 text-evergreen-deep">
                  <p className="text-sm font-medium">Points waiting to be spent</p>
                  <p className="font-display text-3xl sm:text-4xl font-bold mt-1 tabular-nums">
                    {(metrics?.outstandingPoints ?? 0).toLocaleString("en-GB")}
                  </p>
                  <p className="text-xs mt-1 opacity-80">held by your customers</p>
                </div>
              </div>

              {/* Setup checklist */}
              {stepsDone < setupSteps.length && (
                <section className="rounded-3xl bg-white border border-zinc-200 p-5 sm:p-7">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-display text-xl font-bold text-evergreen-deep">Get your card ready</h3>
                      <p className="text-sm text-zinc-600 mt-0.5">
                        {stepsDone} of {setupSteps.length} done. Finish these and you&rsquo;re ready for customers.
                      </p>
                    </div>
                    <div className="w-full sm:w-48 h-2 rounded-full bg-zinc-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-evergreen transition-all"
                        style={{ width: `${(stepsDone / setupSteps.length) * 100}%` }}
                      />
                    </div>
                  </div>
                  <ol className="mt-6 divide-y divide-zinc-100">
                    {setupSteps.map((step, i) => (
                      <li key={step.title} className="py-4 flex items-center gap-4">
                        <span
                          className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-display font-bold ${
                            step.done ? "bg-evergreen text-white" : "border-2 border-zinc-200 text-zinc-500"
                          }`}
                        >
                          {step.done ? <Check className="w-4 h-4" strokeWidth={3} /> : i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold ${step.done ? "text-zinc-400 line-through" : "text-zinc-900"}`}>
                            {step.title}
                          </p>
                          {!step.done && <p className="text-sm text-zinc-600">{step.detail}</p>}
                        </div>
                        {!step.done && (
                          <button
                            onClick={() =>
                              step.tab === "overview"
                                ? document.getElementById("business-logo")?.scrollIntoView({ behavior: "smooth", block: "center" })
                                : handleTabChange(step.tab)
                            }
                            className="shrink-0 text-sm font-semibold text-evergreen hover:text-evergreen-deep border border-zinc-200 hover:border-evergreen rounded-full px-4 py-2 transition-colors cursor-pointer"
                          >
                            {step.action}
                          </button>
                        )}
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {/* Common jobs */}
              <section>
                <h3 className="font-display text-xl font-bold text-evergreen-deep">Things you can do</h3>
                <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: "Add points for a customer", hint: "Opens the scanner", icon: Smartphone, href: "/staff" },
                    { label: "Create a reward", hint: `${activeRewards} live now`, icon: Gift, tab: "rewards" as const },
                    { label: "Print your QR poster", hint: "For the till or window", icon: QrCode, tab: "qr" as const },
                    { label: "Download your data", hint: "Spreadsheets for your records", icon: Download, tab: "reports" as const },
                  ].map((job) => {
                    const Icon = job.icon;
                    const inner = (
                      <>
                        <span className="w-10 h-10 rounded-xl bg-mist text-evergreen flex items-center justify-center">
                          <Icon className="w-5 h-5" />
                        </span>
                        <span className="mt-4 block font-semibold text-zinc-900">{job.label}</span>
                        <span className="block text-sm text-zinc-500">{job.hint}</span>
                      </>
                    );
                    const cls =
                      "text-left rounded-2xl bg-white border border-zinc-200 p-4 sm:p-5 hover:border-evergreen transition-colors cursor-pointer";
                    return job.href ? (
                      <Link key={job.label} href={job.href} className={cls}>
                        {inner}
                      </Link>
                    ) : (
                      <button key={job.label} onClick={() => handleTabChange(job.tab!)} className={cls}>
                        {inner}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Business logo */}
              <section id="business-logo" className="rounded-3xl bg-white border border-zinc-200 p-5 sm:p-7 scroll-mt-24">
                <h3 className="font-display text-xl font-bold text-evergreen-deep">Your logo</h3>
                <p className="text-sm text-zinc-600 mt-0.5 mb-5">
                  Shown on your customers&rsquo; loyalty cards, on the staff scanner and here.
                </p>
                <LogoUploader
                  businessName={business?.name || "Your business"}
                  value={business?.logoUrl || null}
                  brandColor={business?.brandPrimaryHex}
                  onChange={handleSaveLogo}
                  busy={savingLogo}
                />
                {logoMessage && <p className="mt-3 text-sm text-zinc-700">{logoMessage}</p>}
              </section>

              {/* Newest customers */}
              <section className="rounded-3xl bg-white border border-zinc-200 p-5 sm:p-7">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-display text-xl font-bold text-evergreen-deep">Newest customers</h3>
                  {members.length > 0 && (
                    <button
                      onClick={() => handleTabChange("members")}
                      className="text-sm font-semibold text-evergreen hover:text-evergreen-deep cursor-pointer"
                    >
                      See all {members.length}
                    </button>
                  )}
                </div>

                {members.length === 0 ? (
                  <div className="mt-6 rounded-2xl bg-paper p-6 text-center">
                    <p className="font-semibold text-zinc-900">No customers yet</p>
                    <p className="text-sm text-zinc-600 mt-1">
                      Put your QR poster by the till. Customers appear here as soon as they scan it.
                    </p>
                    <button
                      onClick={() => handleTabChange("qr")}
                      className="mt-4 text-sm font-semibold bg-evergreen text-white rounded-full px-4 py-2 hover:bg-evergreen-deep cursor-pointer"
                    >
                      Get my QR poster
                    </button>
                  </div>
                ) : (
                  <ul className="mt-4 divide-y divide-zinc-100">
                    {members.slice(0, 5).map((m) => (
                      <li key={m.id} className="py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-mist text-evergreen-deep flex items-center justify-center font-bold text-sm uppercase shrink-0">
                            {(m.name || m.email || "C").slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-zinc-900 truncate">{m.name || "Customer"}</p>
                            <p className="text-sm text-zinc-500 truncate">
                              #{m.memberNumber}, joined {new Date(m.joinedAt).toLocaleDateString("en-GB")}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 text-sm font-bold text-purple-800 bg-purple-50 border border-purple-200 rounded-full px-3 py-1 tabular-nums">
                          {m.balance} pts
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB: PROGRAMME REWARDS & REDEMPTION RULES               */}
          {/* ======================================================== */}
          {activeTab === "rewards" && (
            <div className="space-y-6">
              <div>
                <h2 className="font-display text-3xl font-bold text-evergreen-deep">Rewards</h2>
                <p className="text-zinc-600 mt-1">
                  What customers can get with their points. Your staff can add to this list too, and give rewards from the counter.
                </p>
              </div>
              <RewardsManager
                unit={business?.programmeType === "stamps" ? "stamps" : "points"}
                startWithProductId={rewardStartProductId}
                onStarted={clearRewardStart}
                onChanged={loadRewards}
              />
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB: PRODUCTS & DISCOUNTS MANAGEMENT                    */}
          {/* ======================================================== */}
          {activeTab === "products" && (
            <div className="space-y-8">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h2 className="font-display text-3xl font-bold text-evergreen-deep">Products &amp; offers</h2>
                  <p className="text-zinc-600 mt-1">Your menu or price list, today&rsquo;s discount, and special-offer QR codes.</p>
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
                  <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-600/25">
                    %
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Today's Promotional Store Discount</h3>
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
                      className="w-14 text-xs font-bold text-indigo-700 focus:outline-none"
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
                    <h3 className="font-bold text-xs text-slate-700">Products & Menu Catalog</h3>
                  </div>
                  <span className="text-xs text-slate-500 font-mono font-semibold">{productsList.length} items configured</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500">
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
                                onClick={() => {
                                  setRewardStartProductId(prod.id);
                                  setActiveTab("rewards");
                                }}
                                className="text-xs font-bold text-evergreen hover:text-evergreen-deep hover:underline cursor-pointer flex items-center gap-1"
                              >
                                <Gift className="w-3.5 h-3.5" />
                                <span>Points reward</span>
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
                      <h3 className="text-xl font-bold text-slate-950 tracking-tight">Active Promotional & Offer QR Codes</h3>
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
                                className={`text-xs font-extrabold capitalize px-2.5 py-0.5 rounded-full border ${
                                  isActive
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : isDeactivated
                                    ? "bg-rose-50 text-rose-700 border-rose-200"
                                    : "bg-slate-100 text-slate-600 border-slate-200"
                                }`}
                              >
                                {isActive ? `Active • ${daysLeft}d left` : isDeactivated ? "Deactivated" : "Expired"}
                              </span>

                              <span className="text-xs font-mono text-slate-400 font-semibold">{qr.code}</span>
                            </div>

                            <div className="flex items-center gap-3 mb-3">
                              <div
                                onClick={() => setViewingPromoQr(qr)}
                                className="w-16 h-16 rounded-xl border border-slate-200 p-1 bg-white cursor-pointer hover:border-purple-500 shadow-2xs shrink-0"
                              >
                                <img src={qr.qrDataUrl} alt={qr.title} className="w-full h-full object-contain" />
                              </div>
                              <div className="min-w-0">
                                <h4 className="text-sm font-bold text-slate-900 truncate">{qr.title}</h4>
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
                                <span className="text-slate-400 block text-xs capitalize font-bold">Scans</span>
                                <span className="font-bold text-slate-900 text-xs">{qr.totalScans} scans</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-xs capitalize font-bold">Claims</span>
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
                      <h3 className="font-bold text-xs text-slate-700">Customer Promotional QR Scans Audit Log</h3>
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
                    <thead className="bg-slate-50/50 border-b border-slate-200 text-xs font-semibold text-slate-500">
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
                                  <span className="text-xs text-purple-700 font-bold block">
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
                                  <span className="text-xs font-bold capitalize px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-300 flex items-center gap-1 w-max animate-pulse">
                                    <Clock className="w-3 h-3" />
                                    Pending Approval
                                  </span>
                                )}
                                {isApproved && (
                                  <div className="font-sans">
                                    <span className="text-xs font-bold capitalize px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 inline-block">
                                      Claimed &amp; Approved
                                    </span>
                                    {scan.approvedByName && (
                                      <span className="text-xs text-slate-400 block mt-0.5">
                                        By {scan.approvedByName}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {isDiscarded && (
                                  <span className="text-xs font-bold capitalize px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                                    Discarded / Reset
                                  </span>
                                )}
                                {isVisit && (
                                  <span className="text-xs font-bold capitalize px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
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
                                    className="text-xs text-slate-400 hover:text-rose-600 h-6 px-1.5"
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
          {/* MESSAGES                                                 */}
          {/* ======================================================== */}
          {activeTab === "messages" && (
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-3xl font-bold text-evergreen-deep">Messages</h2>
                <p className="text-zinc-600 mt-1">
                  Questions from your customers. You and your staff can all reply; only the customer can end a chat.
                </p>
              </div>
              <BusinessInbox businessName={business?.name || "Your shop"} onUnreadChange={loadUnreadMessages} />
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: CUSTOMER MEMBERS TABLE                            */}
          {/* ======================================================== */}
          {activeTab === "members" && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h2 className="font-display text-3xl font-bold text-evergreen-deep">Customers</h2>
                  <p className="text-zinc-600 mt-1">Everyone with your loyalty card. You can add or remove points by hand here.</p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-72">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-zinc-400 stroke-[1.8]" />
                    <Input
                      placeholder="Search member # or name..."
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && loadMembers()}
                      className="pl-9 bg-white border-zinc-200 text-xs text-zinc-900 rounded-xl"
                    />
                  </div>
                  <Button size="sm" onClick={loadMembers} className="bg-zinc-950 hover:bg-zinc-800 font-semibold text-xs text-white rounded-xl shadow-xs transition-colors">
                    Search
                  </Button>
                </div>
              </div>

              {memberNotice && (
                <div
                  role="status"
                  className="flex items-start justify-between gap-3 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-900"
                >
                  <span className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    {memberNotice}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMemberNotice(null)}
                    className="text-emerald-800 font-medium hover:underline cursor-pointer shrink-0"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500">
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
                              <div className="text-xs text-slate-500">{m.email}</div>
                            </td>
                            <td className="p-4">
                              <span className="font-bold text-sm text-slate-900">{m.balance}</span>{" "}
                              <span className="text-xs text-slate-400">pts</span>
                            </td>
                            <td className="p-4 text-slate-500 font-mono">
                              {m.lifetimeEarned} pts
                            </td>
                            <td className="p-4">
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold capitalize border ${
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
                            <td className="p-4 text-right whitespace-nowrap">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSpendingMember(m)}
                                disabled={m.status !== "active"}
                                className="bg-white border-evergreen text-evergreen-deep hover:bg-mist text-xs font-semibold py-1 h-8 mr-2"
                              >
                                Use points
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openAdjust(m)}
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
                  <h2 className="font-display text-3xl font-bold text-evergreen-deep">Points history</h2>
                  <p className="text-zinc-600 mt-1">Every point added or spent, and which staff member did it. Entries can&rsquo;t be edited, only reversed.</p>
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
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500">
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
                              <span className="font-sans font-bold capitalize text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                                {tx.type}
                              </span>
                            </td>
                            <td className="p-4 font-bold text-indigo-600">#{tx.memberNumber}</td>
                            <td className="p-4 font-sans text-xs font-semibold text-slate-800">
                              {tx.actorName || "System / Owner"}
                            </td>
                            <td className="p-4">
                              <span
                                className={`font-bold text-sm ${
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
                <h2 className="font-display text-3xl font-bold text-evergreen-deep">Reviews &amp; links</h2>
                <p className="text-zinc-600 mt-1">Your Google review link and social pages, shown on every customer&rsquo;s card.</p>
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
                  businessName={business?.name || "Your business"}
                  brandPrimaryHex={business?.brandPrimaryHex || "#495e57"}
                  logoUrl={business?.logoUrl}
                  initialLinks={links}
                  onSave={async (updatedLinks) => {
                    const res = await fetch("/api/v1/owner/links", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(updatedLinks),
                    });
                    if (!res.ok) {
                      const json = await res.json().catch(() => null);
                      throw new Error(json?.error?.message || "Your links couldn't be saved. Try again.");
                    }
                    await loadLinks();
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
                <h2 className="font-display text-3xl font-bold text-evergreen-deep">QR posters</h2>
                <p className="text-zinc-600 mt-1">Print this and put it by the till. Customers scan it to get your loyalty card.</p>
              </div>

              {qrData && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                  <div className="p-8 rounded-3xl bg-white text-slate-950 text-center shadow-lg border border-slate-200">
                    <div className="text-xs font-bold text-indigo-600 mb-2">
                      Scan To Join & Earn Rewards
                    </div>
                    <h3 className="text-2xl font-bold text-slate-950 mb-4">Official Loyalty Pass</h3>
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
                  <h2 className="font-display text-3xl font-bold text-evergreen-deep">Staff</h2>
                  <p className="text-zinc-600 mt-1">Give each person their own login so they can scan cards and add points.</p>
                </div>
                <Button onClick={() => setShowAddStaff(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add Team Member
                </Button>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500">
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
                        <td className="p-4 text-slate-500 text-sm">{s.email}</td>
                        <td className="p-4">
                          <span className="font-semibold capitalize text-xs px-2.5 py-1 rounded-full bg-slate-100 text-indigo-700 border border-slate-200">
                            {s.role}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold capitalize border ${
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
                <h2 className="font-display text-3xl font-bold text-evergreen-deep">Downloads</h2>
                <p className="text-zinc-600 mt-1">Spreadsheets of your customers, points and rewards, for your accountant or your own records.</p>
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

      {/* Adjust points */}
      {adjustingMember && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-evergreen-deep/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="adjust-title"
        >
          <form
            className="max-w-md w-full p-6 rounded-3xl bg-white border border-zinc-200 text-zinc-900 shadow-2xl"
            onSubmit={(e) => {
              e.preventDefault();
              handleConfirmAdjust();
            }}
          >
            <h3 id="adjust-title" className="font-display text-xl font-bold text-evergreen-deep">
              Change points for {adjustingMember.name || `#${adjustingMember.memberNumber}`}
            </h3>
            <p className="text-sm text-zinc-600 mt-1 mb-5">
              They have <strong className="text-zinc-900">{adjustingMember.balance} points</strong> now.
            </p>

            <div className="grid grid-cols-2 gap-2 p-1 rounded-full bg-zinc-100 mb-4">
              {(["add", "remove"] as const).map((dir) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => {
                    setAdjustDirection(dir);
                    setAdjustReason(dir === "add" ? "goodwill" : "correction");
                    setAdjustError(null);
                  }}
                  className={`py-2 rounded-full text-sm font-semibold cursor-pointer transition-colors ${
                    adjustDirection === dir ? "bg-evergreen text-white" : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  {dir === "add" ? "Add points" : "Remove points"}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="adjust-amount" className="text-sm font-semibold text-zinc-800 block mb-1">
                  How many points
                </label>
                <Input
                  id="adjust-amount"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  autoFocus
                  placeholder="e.g. 20"
                  value={adjustPoints}
                  onChange={(e) => {
                    setAdjustPoints(e.target.value.replace(/[^0-9]/g, ""));
                    setAdjustError(null);
                  }}
                  className="text-lg font-semibold"
                />
                {adjustPoints && parseInt(adjustPoints, 10) > 0 && (
                  <p className="text-sm text-zinc-600 mt-1.5">
                    New balance will be{" "}
                    <strong className="text-zinc-900">
                      {adjustingMember.balance +
                        (adjustDirection === "add" ? 1 : -1) * parseInt(adjustPoints, 10)}{" "}
                      points
                    </strong>
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="adjust-reason" className="text-sm font-semibold text-zinc-800 block mb-1">
                  Reason
                </label>
                <select
                  id="adjust-reason"
                  value={adjustReason}
                  onChange={(e) =>
                    setAdjustReason(e.target.value as "goodwill" | "correction" | "fraud_removal" | "other")
                  }
                  className="w-full min-h-[44px] rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                >
                  <option value="goodwill">Thank-you or goodwill</option>
                  <option value="correction">Fixing a mistake</option>
                  <option value="fraud_removal">Points given by mistake or misuse</option>
                  <option value="other">Something else</option>
                </select>
              </div>

              <div>
                <label htmlFor="adjust-note" className="text-sm font-semibold text-zinc-800 block mb-1">
                  Note
                </label>
                <Input
                  id="adjust-note"
                  placeholder="e.g. Missed stamp on Monday's visit"
                  value={adjustNote}
                  maxLength={300}
                  onChange={(e) => {
                    setAdjustNote(e.target.value);
                    setAdjustError(null);
                  }}
                />
                <p className="text-xs text-zinc-500 mt-1">Saved in your points history so you know why later.</p>
              </div>

              {adjustError && (
                <p role="alert" className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  {adjustError}
                </p>
              )}

              <div className="flex gap-2.5 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 cursor-pointer"
                  onClick={() => setAdjustingMember(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 font-semibold cursor-pointer" disabled={loading}>
                  {loading ? "Saving..." : adjustDirection === "add" ? "Add points" : "Remove points"}
                </Button>
              </div>
            </div>
          </form>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in">
          <div className="max-w-md w-full p-6 rounded-2xl bg-white border border-zinc-200/90 text-zinc-900 shadow-xl">
            <h3 className="text-lg font-bold text-zinc-950 tracking-tight">Add Product or Service Item</h3>
            <p className="text-xs text-zinc-500 mt-1 mb-4">
              Add an item to your menu or catalog with pricing and points rewarded.
            </p>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-zinc-800 block mb-1">Item / Service Name</label>
                <Input
                  placeholder="e.g. Cappuccino, Skin Fade, Margherita Pizza"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  className="bg-white border-zinc-200 text-xs text-zinc-900 rounded-xl focus:ring-1 focus:ring-zinc-900 font-medium"
                />
              </div>

              <div>
                <label className="font-semibold text-zinc-800 block mb-1">Category</label>
                <Input
                  placeholder="e.g. Hot Drinks, Bakery, Haircut, Food"
                  value={newProductCategory}
                  onChange={(e) => setNewProductCategory(e.target.value)}
                  className="bg-white border-zinc-200 text-xs text-zinc-900 rounded-xl focus:ring-1 focus:ring-zinc-900 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-zinc-800 block mb-1">Price (£)</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 3.50"
                    value={newProductPrice}
                    onChange={(e) => setNewProductPrice(e.target.value)}
                    className="bg-white border-zinc-200 text-xs text-zinc-900 rounded-xl focus:ring-1 focus:ring-zinc-900 font-medium"
                  />
                </div>

                <div>
                  <label className="font-semibold text-zinc-800 block mb-1">Points Given</label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="e.g. 3"
                    value={newProductPoints}
                    onChange={(e) => setNewProductPoints(e.target.value)}
                    className="bg-white border-zinc-200 text-xs text-zinc-900 rounded-xl focus:ring-1 focus:ring-zinc-900 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-zinc-800 block mb-1">Special Discount (%) - Optional</label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="e.g. 10"
                  value={newProductDiscount}
                  onChange={(e) => setNewProductDiscount(e.target.value)}
                  className="bg-white border-zinc-200 text-xs text-zinc-900 rounded-xl focus:ring-1 focus:ring-zinc-900 font-medium"
                />
              </div>

              <div className="flex gap-2.5 pt-3">
                <Button
                  variant="outline"
                  className="flex-1 bg-white border-zinc-200 text-xs font-semibold text-zinc-700 rounded-xl shadow-2xs hover:bg-zinc-50 cursor-pointer"
                  onClick={() => setShowAddProduct(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 font-semibold text-xs bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in">
          <div className="max-w-md w-full p-6 rounded-2xl bg-white border border-zinc-200/90 text-zinc-900 shadow-xl">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-xl bg-zinc-100 text-zinc-900 flex items-center justify-center font-bold">
                <QrCode className="w-4 h-4 stroke-[1.8]" />
              </div>
              <h3 className="text-lg font-bold text-zinc-950 tracking-tight">Generate Offer QR Code</h3>
            </div>
            <p className="text-xs text-zinc-500 mb-4">
              Configure what customers receive upon camera scan, and set the QR validity duration.
            </p>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold text-zinc-800 block mb-1">Campaign Title / Offer Description</label>
                <Input
                  placeholder="e.g. Buy 3 coffees get 1 free, Weekend VIP Bonus, 20% Off"
                  value={promoTitle}
                  onChange={(e) => setPromoTitle(e.target.value)}
                  className="bg-white border-zinc-200 text-xs text-zinc-900 rounded-xl focus:ring-1 focus:ring-zinc-900 font-medium"
                />
              </div>

              <div>
                <label className="font-semibold text-zinc-800 block mb-1">Offer Type</label>
                <select
                  value={promoOfferType}
                  onChange={(e) => setPromoOfferType(e.target.value as any)}
                  className="w-full h-10 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-900 font-semibold focus:outline-none focus:ring-1 focus:ring-zinc-900"
                >
                  <option value="points_bonus">Bonus Points upon Scan</option>
                  <option value="free_product">Free Product / Item Reward</option>
                  <option value="discount_promo">Promotional Discount %</option>
                  <option value="stamps_bonus">Bonus Stamp (+1)</option>
                </select>
              </div>

              {promoOfferType === "free_product" && (
                <div>
                  <label className="font-semibold text-zinc-800 block mb-1">Select Free Product / Item</label>
                  <select
                    value={promoSelectedProdId}
                    onChange={(e) => setPromoSelectedProdId(e.target.value)}
                    className="w-full h-10 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-900 font-semibold focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  >
                    <option value="">-- Choose from your product menu --</option>
                    {productsList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (£{(p.priceMinor / 100).toFixed(2)})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Customer gets this item unlocked and recorded on their digital pass when scanned.
                  </p>
                </div>
              )}

              {promoOfferType === "points_bonus" && (
                <div>
                  <label className="font-semibold text-zinc-800 block mb-1">Points Credited to Pass</label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="e.g. 15"
                    value={promoPointsAward}
                    onChange={(e) => setPromoPointsAward(e.target.value)}
                    className="bg-white border-zinc-200 text-xs text-zinc-900 rounded-xl focus:ring-1 focus:ring-zinc-900 font-medium"
                  />
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Awarded instantly to customer's balance through the immutable ledger.
                  </p>
                </div>
              )}

              {promoOfferType === "discount_promo" && (
                <div>
                  <label className="font-semibold text-zinc-800 block mb-1">Discount Percentage (%)</label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    placeholder="e.g. 20"
                    value={promoDiscountPct}
                    onChange={(e) => setPromoDiscountPct(e.target.value)}
                    className="bg-white border-zinc-200 text-xs text-zinc-900 rounded-xl focus:ring-1 focus:ring-zinc-900 font-medium"
                  />
                </div>
              )}

              <div>
                <label className="font-semibold text-zinc-800 block mb-1">
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
                    className="bg-white border-zinc-200 text-xs text-zinc-900 font-semibold w-24 rounded-xl focus:ring-1 focus:ring-zinc-900"
                  />
                  <span className="text-xs text-zinc-500">
                    {parseInt(promoRequiredVisits || "1", 10) > 1
                      ? `Customer must scan ${promoRequiredVisits} times to unlock the free reward`
                      : "Instant reward on single scan"}
                  </span>
                </div>
              </div>

              <div>
                <label className="font-semibold text-zinc-800 block mb-1">Validity Period (Expiry)</label>
                <select
                  value={promoValidityDays}
                  onChange={(e) => setPromoValidityDays(e.target.value)}
                  className="w-full h-10 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-900 font-semibold focus:outline-none focus:ring-1 focus:ring-zinc-900"
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
                <p className="text-[11px] text-zinc-500 mt-1">
                  Once expired, customer scans will be politely rejected. You can also manually deactivate at any time.
                </p>
              </div>

              <div className="flex gap-2.5 pt-3">
                <Button
                  variant="outline"
                  className="flex-1 bg-white border-zinc-200 text-xs font-semibold text-zinc-700 rounded-xl hover:bg-zinc-50 shadow-2xs cursor-pointer"
                  onClick={() => setShowCreatePromoQr(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 font-semibold text-xs bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
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
              <span className="text-xs font-extrabold capitalize px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                Official Promo Collateral
              </span>
              <button
                onClick={() => setViewingPromoQr(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <h3 className="text-lg font-bold text-slate-950 mb-1">{viewingPromoQr.title}</h3>
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
                  className={`font-bold capitalize text-xs ${
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
      {spendingMember && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-evergreen-deep/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Use points for ${spendingMember.name || spendingMember.memberNumber}`}
          onClick={(e) => e.target === e.currentTarget && setSpendingMember(null)}
        >
          <div className="max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 rounded-3xl bg-white border border-zinc-200 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-zinc-500">Customer #{spendingMember.memberNumber}</p>
              <button
                type="button"
                onClick={() => setSpendingMember(null)}
                className="p-1.5 rounded-full hover:bg-zinc-100 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <SpendPointsPanel
              membershipId={spendingMember.id}
              customerName={spendingMember.name || "this customer"}
              balance={spendingMember.balance}
              unit={business?.programmeType === "stamps" ? "stamps" : "points"}
              onSpent={(result) => {
                setSpendingMember({ ...spendingMember, balance: result.newBalance });
                setMembers((list) => list.map((m) => (m.id === spendingMember.id ? { ...m, balance: result.newBalance } : m)));
                loadOverview();
                loadRewards();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
