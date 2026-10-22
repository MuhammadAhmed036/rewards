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

interface AdminCustomerItem {
  id: string;
  memberNumber: string;
  status: string;
  joinedAt: string;
  balance: number | null;
  name: string | null;
  email: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
}

export default function PlatformAdminPage() {
  const [tab, setTab] = useState<"tenants" | "customers" | "health" | "audit">("tenants");
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [customers, setCustomers] = useState<AdminCustomerItem[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerLoading, setCustomerLoading] = useState(false);
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

  const fetchCustomers = async (searchOverride?: string) => {
    try {
      setCustomerLoading(true);
      const q = searchOverride !== undefined ? searchOverride : customerSearch;
      const res = await fetch(`/api/v1/admin/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      if (res.status === 401 || res.status === 403) {
        window.location.href = "/login?redirect=/admin";
        return;
      }
      if (res.ok) {
        const json = await res.json();
        setCustomers(json.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCustomerLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "tenants") fetchTenants();
    if (tab === "customers") fetchCustomers();
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
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-xl">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-950 leading-tight">Platform Admin Console</h1>
              <p className="text-xs text-slate-500">UK Loyalty Platform System Management</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex space-x-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              onClick={() => setTab("tenants")}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                tab === "tenants"
                  ? "bg-white text-indigo-700 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Tenants</span>
            </button>
            <button
              onClick={() => setTab("customers")}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                tab === "customers"
                  ? "bg-white text-indigo-700 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <User className="w-4 h-4" />
              <span>Customers</span>
            </button>
            <button
              onClick={() => setTab("health")}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                tab === "health"
                  ? "bg-white text-indigo-700 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>System Health</span>
            </button>
            <button
              onClick={() => setTab("audit")}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                tab === "audit"
                  ? "bg-white text-indigo-700 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
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
            className="flex items-center space-x-1.5 text-xs text-rose-600 hover:text-rose-700 font-semibold px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 transition-colors ml-3 cursor-pointer"
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
            {/* Enterprise Platform Overview KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-extrabold uppercase tracking-wider text-[10px]">Total Businesses</span>
                  <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-bold">{tenants.filter((t) => t.status === "active").length} Active</span>
                </div>
                <div className="text-3xl font-black text-slate-950 mt-1.5 tabular-nums">
                  {tenants.length}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Multi-tenant database isolates</p>
              </div>

              <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-extrabold uppercase tracking-wider text-[10px]">Active Locations</span>
                  <span className="text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded font-bold">UK Network</span>
                </div>
                <div className="text-3xl font-black text-slate-950 mt-1.5 tabular-nums">
                  {tenants.reduce((acc, t) => acc + (t.stats?.locationCount || 0), 0)}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Cashier terminal branches</p>
              </div>

              <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-extrabold uppercase tracking-wider text-[10px]">Platform Members</span>
                  <span className="text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded font-bold">Cross-Tenant</span>
                </div>
                <div className="text-3xl font-black text-slate-950 mt-1.5 tabular-nums">
                  {tenants.reduce((acc, t) => acc + (t.stats?.memberCount || 0), 0).toLocaleString()}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Enrolled customer passes</p>
              </div>

              <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-extrabold uppercase tracking-wider text-[10px]">Ledger Points Liability</span>
                  <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-bold">Audited</span>
                </div>
                <div className="text-3xl font-black text-amber-700 mt-1.5 tabular-nums">
                  {tenants.reduce((acc, t) => acc + (t.stats?.outstandingPoints || 0), 0).toLocaleString()} <span className="text-sm font-semibold text-slate-400">pts</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Total points outstanding</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-80">
                  <Search className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                  <Input
                    placeholder="Search by business name or slug..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && fetchTenants()}
                    className="pl-9 bg-white border-slate-300 text-slate-900"
                  />
                </div>
                <Button variant="outline" onClick={fetchTenants} className="border-slate-300 bg-white">
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-indigo-600" : ""}`} />
                </Button>
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-700 min-h-[40px]"
                >
                  <option value="">All Statuses</option>
                  <option value="pending">⏳ Pending Approval</option>
                  <option value="active">Active Only</option>
                  <option value="suspended">Suspended Only</option>
                  <option value="closed">Closed Only</option>
                </select>

                <Button
                  onClick={() => setShowAddModal(true)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs min-h-[40px] px-4 rounded-xl flex items-center gap-1.5 shadow-md shadow-indigo-600/25 cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>+ Add Business</span>
                </Button>
              </div>
            </div>

            {/* Tenants Table */}
            <Card className="bg-white border-slate-200 overflow-hidden shadow-xs rounded-3xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-900">
                  <thead className="bg-slate-50 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3.5">Business</th>
                      <th className="px-6 py-3.5">Slug</th>
                      <th className="px-6 py-3.5">Plan</th>
                      <th className="px-6 py-3.5">Members</th>
                      <th className="px-6 py-3.5">Locations</th>
                      <th className="px-6 py-3.5">Liability</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tenants.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                          {loading ? "Loading tenants..." : "No tenants found."}
                        </td>
                      </tr>
                    ) : (
                      tenants.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50 transition">
                          <td className="px-6 py-4 font-semibold text-slate-900">
                            <div>{t.name}</div>
                            <div className="text-xs text-slate-400">{t.industry || "General"}</div>
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-indigo-600 font-bold">
                            /b/{t.slug}
                          </td>
                          <td className="px-6 py-4">
                            <Badge
                              variant="outline"
                              className={
                                t.plan === "pro"
                                  ? "border-amber-300 text-amber-700 bg-amber-50"
                                  : "border-slate-200 text-slate-600 bg-slate-50"
                              }
                            >
                              {t.plan.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-slate-700 font-bold">{t.stats.memberCount}</td>
                          <td className="px-6 py-4 text-slate-700">{t.stats.locationCount}</td>
                          <td className="px-6 py-4 font-mono text-xs text-slate-700 font-semibold">
                            {t.stats.outstandingPoints.toLocaleString()} pts
                          </td>
                          <td className="px-6 py-4">
                            {t.status === "active" ? (
                              <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Active
                              </Badge>
                            ) : t.status === "pending" ? (
                              <Badge className="bg-amber-50 text-amber-800 border border-amber-300 font-bold">
                                ⏳ Pending Approval
                              </Badge>
                            ) : t.status === "suspended" ? (
                              <Badge className="bg-rose-50 text-rose-700 border border-rose-200">
                                Suspended
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-slate-500">
                                {t.status}
                              </Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right space-x-2">
                            {t.status === "pending" ? (
                              <Button
                                size="sm"
                                onClick={async () => {
                                  try {
                                    setLoading(true);
                                    await fetch(`/api/v1/admin/tenants/${t.id}`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        status: "active",
                                        reason: "Approved by Super Admin",
                                      }),
                                    });
                                    fetchTenants();
                                  } catch (e) {
                                    console.error(e);
                                  } finally {
                                    setLoading(false);
                                  }
                                }}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs cursor-pointer"
                              >
                                ✓ Approve Business
                              </Button>
                            ) : t.status === "active" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedTenant(t);
                                  setActionType("suspend");
                                }}
                                className="border-rose-300 text-rose-700 hover:bg-rose-50 text-xs"
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
                                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-xs"
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

        {/* TAB: REGISTERED CUSTOMERS (PLATFORM WIDE) */}
        {tab === "customers" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-950 tracking-tight">Enrolled Customer Directory</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time visibility into all customers registered across the loyalty platform
                </p>
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-80">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <Input
                    placeholder="Search by customer name, email, or business..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && fetchCustomers()}
                    className="pl-9 bg-white border-slate-300 text-xs"
                  />
                </div>
                <Button
                  onClick={() => fetchCustomers()}
                  disabled={customerLoading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
                >
                  Search
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCustomerSearch("");
                    fetchCustomers("");
                  }}
                  className="text-xs font-semibold"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  Reset
                </Button>
              </div>
            </div>

            <Card className="bg-white border-slate-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">
                    <tr>
                      <th className="p-4">Customer</th>
                      <th className="p-4">Email</th>
                      <th className="p-4">Registered Business</th>
                      <th className="p-4">Member #</th>
                      <th className="p-4">Points Balance</th>
                      <th className="p-4">Enrolled Date</th>
                      <th className="p-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customerLoading ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400 text-xs">
                          Loading customer accounts...
                        </td>
                      </tr>
                    ) : customers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400 text-xs">
                          No registered customer accounts found.
                        </td>
                      </tr>
                    ) : (
                      customers.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4">
                            <span className="font-bold text-slate-900 block text-xs">{c.name || "Customer Member"}</span>
                          </td>
                          <td className="p-4 font-mono text-[11px] text-slate-600">
                            {c.email}
                          </td>
                          <td className="p-4">
                            <span className="font-bold text-slate-800 block text-xs">{c.tenantName}</span>
                            <span className="text-[10px] font-mono text-slate-400">/b/{c.tenantSlug}</span>
                          </td>
                          <td className="p-4 font-mono font-bold text-indigo-600">
                            #{c.memberNumber}
                          </td>
                          <td className="p-4">
                            <span className="font-black text-sm text-slate-900">{c.balance ?? 0}</span>{" "}
                            <span className="text-[10px] text-slate-400 uppercase">pts</span>
                          </td>
                          <td className="p-4 text-slate-500 text-[11px]">
                            {new Date(c.joinedAt).toLocaleDateString()}
                          </td>
                          <td className="p-4">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                              c.status === "active"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-rose-50 text-rose-700 border-rose-200"
                            }`}>
                              {c.status}
                            </span>
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
                <Card className="bg-white border-slate-200 p-6 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Database Health
                    </span>
                    <Server className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span className="text-xl font-bold text-slate-950 capitalize">
                      {health.database.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    Ping Latency:{" "}
                    <span className="text-emerald-700 font-mono font-bold">
                      {health.database.latencyMs} ms
                    </span>
                  </div>
                </Card>

                {/* Email Outbox Card */}
                <Card className="bg-white border-slate-200 p-6 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Email Outbox Queue
                    </span>
                    <Mail className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="text-2xl font-bold text-slate-950">
                    {health.outbox.queued}{" "}
                    <span className="text-xs font-normal text-slate-400">queued</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                    <span>Sent: {health.outbox.sent}</span>
                    <span>Dead: {health.outbox.dead}</span>
                  </div>
                </Card>

                {/* Tenants Breakdown */}
                <Card className="bg-white border-slate-200 p-6 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Platform Tenants
                    </span>
                    <Building2 className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="text-2xl font-bold text-slate-950">
                    {health.tenants.total}{" "}
                    <span className="text-xs font-normal text-slate-400">total businesses</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                    <span className="text-emerald-600 font-semibold">Active: {health.tenants.active}</span>
                    <span className="text-rose-600 font-semibold">Suspended: {health.tenants.suspended}</span>
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
              <h2 className="text-lg font-bold text-slate-950">Global Platform Audit Trail</h2>
              <Button variant="outline" onClick={fetchAuditLogs} className="border-slate-300 bg-white">
                <RefreshCw className="w-4 h-4 mr-2 text-indigo-600" /> Refresh
              </Button>
            </div>

            <Card className="bg-white border-slate-200 overflow-hidden shadow-xs rounded-3xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-700">
                  <thead className="bg-slate-50 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3">Timestamp (UTC)</th>
                      <th className="px-6 py-3">Action</th>
                      <th className="px-6 py-3">Actor</th>
                      <th className="px-6 py-3">Target</th>
                      <th className="px-6 py-3">Reason / Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                          No audit log entries recorded.
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50 transition">
                          <td className="px-6 py-3 text-xs font-mono text-slate-500">
                            {new Date(log.createdAt).toISOString()}
                          </td>
                          <td className="px-6 py-3 font-semibold text-indigo-600 text-xs">
                            {log.action}
                          </td>
                          <td className="px-6 py-3 text-xs text-slate-900 font-medium">
                            {log.actorEmail || "System"}
                          </td>
                          <td className="px-6 py-3 text-xs font-mono text-slate-500">
                            {log.targetType}:{log.targetId.slice(0, 8)}...
                          </td>
                          <td className="px-6 py-3 text-xs text-slate-600">
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
                        {typeof window !== "undefined" ? window.location.origin : ""}/b/{createdTenantData.slug}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const origin = typeof window !== "undefined" ? window.location.origin : "";
                            navigator.clipboard.writeText(`${origin}/b/${createdTenantData.slug}`);
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
