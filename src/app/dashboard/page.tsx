"use client";

import React, { useState, useEffect } from "react";
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
  FileDown,
  Download,
  CheckCircle2,
  Search,
  Plus,
  RefreshCw,
  Sparkles,
  ExternalLink,
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
    "overview" | "members" | "ledger" | "rewards" | "links" | "qr" | "team" | "reports" | "audit"
  >("overview");

  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [team, setTeam] = useState<StaffRow[]>([]);
  const [links, setLinks] = useState<LinkConfig[]>([]);
  const [qrData, setQrData] = useState<{ joinUrl: string; qrPng: string } | null>(null);

  const [loading, setLoading] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");

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
  const [newStaffRole, setNewStaffRole] = useState<"manager" | "staff" | "marketing">("staff");

  const loadOverview = async () => {
    try {
      const res = await fetch("/api/v1/owner/overview");
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

  // Submit Points Adjustment
  const handleConfirmAdjust = async () => {
    if (!adjustingMember || !adjustPoints || !adjustNote) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/owner/members/${adjustingMember.id}`, {
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
        }),
      });
      if (res.ok) {
        setShowAddStaff(false);
        setNewStaffEmail("");
        setNewStaffName("");
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shrink-0 flex flex-col justify-between">
        <div>
          <div className="flex items-center space-x-2.5 px-3 py-3 mb-6">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white font-bold text-sm dark:bg-slate-100 dark:text-slate-900">
              LP
            </span>
            <div>
              <div className="font-extrabold text-sm leading-tight">Loyalty Console</div>
              <div className="text-[11px] text-slate-400 font-medium">Business Dashboard</div>
            </div>
          </div>

          <nav className="space-y-1">
            {[
              { id: "overview", label: "Overview", icon: LayoutDashboard },
              { id: "members", label: "Members", icon: Users },
              { id: "ledger", label: "Transactions", icon: Receipt },
              { id: "links", label: "Links & Page", icon: Share2 },
              { id: "qr", label: "QR Posters", icon: QrCode },
              { id: "team", label: "Team & Staff", icon: UserCheck },
              { id: "reports", label: "CSV Reports", icon: FileDown },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleTabChange(item.id as typeof activeTab)}
                  className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? "bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Quick Links Footer */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 px-2 space-y-1">
          <a href="/staff" className="flex items-center space-x-1 hover:text-slate-900 dark:hover:text-white">
            <ExternalLink className="h-3 w-3" />
            <span>Open Staff Terminal</span>
          </a>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 md:p-8 max-w-6xl overflow-y-auto">
        {/* Tab 1: Overview */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black tracking-tight">Programme Overview</h2>
                <p className="text-sm text-slate-500">
                  Key performance metrics reconciled with your immutable ledger.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={loadOverview}>
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Refresh
              </Button>
            </div>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-5">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Total Members
                </span>
                <div className="text-3xl font-black mt-1">{metrics?.totalMembers || 0}</div>
                <span className="text-xs text-emerald-600 font-semibold mt-1 block">Active Accounts</span>
              </Card>

              <Card className="p-5">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Active (30 Days)
                </span>
                <div className="text-3xl font-black mt-1">{metrics?.activeMembers30d || 0}</div>
                <span className="text-xs text-slate-500 font-medium mt-1 block">Recent Shoppers</span>
              </Card>

              <Card className="p-5">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Points Liability
                </span>
                <div className="text-3xl font-black mt-1 text-purple-600">
                  {metrics?.outstandingPoints || 0}
                </div>
                <span className="text-xs text-slate-500 font-medium mt-1 block">Unredeemed Points</span>
              </Card>

              <Card className="p-5">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Link Clicks
                </span>
                <div className="text-3xl font-black mt-1 text-blue-600">
                  {metrics?.linkClicksTotal || 0}
                </div>
                <span className="text-xs text-slate-500 font-medium mt-1 block">Social & Reviews</span>
              </Card>
            </div>

            {/* Readiness Checklist / Launch Wizard per Section 14.4 */}
            <Card className="p-6 border-indigo-100 bg-indigo-50/40 dark:bg-indigo-950/20 dark:border-indigo-900/50">
              <CardTitle className="text-lg flex items-center mb-3">
                <Sparkles className="h-5 w-5 mr-2 text-indigo-600" />
                Programme Readiness Checklist
              </CardTitle>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="flex items-center space-x-2 text-emerald-700 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Branded Loyalty Hub Configured</span>
                </div>
                <div className="flex items-center space-x-2 text-emerald-700 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Immutable Points Ledger Active</span>
                </div>
                <div className="flex items-center space-x-2 text-emerald-700 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Anti-Gating Review Links Ready</span>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Tab 2: Members Table */}
        {activeTab === "members" && (
          <div className="space-y-5">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black tracking-tight">Customer Members</h2>
                <p className="text-sm text-slate-500">Manage enrolled customers and balances.</p>
              </div>
              <div className="flex space-x-2">
                <Input
                  placeholder="Search by member # or name"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadMembers()}
                  className="w-64 text-sm"
                />
                <Button onClick={loadMembers}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-xs font-bold uppercase text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="p-3.5">Member #</th>
                      <th className="p-3.5">Customer</th>
                      <th className="p-3.5">Balance</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5">Joined</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {members.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                        <td className="p-3.5 font-mono font-bold text-xs">#{m.memberNumber}</td>
                        <td className="p-3.5">
                          <div className="font-semibold">{m.name || "Member"}</div>
                          <div className="text-xs text-slate-400">{m.email}</div>
                        </td>
                        <td className="p-3.5 font-black text-base">{m.balance} pts</td>
                        <td className="p-3.5">
                          <Badge variant={m.status === "active" ? "success" : "destructive"}>
                            {m.status}
                          </Badge>
                        </td>
                        <td className="p-3.5 text-xs text-slate-500">
                          {new Date(m.joinedAt).toLocaleDateString()}
                        </td>
                        <td className="p-3.5 text-right space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setAdjustingMember(m)}
                          >
                            Adjust Points
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* Tab 3: Transactions Ledger */}
        {activeTab === "ledger" && (
          <div className="space-y-5">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black tracking-tight">Transactions Ledger</h2>
                <p className="text-sm text-slate-500">
                  Append-only immutable record of all points activities.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={loadLedger}>
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Refresh
              </Button>
            </div>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-xs font-bold uppercase text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="p-3.5">Date (UTC)</th>
                      <th className="p-3.5">Type</th>
                      <th className="p-3.5">Member #</th>
                      <th className="p-3.5">Delta</th>
                      <th className="p-3.5">Note</th>
                      <th className="p-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {ledger.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                        <td className="p-3.5 text-xs text-slate-500 font-mono">
                          {new Date(tx.occurredAt).toLocaleString()}
                        </td>
                        <td className="p-3.5 font-bold uppercase text-xs">{tx.type}</td>
                        <td className="p-3.5 font-mono text-xs">#{tx.memberNumber}</td>
                        <td
                          className={`p-3.5 font-black text-sm ${
                            tx.pointsDelta > 0 ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {tx.pointsDelta > 0 ? `+${tx.pointsDelta}` : tx.pointsDelta}
                        </td>
                        <td className="p-3.5 text-xs text-slate-400">{tx.note || "-"}</td>
                        <td className="p-3.5 text-right">
                          {tx.type !== "reverse" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950"
                              onClick={() => setReversingTx(tx)}
                            >
                              Reverse
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* Tab 4: Links & Page Editor */}
        {activeTab === "links" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-black tracking-tight">Review Links & Hub Page</h2>
              <p className="text-sm text-slate-500">
                Customise Google reviews, Instagram, Facebook links with real-time phone/desktop preview.
              </p>
            </div>

            <LinksAndPageEditor
              businessName="Your Business"
              brandPrimaryHex="#0f172a"
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
        )}

        {/* Tab 5: QR Posters */}
        {activeTab === "qr" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-black tracking-tight">Printable Join QR Assets</h2>
              <p className="text-sm text-slate-500">
                Display this QR code in your shop or on tables for customers to scan and join.
              </p>
            </div>

            {qrData && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                <Card className="p-8 text-center bg-white dark:bg-slate-900 border-2 border-slate-900 rounded-3xl shadow-lg">
                  <div className="text-xs uppercase font-extrabold tracking-widest text-slate-500 mb-2">
                    Printable Signage
                  </div>
                  <h3 className="text-2xl font-black mb-4">Scan To Join & Earn Rewards</h3>
                  <img
                    src={qrData.qrPng}
                    alt="Join QR Poster"
                    className="w-64 h-64 mx-auto border-2 border-slate-200 rounded-2xl p-2 bg-white"
                  />
                  <div className="mt-4 text-xs font-mono text-slate-400 break-all">
                    {qrData.joinUrl}
                  </div>
                </Card>

                <div className="space-y-4">
                  <Card className="p-6">
                    <CardTitle className="text-lg mb-2">Download Assets</CardTitle>
                    <p className="text-sm text-slate-500 mb-5">
                      Download high-resolution image files ready for poster or sticker printing.
                    </p>
                    <div className="space-y-3">
                      <a
                        href={qrData.qrPng}
                        download="Join-QR-Poster.png"
                        className="inline-flex w-full items-center justify-center font-bold px-4 py-3 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download PNG Format
                      </a>
                    </div>
                  </Card>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 6: Team & Staff */}
        {activeTab === "team" && (
          <div className="space-y-5">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black tracking-tight">Team & Staff Access</h2>
                <p className="text-sm text-slate-500">
                  Manage staff terminals, manager overrides, and roles.
                </p>
              </div>
              <Button onClick={() => setShowAddStaff(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add Team Member
              </Button>
            </div>

            <Card className="overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 dark:bg-slate-800 text-xs font-bold uppercase text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="p-3.5">Name</th>
                    <th className="p-3.5">Email</th>
                    <th className="p-3.5">Role</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {team.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                      <td className="p-3.5 font-bold">{s.name || "Staff Member"}</td>
                      <td className="p-3.5 text-xs text-slate-500">{s.email}</td>
                      <td className="p-3.5 font-semibold capitalize text-xs">{s.role}</td>
                      <td className="p-3.5">
                        <Badge variant={s.status === "active" ? "success" : "destructive"}>
                          {s.status}
                        </Badge>
                      </td>
                      <td className="p-3.5 text-right">
                        {s.role !== "owner" && s.status === "active" && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleRevokeStaff(s.id)}
                          >
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        )}

        {/* Tab 7: Reports CSV Export */}
        {activeTab === "reports" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-black tracking-tight">Audited Data Exports</h2>
              <p className="text-sm text-slate-500">
                Download comprehensive CSV reports for financial reconciliation and audits.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="p-6">
                <CardTitle className="text-lg mb-2">Ledger Transactions</CardTitle>
                <p className="text-xs text-slate-500 mb-4">
                  Full history of every earn, redeem, adjust, and reverse event with timestamp.
                </p>
                <a
                  href="/api/v1/owner/reports/export?type=ledger"
                  className="inline-flex w-full items-center justify-center font-bold px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm"
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  Export Ledger CSV
                </a>
              </Card>

              <Card className="p-6">
                <CardTitle className="text-lg mb-2">Customer Members</CardTitle>
                <p className="text-xs text-slate-500 mb-4">
                  Complete list of enrolled members, member numbers, balances, and opt-ins.
                </p>
                <a
                  href="/api/v1/owner/reports/export?type=members"
                  className="inline-flex w-full items-center justify-center font-bold px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm"
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  Export Members CSV
                </a>
              </Card>

              <Card className="p-6">
                <CardTitle className="text-lg mb-2">Redemptions Log</CardTitle>
                <p className="text-xs text-slate-500 mb-4">
                  Record of all reward redemptions, costs, code last4, and staff confirmations.
                </p>
                <a
                  href="/api/v1/owner/reports/export?type=redemptions"
                  className="inline-flex w-full items-center justify-center font-bold px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm"
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  Export Redemptions CSV
                </a>
              </Card>
            </div>
          </div>
        )}
      </main>

      {/* Adjust Points Modal */}
      {adjustingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <Card className="max-w-md w-full p-6 bg-white dark:bg-slate-900">
            <CardTitle className="text-lg mb-1">
              Adjust Points: {adjustingMember.name || `#${adjustingMember.memberNumber}`}
            </CardTitle>
            <p className="text-xs text-slate-500 mb-4">
              Current balance: {adjustingMember.balance} pts. Balance cannot drop below 0.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Points Delta (+ or -)
                </label>
                <Input
                  type="number"
                  placeholder="e.g. 20 or -15"
                  value={adjustPoints}
                  onChange={(e) => setAdjustPoints(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Reason Code
                </label>
                <select
                  value={adjustReason}
                  onChange={(e) =>
                    setAdjustReason(e.target.value as "goodwill" | "correction" | "fraud_removal" | "other")
                  }
                  className="w-full min-h-[48px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
                >
                  <option value="goodwill">Goodwill Bonus</option>
                  <option value="correction">Billing Correction</option>
                  <option value="fraud_removal">Fraud Removal</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Operational Note (Required)
                </label>
                <Input
                  placeholder="Explain why this adjustment is being made"
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                />
              </div>

              <div className="flex space-x-2 pt-3">
                <Button variant="outline" className="flex-1" onClick={() => setAdjustingMember(null)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 font-bold"
                  onClick={handleConfirmAdjust}
                  disabled={loading || !adjustPoints || !adjustNote}
                >
                  {loading ? "Saving..." : "Apply Adjustment"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Reverse Transaction Modal */}
      {reversingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <Card className="max-w-md w-full p-6 bg-white dark:bg-slate-900">
            <CardTitle className="text-lg text-rose-600 mb-1">Reverse Transaction</CardTitle>
            <p className="text-xs text-slate-500 mb-4">
              Reversing transaction of {reversingTx.pointsDelta} points for #{reversingTx.memberNumber}.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Reversal Reason
                </label>
                <select
                  value={reverseReason}
                  onChange={(e) =>
                    setReverseReason(e.target.value as "correction" | "goodwill" | "fraud_removal" | "other")
                  }
                  className="w-full min-h-[48px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
                >
                  <option value="correction">Mistaken Entry</option>
                  <option value="goodwill">Customer Goodwill</option>
                  <option value="fraud_removal">Fraudulent Transaction</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Audited Note (Required)
                </label>
                <Input
                  placeholder="Reason for reversal"
                  value={reverseNote}
                  onChange={(e) => setReverseNote(e.target.value)}
                />
              </div>

              <div className="flex space-x-2 pt-3">
                <Button variant="outline" className="flex-1" onClick={() => setReversingTx(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 font-bold"
                  onClick={handleConfirmReverse}
                  disabled={loading || !reverseNote}
                >
                  {loading ? "Reversing..." : "Confirm Reversal"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Add Staff Modal */}
      {showAddStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <Card className="max-w-md w-full p-6 bg-white dark:bg-slate-900">
            <CardTitle className="text-lg mb-1">Add Team Member</CardTitle>
            <p className="text-xs text-slate-500 mb-4">
              Authorize staff or manager login for this business.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Full Name
                </label>
                <Input
                  placeholder="e.g. John Doe"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Email Address
                </label>
                <Input
                  type="email"
                  placeholder="staff@example.com"
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Role</label>
                <select
                  value={newStaffRole}
                  onChange={(e) =>
                    setNewStaffRole(e.target.value as "staff" | "manager" | "marketing")
                  }
                  className="w-full min-h-[48px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"
                >
                  <option value="staff">Staff (Terminal Earn & Redeem)</option>
                  <option value="manager">Manager (Adjustments & Reports)</option>
                  <option value="marketing">Marketing (Analytics Only)</option>
                </select>
              </div>

              <div className="flex space-x-2 pt-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowAddStaff(false)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 font-bold"
                  onClick={handleAddStaff}
                  disabled={loading || !newStaffEmail || !newStaffName}
                >
                  {loading ? "Adding..." : "Add Member"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
