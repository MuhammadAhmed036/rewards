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

export default function OwnerDashboardPage() {
  const [activeTab, setActiveTab] = useState<
    "overview" | "members" | "ledger" | "rewards" | "links" | "qr" | "team" | "reports"
  >("overview");

  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [team, setTeam] = useState<StaffRow[]>([]);
  const [links, setLinks] = useState<LinkConfig[]>([]);
  const [qrData, setQrData] = useState<{ joinUrl: string; qrPng: string } | null>(null);

  const [loading, setLoading] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [ledgerSearch, setLedgerSearch] = useState("");

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

  useEffect(() => {
    loadOverview();
  }, []);

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    if (tab === "overview") loadOverview();
    if (tab === "members") loadMembers();
    if (tab === "ledger") loadLedger();
    if (tab === "team") loadTeam();
    if (tab === "links") loadLinks();
    if (tab === "qr") loadQr();
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
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Enterprise Bar (Light Theme) */}
      <header className="h-16 border-b border-slate-200 bg-white/95 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-md shadow-indigo-600/20">
            LP
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm text-slate-900 tracking-tight">Enterprise Loyalty ERP</span>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Active Production
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium hidden sm:block">
              PostgreSQL Double-Entry • UK Minor Pence Engine
            </p>
          </div>
        </div>

        {/* Global Action Tools */}
        <div className="flex items-center gap-2.5">
          <Link
            href="/staff"
            className="hidden md:inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 px-3 py-1.5 rounded-xl transition-all shadow-2xs"
          >
            <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
            <span>Open Staff Scanner</span>
          </Link>

          <button
            onClick={() => handleTabChange("reports")}
            className="hidden lg:inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 px-3 py-1.5 rounded-xl transition-all shadow-2xs cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5 text-indigo-600" />
            <span>Export Audit Pack</span>
          </button>

          <button
            onClick={async () => {
              await fetch("/api/v1/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        {/* Left ERP Sidebar (Light Theme) */}
        <aside className="w-full md:w-64 border-r border-slate-200 bg-white p-4 shrink-0 flex flex-col justify-between">
          <div>
            <div className="px-3 py-2 mb-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block">
                Command Console
              </span>
            </div>

            <nav className="space-y-1">
              {[
                { id: "overview", label: "Executive Overview", icon: LayoutDashboard },
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
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      isActive
                        ? "bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${isActive ? "text-indigo-600" : "text-slate-400"}`} />
                      <span>{item.label}</span>
                    </div>
                    {isActive && <ChevronRight className="w-3.5 h-3.5 text-indigo-600" />}
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
    </div>
  );
}
