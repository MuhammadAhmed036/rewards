"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ShieldAlert,
  Building2,
  Activity,
  History,
  Search,
  CheckCircle2,
  AlertTriangle,
  Server,
  RefreshCw,
  Mail,
  LogOut,
  PlusCircle,
  Sparkles,
  ExternalLink,
  Store,
  User,
  Lock,
  Copy,
  Check,
} from "lucide-react";

interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  status: string;
  plan: string;
  industry: string | null;
  timezone: string;
  createdAt: string;
  stats: {
    memberCount: number;
    locationCount: number;
    staffCount: number;
    outstandingPoints: number;
  };
}

interface SystemHealth {
  database: {
    status: string;
    latencyMs: number;
  };
  outbox: {
    queued: number;
    sent: number;
    failed: number;
    dead: number;
  };
  tenants: {
    total: number;
    active: number;
    suspended: number;
  };
  auditEvents24h: number;
  timestamp: string;
}

interface AuditLogEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  createdAt: string;
  actorEmail: string | null;
  actorName: string | null;
}

export default function PlatformAdminPage() {
  const [tab, setTab] = useState<"tenants" | "health" | "audit">("tenants");
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modals
  const [selectedTenant, setSelectedTenant] = useState<TenantSummary | null>(null);
  const [actionType, setActionType] = useState<"suspend" | "reactivate" | "plan" | null>(null);
  const [reason, setReason] = useState("");
  const [newPlan, setNewPlan] = useState<"free" | "pro">("free");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  // Add Business Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addBusinessName, setAddBusinessName] = useState("");
  const [addSlug, setAddSlug] = useState("");
  const [addIndustry, setAddIndustry] = useState("Restaurant & Dining");
  const [addProgrammeType, setAddProgrammeType] = useState<"points" | "stamps">("points");
  const [addPlan, setAddPlan] = useState<"free" | "pro">("free");
  const [addOwnerName, setAddOwnerName] = useState("");
  const [addOwnerEmail, setAddOwnerEmail] = useState("");
  const [addPassword, setAddPassword] = useState("Password123!");
  const [addLocationName, setAddLocationName] = useState("Main Branch");
  const [addBrandColor, setAddBrandColor] = useState("#4f46e5");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");
  const [createdTenantData, setCreatedTenantData] = useState<{
    slug: string;
    name: string;
    ownerEmail: string;
    ownerPassword: string;
    programmeType: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleBusinessNameChange = (val: string) => {
    setAddBusinessName(val);
    const slugified = val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    setAddSlug(slugified);
  };

  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addBusinessName.trim() || !addSlug.trim() || !addOwnerEmail.trim() || !addOwnerName.trim() || !addPassword.trim()) {
      setAddError("Please fill in all required fields.");
      return;
    }

    setAddLoading(true);
    setAddError("");
    try {
      const res = await fetch("/api/v1/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addBusinessName.trim(),
          slug: addSlug.trim(),
          ownerName: addOwnerName.trim(),
          ownerEmail: addOwnerEmail.trim(),
          password: addPassword,
          plan: addPlan,
          programmeType: addProgrammeType,
          industry: addIndustry,
          locationName: addLocationName.trim() || "Main Branch",
          brandPrimaryHex: addBrandColor,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Failed to create business");
      }

      setCreatedTenantData({
        slug: addSlug.trim(),
        name: addBusinessName.trim(),
        ownerEmail: addOwnerEmail.trim(),
        ownerPassword: addPassword,
        programmeType: addProgrammeType,
      });

      // Refresh table
      fetchTenants();
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "Failed to create business");
    } finally {
      setAddLoading(false);
    }
  };

  const handleCloseAddModal = () => {
    setShowAddModal(false);
    setAddBusinessName("");
    setAddSlug("");
    setAddOwnerName("");
    setAddOwnerEmail("");
    setAddPassword("Password123!");
    setAddLocationName("Main Branch");
    setAddBrandColor("#4f46e5");
    setAddError("");
    setCreatedTenantData(null);
    setCopiedLink(false);
  };

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (statusFilter) params.set("status", statusFilter);

      const res = await fetch(`/api/v1/admin/tenants?${params.toString()}`);
      if (res.status === 401 || res.status === 403) {
        window.location.href = "/login?redirect=/admin";
        return;
      }
      if (res.ok) {
        const json = await res.json();
        setTenants(json.data.tenants || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchHealth = async () => {
    try {
      const res = await fetch("/api/v1/admin/health");
      if (res.status === 401 || res.status === 403) {
        window.location.href = "/login?redirect=/admin";
        return;
      }
      if (res.ok) {
        const json = await res.json();
        setHealth(json.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch("/api/v1/admin/audit?limit=100");
      if (res.status === 401 || res.status === 403) {
        window.location.href = "/login?redirect=/admin";
        return;
      }
      if (res.ok) {
        const json = await res.json();
        setAuditLogs(json.data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (tab === "tenants") fetchTenants();
    if (tab === "health") fetchHealth();
    if (tab === "audit") fetchAuditLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, statusFilter]);

  const handleUpdateTenant = async () => {
    if (!selectedTenant) return;
    if (!reason.trim()) {
      setActionError("A reason is mandatory for platform admin actions.");
      return;
    }

    setLoading(true);
    setActionError("");
    setActionSuccess("");

    try {
      const payload: Record<string, unknown> = { reason };
      if (actionType === "suspend") payload.status = "suspended";
      if (actionType === "reactivate") payload.status = "active";
      if (actionType === "plan") payload.plan = newPlan;

      const res = await fetch(`/api/v1/admin/tenants/${selectedTenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error?.message || "Action failed");
      }

      setActionSuccess(`Successfully updated tenant ${selectedTenant.name}`);
      setTimeout(() => {
        setSelectedTenant(null);
        setActionType(null);
        setReason("");
        setActionSuccess("");
        fetchTenants();
      }, 1200);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">Platform Admin Console</h1>
              <p className="text-xs text-slate-400">UK Loyalty Platform System Management</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex space-x-1 p-1 bg-slate-800/80 rounded-xl border border-slate-700">
            <button
              onClick={() => setTab("tenants")}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                tab === "tenants"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Tenants</span>
            </button>
            <button
              onClick={() => setTab("health")}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                tab === "health"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>System Health</span>
            </button>
            <button
              onClick={() => setTab("audit")}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                tab === "audit"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <History className="w-4 h-4" />
              <span>Global Audit</span>
            </button>
          </nav>

          <button
            onClick={async () => {
              await fetch("/api/v1/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
            title="Sign Out"
            className="flex items-center space-x-1.5 text-xs text-rose-400 hover:text-rose-300 font-semibold px-3 py-1.5 rounded-lg border border-rose-500/30 hover:bg-rose-500/10 transition-colors ml-3 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full">
        {/* TAB 1: TENANTS */}
        {tab === "tenants" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-80">
                  <Search className="w-4 h-4 absolute left-3 top-3.5 text-slate-500" />
                  <Input
                    placeholder="Search by business name or slug..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && fetchTenants()}
                    className="pl-9 bg-slate-900 border-slate-800 text-slate-200"
                  />
                </div>
                <Button variant="outline" onClick={fetchTenants} className="border-slate-800">
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </Button>
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 min-h-[40px]"
                >
                  <option value="">All Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="suspended">Suspended Only</option>
                  <option value="closed">Closed Only</option>
                </select>

                <Button
                  onClick={() => setShowAddModal(true)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs min-h-[40px] px-4 rounded-xl flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>+ Add Business</span>
                </Button>
              </div>
            </div>

            {/* Tenants Table */}
            <Card className="bg-slate-900 border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-800/60 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-3">Business</th>
                      <th className="px-6 py-3">Slug</th>
                      <th className="px-6 py-3">Plan</th>
                      <th className="px-6 py-3">Members</th>
                      <th className="px-6 py-3">Locations</th>
                      <th className="px-6 py-3">Liability</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {tenants.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                          {loading ? "Loading tenants..." : "No tenants found."}
                        </td>
                      </tr>
                    ) : (
                      tenants.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-800/40 transition">
                          <td className="px-6 py-4 font-semibold text-white">
                            <div>{t.name}</div>
                            <div className="text-xs text-slate-500">{t.industry || "General"}</div>
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-indigo-400">
                            /b/{t.slug}
                          </td>
                          <td className="px-6 py-4">
                            <Badge
                              variant="outline"
                              className={
                                t.plan === "pro"
                                  ? "border-amber-500/50 text-amber-400 bg-amber-500/10"
                                  : "border-slate-700 text-slate-400"
                              }
                            >
                              {t.plan.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-slate-300">{t.stats.memberCount}</td>
                          <td className="px-6 py-4 text-slate-300">{t.stats.locationCount}</td>
                          <td className="px-6 py-4 font-mono text-xs text-slate-300">
                            {t.stats.outstandingPoints.toLocaleString()} pts
                          </td>
                          <td className="px-6 py-4">
                            {t.status === "active" ? (
                              <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                Active
                              </Badge>
                            ) : t.status === "suspended" ? (
                              <Badge className="bg-rose-500/10 text-rose-400 border border-rose-500/30">
                                Suspended
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-slate-500">
                                {t.status}
                              </Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right space-x-2">
                            {t.status === "active" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedTenant(t);
                                  setActionType("suspend");
                                }}
                                className="border-rose-900/60 text-rose-400 hover:bg-rose-950/40 text-xs"
                              >
                                Suspend
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedTenant(t);
                                  setActionType("reactivate");
                                }}
                                className="border-emerald-900/60 text-emerald-400 hover:bg-emerald-950/40 text-xs"
                              >
                                Reactivate
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedTenant(t);
                                setActionType("plan");
                                setNewPlan(t.plan as "free" | "pro");
                              }}
                              className="border-slate-700 text-slate-300 text-xs"
                            >
                              Plan
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* TAB 2: SYSTEM HEALTH */}
        {tab === "health" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-white">System Infrastructure & Operations</h2>
              <Button variant="outline" onClick={fetchHealth} className="border-slate-800">
                <RefreshCw className="w-4 h-4 mr-2" /> Refresh
              </Button>
            </div>

            {health && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Database Card */}
                <Card className="bg-slate-900 border-slate-800 p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Database Health
                    </span>
                    <Server className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <span className="text-xl font-bold text-white capitalize">
                      {health.database.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">
                    Ping Latency:{" "}
                    <span className="text-emerald-400 font-mono font-bold">
                      {health.database.latencyMs} ms
                    </span>
                  </div>
                </Card>

                {/* Email Outbox Card */}
                <Card className="bg-slate-900 border-slate-800 p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Email Outbox Queue
                    </span>
                    <Mail className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {health.outbox.queued}{" "}
                    <span className="text-xs font-normal text-slate-400">queued</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-400 pt-2 border-t border-slate-800">
                    <span>Sent: {health.outbox.sent}</span>
                    <span>Dead: {health.outbox.dead}</span>
                  </div>
                </Card>

                {/* Tenants Breakdown */}
                <Card className="bg-slate-900 border-slate-800 p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Platform Tenants
                    </span>
                    <Building2 className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {health.tenants.total}{" "}
                    <span className="text-xs font-normal text-slate-400">total businesses</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-400 pt-2 border-t border-slate-800">
                    <span className="text-emerald-400">Active: {health.tenants.active}</span>
                    <span className="text-rose-400">Suspended: {health.tenants.suspended}</span>
                  </div>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: GLOBAL AUDIT */}
        {tab === "audit" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-white">Global Platform Audit Trail</h2>
              <Button variant="outline" onClick={fetchAuditLogs} className="border-slate-800">
                <RefreshCw className="w-4 h-4 mr-2" /> Refresh
              </Button>
            </div>

            <Card className="bg-slate-900 border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-800/60 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-3">Timestamp (UTC)</th>
                      <th className="px-6 py-3">Action</th>
                      <th className="px-6 py-3">Actor</th>
                      <th className="px-6 py-3">Target</th>
                      <th className="px-6 py-3">Reason / Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                          No audit log entries recorded.
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-800/40 transition">
                          <td className="px-6 py-3 text-xs font-mono text-slate-400">
                            {new Date(log.createdAt).toISOString()}
                          </td>
                          <td className="px-6 py-3 font-semibold text-indigo-400 text-xs">
                            {log.action}
                          </td>
                          <td className="px-6 py-3 text-xs text-slate-300">
                            {log.actorEmail || "System"}
                          </td>
                          <td className="px-6 py-3 text-xs font-mono text-slate-400">
                            {log.targetType}:{log.targetId.slice(0, 8)}...
                          </td>
                          <td className="px-6 py-3 text-xs text-slate-400">
                            {log.reason || "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </main>

      {/* Action Modal (Suspend / Reactivate / Plan) */}
      {selectedTenant && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <Card className="max-w-md w-full p-6 bg-slate-900 border-slate-800 text-slate-100 space-y-4">
            <CardTitle className="text-lg flex items-center space-x-2 text-white">
              {actionType === "suspend" && (
                <>
                  <AlertTriangle className="w-5 h-5 text-rose-500" />
                  <span>Suspend Tenant: {selectedTenant.name}</span>
                </>
              )}
              {actionType === "reactivate" && (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <span>Reactivate Tenant: {selectedTenant.name}</span>
                </>
              )}
              {actionType === "plan" && (
                <>
                  <Building2 className="w-5 h-5 text-indigo-400" />
                  <span>Update Plan: {selectedTenant.name}</span>
                </>
              )}
            </CardTitle>

            <p className="text-xs text-slate-400">
              {actionType === "suspend"
                ? "Suspending this tenant will immediately invalidate all staff sessions and prevent all earn and redemption actions. Historical ledger rows remain permanently preserved."
                : actionType === "reactivate"
                ? "Reactivating this tenant will restore full earn and redemption capabilities for its members and staff."
                : "Change the subscription plan and limits for this business."}
            </p>

            {actionType === "plan" && (
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Select Subscription Plan
                </label>
                <select
                  value={newPlan}
                  onChange={(e) => setNewPlan(e.target.value as "free" | "pro")}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200"
                >
                  <option value="free">Free Plan (1 Location, Standard Limits)</option>
                  <option value="pro">Pro Plan (Multi-location, High Volume)</option>
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">
                Audit Reason (Mandatory per Section 10 & 22.10)
              </label>
              <Input
                placeholder="e.g. Terms of service violation, billing dispute, owner request"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="bg-slate-950 border-slate-700 text-slate-200"
              />
            </div>

            {actionError && <p className="text-xs text-rose-400">{actionError}</p>}
            {actionSuccess && <p className="text-xs text-emerald-400">{actionSuccess}</p>}

            <div className="flex space-x-2 pt-2">
              <Button
                variant="outline"
                className="flex-1 border-slate-800 text-slate-400"
                onClick={() => {
                  setSelectedTenant(null);
                  setActionType(null);
                  setReason("");
                  setActionError("");
                }}
              >
                Cancel
              </Button>
              <Button
                className={`flex-1 font-bold ${
                  actionType === "suspend"
                    ? "bg-rose-600 hover:bg-rose-700 text-white"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white"
                }`}
                onClick={handleUpdateTenant}
                disabled={loading || !reason.trim()}
              >
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Add New Business Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <Card className="max-w-xl w-full p-6 sm:p-8 bg-slate-900 border-slate-800 text-slate-100 my-8 shadow-2xl relative">
            {!createdTenantData ? (
              <form onSubmit={handleCreateBusiness} className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center space-x-2">
                    <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
                      <Store className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg text-white">Onboard New Business</CardTitle>
                      <p className="text-xs text-slate-400">Add a new restaurant, coffee shop, salon, or retail tenant</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseAddModal}
                    className="text-slate-400 hover:text-white text-lg font-bold p-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {addError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{addError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Business Name */}
                  <div className="sm:col-span-2">
                    <label className="font-semibold text-slate-300 block mb-1">
                      Business Name <span className="text-rose-400">*</span>
                    </label>
                    <Input
                      placeholder="e.g. Bella Italia Restaurant"
                      value={addBusinessName}
                      onChange={(e) => handleBusinessNameChange(e.target.value)}
                      className="bg-slate-950 border-slate-700 text-slate-200"
                      required
                    />
                  </div>

                  {/* Slug */}
                  <div>
                    <label className="font-semibold text-slate-300 block mb-1">
                      Webpage URL Slug <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-500 text-xs font-mono">/b/</span>
                      <Input
                        placeholder="bella-italia"
                        value={addSlug}
                        onChange={(e) => setAddSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                        className="pl-8 bg-slate-950 border-slate-700 text-slate-200 font-mono text-xs"
                        required
                      />
                    </div>
                  </div>

                  {/* Industry */}
                  <div>
                    <label className="font-semibold text-slate-300 block mb-1">Industry Type</label>
                    <select
                      value={addIndustry}
                      onChange={(e) => setAddIndustry(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 min-h-[40px]"
                    >
                      <option value="Restaurant & Dining">Restaurant & Dining</option>
                      <option value="Coffee Shop & Cafe">Coffee Shop & Cafe</option>
                      <option value="Barbershop & Grooming">Barbershop & Grooming</option>
                      <option value="Beauty & Salon">Beauty & Salon</option>
                      <option value="Car Wash & Detailing">Car Wash & Detailing</option>
                      <option value="Retail & Grocery">Retail & Grocery</option>
                      <option value="Fitness & Gym">Fitness & Gym</option>
                      <option value="General Service">Other Retail</option>
                    </select>
                  </div>

                  {/* Programme Mode */}
                  <div>
                    <label className="font-semibold text-slate-300 block mb-1">Loyalty Engine Mode</label>
                    <select
                      value={addProgrammeType}
                      onChange={(e) => setAddProgrammeType(e.target.value as "points" | "stamps")}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 min-h-[40px]"
                    >
                      <option value="points">Points Mode (Spend-based: £1 = 1 Point)</option>
                      <option value="stamps">Stamps Mode (Visit-based: 1 Stamp per visit)</option>
                    </select>
                  </div>

                  {/* Subscription Plan */}
                  <div>
                    <label className="font-semibold text-slate-300 block mb-1">Subscription Plan</label>
                    <select
                      value={addPlan}
                      onChange={(e) => setAddPlan(e.target.value as "free" | "pro")}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 min-h-[40px]"
                    >
                      <option value="free">Free Tier (Single Location)</option>
                      <option value="pro">Pro Tier (Multi-Location & Full Exports)</option>
                    </select>
                  </div>

                  {/* Initial Location */}
                  <div className="sm:col-span-2">
                    <label className="font-semibold text-slate-300 block mb-1">Primary Store Location</label>
                    <Input
                      placeholder="e.g. Central Branch / Soho"
                      value={addLocationName}
                      onChange={(e) => setAddLocationName(e.target.value)}
                      className="bg-slate-950 border-slate-700 text-slate-200"
                    />
                  </div>

                  {/* Divider: Owner / CEO Credentials */}
                  <div className="sm:col-span-2 pt-2 border-t border-slate-800">
                    <p className="font-bold text-slate-200 text-xs flex items-center gap-1.5 mb-2">
                      <User className="w-3.5 h-3.5 text-indigo-400" />
                      Business Owner / CEO Credentials
                    </p>
                  </div>

                  {/* Owner Name */}
                  <div>
                    <label className="font-semibold text-slate-300 block mb-1">
                      Owner Full Name <span className="text-rose-400">*</span>
                    </label>
                    <Input
                      placeholder="e.g. Marco Rossi"
                      value={addOwnerName}
                      onChange={(e) => setAddOwnerName(e.target.value)}
                      className="bg-slate-950 border-slate-700 text-slate-200"
                      required
                    />
                  </div>

                  {/* Owner Email */}
                  <div>
                    <label className="font-semibold text-slate-300 block mb-1">
                      Owner Email <span className="text-rose-400">*</span>
                    </label>
                    <Input
                      type="email"
                      placeholder="e.g. marco@bellaitalia.co.uk"
                      value={addOwnerEmail}
                      onChange={(e) => setAddOwnerEmail(e.target.value)}
                      className="bg-slate-950 border-slate-700 text-slate-200"
                      required
                    />
                  </div>

                  {/* Password */}
                  <div className="sm:col-span-2">
                    <label className="font-semibold text-slate-300 block mb-1">
                      Initial Login Password <span className="text-rose-400">*</span>
                    </label>
                    <Input
                      type="text"
                      placeholder="Password123!"
                      value={addPassword}
                      onChange={(e) => setAddPassword(e.target.value)}
                      className="bg-slate-950 border-slate-700 text-slate-200"
                      required
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Give this password to the restaurant owner so they can log in to their dashboard.
                    </p>
                  </div>
                </div>

                <div className="flex space-x-2 pt-3 border-t border-slate-800">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 border-slate-800 text-slate-400"
                    onClick={handleCloseAddModal}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 font-bold bg-indigo-600 hover:bg-indigo-500 text-white"
                    disabled={addLoading}
                  >
                    {addLoading ? "Creating Business..." : "Create & Launch Business"}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-5 text-center py-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Business Successfully Launched!</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    <span className="text-indigo-400 font-semibold">{createdTenantData.name}</span> has been provisioned with strict tenant isolation.
                  </p>
                </div>

                {/* Handover Cards */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-left space-y-3 text-xs">
                  <div>
                    <label className="text-[11px] font-bold uppercase text-slate-500 block">Customer Webpage URL</label>
                    <div className="flex items-center justify-between gap-2 mt-1 p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <span className="font-mono text-indigo-300 truncate">
                        http://localhost:3000/b/{createdTenantData.slug}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(`http://localhost:3000/b/${createdTenantData.slug}`);
                            setCopiedLink(true);
                            setTimeout(() => setCopiedLink(false), 2000);
                          }}
                          className="p-1 hover:text-white text-slate-400"
                          title="Copy Link"
                        >
                          {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                        <a
                          href={`/b/${createdTenantData.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 hover:text-white text-slate-400"
                          title="Open Customer Page"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
                    <div>
                      <label className="text-[11px] font-bold uppercase text-slate-500 block">Owner Login Email</label>
                      <p className="font-mono text-slate-200 mt-0.5">{createdTenantData.ownerEmail}</p>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold uppercase text-slate-500 block">Owner Password</label>
                      <p className="font-mono text-slate-200 mt-0.5">{createdTenantData.ownerPassword}</p>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-400">
                  The owner can now log in at <span className="font-mono text-slate-200">/login</span> to manage rewards, view members, and invite their staff.
                </p>

                <Button
                  onClick={handleCloseAddModal}
                  className="w-full font-bold bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  Done & Return to Console
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
