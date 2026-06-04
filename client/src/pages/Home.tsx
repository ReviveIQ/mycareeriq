// Design Philosophy: "Territory Map" — Clean Professional Light Dashboard
// DM Sans (headers) + Inter (body), off-white background, deep indigo accent
// CRM-like interface with status badges, filter chips, and sortable columns

import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { stageColors, priorityColors, categoryColors, getCategoryColor, stageOrder, exportToCSV, type PipelineStage, type Company, type CompanyCategory } from "@/lib/pipelineData";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  ExternalLink,
  Linkedin,
  Building2,
  Target,
  TrendingUp,
  Users,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  MapPin,
  DollarSign,
  StickyNote,
  X,
  FileDown,
  Search,
  FileText,
  Settings,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import GenerateApplication from "./GenerateApplication";
import ApplicationHistory from "./ApplicationHistory";
import ResearchSettings from "./ResearchSettings";
import PricingPage from "./PricingPage";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";

type SortField = "name" | "category" | "stage" | "priority" | "role";
type SortDir = "asc" | "desc";

const STAGE_CHART_COLORS = ["#94a3b8", "#f59e0b", "#6366f1", "#8b5cf6", "#10b981", "#ef4444"];
const CATEGORY_CHART_COLORS = ["#6366f1", "#8b5cf6", "#14b8a6", "#ec4899", "#f97316", "#06b6d4", "#0ea5e9", "#84cc16", "#10b981", "#f43f5e"];

// Small badge showing plan status in header
function SubscriptionBadge({ onUpgrade }: { onUpgrade: () => void }) {
  const { data: sub } = trpc.subscription.getStatus.useQuery();
  if (!sub) return null;

  if (sub.isPro) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 border border-indigo-200 rounded-full">
        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
        <span className="text-xs font-semibold text-indigo-700">Pro</span>
      </div>
    );
  }

  return (
    <button
      onClick={onUpgrade}
      className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 rounded-full transition-colors group"
    >
      <span className="text-xs font-medium text-slate-500 group-hover:text-indigo-600">Free</span>
      <span className="text-xs font-semibold text-indigo-600">Upgrade →</span>
    </button>
  );
}

export default function Home() {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<PipelineStage | "All">("All");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };
  const [categoryFilter, setCategoryFilter] = useState<CompanyCategory | "All">("All");
  const [priorityFilter, setPriorityFilter] = useState<"High" | "Medium" | "Low" | "All">("All");
  const [sortField, setSortField] = useState<SortField>("priority");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [activeTab, setActiveTab] = useState<"pipeline" | "analytics" | "generate" | "history" | "settings" | "pricing">("pipeline");
  const [isRunning, setIsRunning] = useState(false);
  const [generatePrefill, setGeneratePrefill] = useState<{
    companyName: string; jobTitle: string; jobDescription: string; contactName?: string; companyId: string;
  } | null>(null);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const verifySession = trpc.subscription.verifySession.useMutation();
  const { data: coverLetterHistory = [] } = trpc.application.list.useQuery();
  const coverLetterCompanyIds = new Set(
    (coverLetterHistory as any[]).map((a: any) => String(a.companyId))
  );

  // Handle Stripe redirect back after checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    const plan = params.get("plan");
    const sessionId = params.get("session_id");

    if (payment === "success") {
      window.history.replaceState({}, "", window.location.pathname);
      const label = plan?.includes("annual") ? "Pro Annual" : "Pro Monthly";

      // Verify session directly with Stripe as fallback for webhook delay
      if (sessionId) {
        verifySession.mutateAsync({ sessionId }).then(() => {
          utils.subscription.getStatus.invalidate();
          toast.success(`🎉 Welcome to ${label}! Unlimited research runs activated.`, { duration: 6000 });
        }).catch(() => {
          // Webhook may have already handled it
          utils.subscription.getStatus.invalidate();
          toast.success(`🎉 Welcome to ${label}! Unlimited research runs activated.`, { duration: 6000 });
        });
      } else {
        utils.subscription.getStatus.invalidate();
        toast.success(`🎉 Welcome to ${label}! Unlimited research runs activated.`, { duration: 6000 });
      }
    } else if (payment === "canceled") {
      window.history.replaceState({}, "", window.location.pathname);
      toast.info("Checkout canceled — your plan wasn't changed.");
    }
  }, []);

  // Fetch pipeline data from tRPC
  const { data: pipelineData = [], isLoading } = trpc.pipeline.getCompanies.useQuery();
  const { data: companyCount = 0 } = trpc.pipeline.getCompanyCount.useQuery();
  const { data: highPriorityCount = 0 } = trpc.pipeline.getHighPriority.useQuery();
  // Active jobs (excludes dismissed) — used for all KPI counts
  const activeData = pipelineData.filter((c: any) => c.stage !== "Dismissed");
  // Compute remoteCount from activeData — single source of truth, always in sync
  const remoteCount = activeData.filter((c: any) => c.remoteOk || c.remote).length;
  const runResearch = trpc.monitoring.runNow.useMutation();
  const markOutreachSent = trpc.pipeline.markOutreachSent.useMutation();
  const markApplied = trpc.pipeline.markApplied.useMutation();
  const { data: linkedInStatus } = trpc.pipeline.getLinkedInProfile.useQuery();

  const handleSendOutreach = async (company: Company) => {
    if (!company.contactLinkedIn) {
      toast.error("No LinkedIn profile found for this contact");
      return;
    }
    window.open(company.contactLinkedIn, "_blank");
    try {
      await markOutreachSent.mutateAsync({ companyId: company.id });
      await utils.pipeline.getCompanies.invalidate();
      toast.success(`Stage updated to Outreach — message sent to ${company.contactName || "contact"} on LinkedIn`);
      setSelectedCompany(null);
      // Nudge to generate cover letter while role is fresh
      setTimeout(() => {
        toast(`Ready to apply to ${(company as any).companyName || company.name}?`, {
          description: "Generate a tailored cover letter while the role is fresh.",
          action: {
            label: "Generate →",
            onClick: () => {
              const rawDesc = (company as any).jobDescription || company.role || "";
              const decoded = rawDesc.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g," ").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().slice(0,3000);
              setGeneratePrefill({
                companyName: (company as any).companyName || company.name,
                jobTitle: company.role || (company as any).jobTitle || "",
                jobDescription: decoded,
                contactName: company.contactName || "Hiring Manager",
                companyId: String(company.id),
              });
              setActiveTab("generate");
            }
          },
          duration: 8000,
        });
      }, 1500);
    } catch (err) {
      console.error("Failed to update stage:", err);
    }
  };

  const handleMarkApplied = async (company: Company) => {
    try {
      await markApplied.mutateAsync({ companyId: company.id });
      await utils.pipeline.getCompanies.invalidate();
      toast.success("Stage updated to Applied");
      setSelectedCompany(null);
    } catch (err) {
      console.error("Failed to mark applied:", err);
    }
  };
  const { data: rateLimitStatus, refetch: refetchRateLimit } = trpc.monitoring.getRateLimitStatus.useQuery();
  const updateStage = trpc.pipeline.updateStage.useMutation();
  const deleteCompany = trpc.pipeline.deleteCompany.useMutation();
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);

  const handleAddToPipeline = async (company: Company) => {
    if (!company.id) return;
    await updateStage.mutateAsync({ id: company.id as number, stage: "Outreach" });
    await utils.pipeline.getCompanies.invalidate();
    toast.success(`${company.name} added to pipeline — ready for outreach`);
    setSelectedCompany(null);
  };

  const handleDismiss = async (company: Company) => {
    if (!company.id) return;
    await updateStage.mutateAsync({ id: company.id as number, stage: "Dismissed" });
    await utils.pipeline.getCompanies.invalidate();
    toast.success(`${(company as any).companyName || company.name} dismissed — find it under the Dismissed filter`, {
      action: {
        label: "Undo",
        onClick: async () => {
          await updateStage.mutateAsync({ id: company.id as number, stage: "Research" });
          await utils.pipeline.getCompanies.invalidate();
        },
      },
    });
    setSelectedCompany(null);
    setConfirmRemoveId(null);
  };

  const handleRemove = async (company: Company) => {
    if (!company.id) return;
    await deleteCompany.mutateAsync({ id: company.id as number });
    await utils.pipeline.getCompanies.invalidate();
    await utils.pipeline.getCompanyCount.invalidate();
    toast.success(`${(company as any).companyName || company.name} permanently removed`);
    setSelectedCompany(null);
    setConfirmRemoveId(null);
  };

  const categories = useMemo(() => {
    const cats = Array.from(new Set(pipelineData.map((c) => c.category).filter(Boolean)));
    return cats.filter((c): c is string => typeof c === "string" && c.trim().length > 0).sort();
  }, [pipelineData]);

  const filtered = useMemo(() => {
    let data = [...pipelineData];
    // Hide dismissed from main view unless explicitly filtered to Dismissed
    if (stageFilter !== ("Dismissed" as any)) {
      data = data.filter(c => c.stage !== ("Dismissed" as any));
    }
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(
        (c) =>
          (c.name || "").toLowerCase().includes(q) ||
          (c.role || "").toLowerCase().includes(q) ||
          (c.contactName || "").toLowerCase().includes(q) ||
          (c.category || "").toLowerCase().includes(q)
      );
    }
    if (stageFilter !== "All") data = data.filter((c) => c.stage === stageFilter);
    if (categoryFilter !== "All") data = data.filter((c) => c.category === categoryFilter);
    if (priorityFilter !== "All") data = data.filter((c) => c.priority === priorityFilter);

    data.sort((a, b) => {
      let av: string = a[sortField];
      let bv: string = b[sortField];
      if (sortField === "priority") {
        const order = { High: 0, Medium: 1, Low: 2 };
        av = String(order[a.priority as "High" | "Medium" | "Low"]);
        bv = String(order[b.priority as "High" | "Medium" | "Low"]);
      }
      if (sortField === "stage") {
        av = String(stageOrder.indexOf(a.stage));
        bv = String(stageOrder.indexOf(b.stage));
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [pipelineData, search, stageFilter, categoryFilter, priorityFilter, sortField, sortDir]);

  const stageChartData = useMemo(() => {
    return stageOrder.map((s) => ({
      stage: s,
      count: pipelineData.filter((c) => c.stage === s).length,
    })).filter((d) => d.count > 0);
  }, []);

  const categoryChartData = useMemo(() => {
    const map: Record<string, number> = {};
    pipelineData.forEach((c) => {
      map[c.category] = (map[c.category] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, []);

  const priorityChartData = useMemo(() => {
    const high = pipelineData.filter((c) => c.priority === "High").length;
    const medium = pipelineData.filter((c) => c.priority === "Medium").length;
    const low = pipelineData.filter((c) => c.priority === "Low").length;
    return [
      { name: "High", value: high, color: "#f43f5e" },
      { name: "Medium", value: medium, color: "#f59e0b" },
      { name: "Low", value: low, color: "#94a3b8" },
    ];
  }, [pipelineData]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronsUpDown className="w-3 h-3 text-slate-400" />;
    return sortDir === "asc" ? (
      <ChevronUp className="w-3 h-3 text-indigo-600" />
    ) : (
      <ChevronDown className="w-3 h-3 text-indigo-600" />
    );
  }

  const handleRunNow = async () => {
    setIsRunning(true);
    setActiveTab("pipeline");
    try {
      const result = await runResearch.mutateAsync();

      if (result.rateLimited) {
        if ((result as any).requiresUpgrade) {
          toast.error("Free plan limit reached — upgrade to Pro for unlimited research", {
            action: {
              label: "Upgrade →",
              onClick: () => setActiveTab("pricing"),
            },
            duration: 8000,
          });
        } else {
          toast.error(result.message);
        }
        setIsRunning(false);
        return;
      }

      const isPro = (result.monthlyLimit || 10) >= 9999;
      const runsLeft = (result.monthlyLimit || 10) - (result.runsThisMonth || 0);
      toast.success(isPro
        ? "Job research started — checking companies for new roles"
        : `Job research started — ${runsLeft} run${runsLeft === 1 ? "" : "s"} remaining this month`
      );
      refetchRateLimit();

      // Poll every 5 seconds for 60 seconds — track previous count to detect when jobs land
      let polls = 0;
      let prevCount = 0;
      const poll = setInterval(async () => {
        polls++;
        await utils.pipeline.getCompanies.invalidate();
        await utils.pipeline.getCompanyCount.invalidate();
        await utils.pipeline.getHighPriority.invalidate();
        await utils.pipeline.getRemoteCount.invalidate();
        await refetchRateLimit();

        // Check if new companies arrived
        const currentCount = pipelineData.length;
        if (currentCount > prevCount && prevCount > 0) {
          // New jobs landed — do one final refresh and stop polling
          clearInterval(poll);
          setIsRunning(false);
          await utils.pipeline.getCompanies.invalidate();
          toast.success(`Pipeline updated — ${currentCount - prevCount} new companies added`);
          return;
        }
        prevCount = currentCount;

        if (polls >= 12) {
          clearInterval(poll);
          setIsRunning(false);
          // Final refresh when polling ends
          await utils.pipeline.getCompanies.invalidate();
          await utils.pipeline.getCompanyCount.invalidate();
          toast.success("Research complete — pipeline refreshed");
        }
      }, 5000);
    } catch (error) {
      console.error("Failed to run research:", error);
      toast.error("Failed to start job research");
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafaf9] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-screen-xl mx-auto px-3 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width:"30px",height:"30px",flexShrink:0}}>
              <defs>
                <linearGradient id="h-lg1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#60a5fa"/><stop offset="100%" stopColor="#2563eb"/></linearGradient>
                <linearGradient id="h-lg2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#93c5fd"/><stop offset="100%" stopColor="#3b82f6"/></linearGradient>
                <linearGradient id="h-lg3" x1="100%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stopColor="#1d4ed8"/><stop offset="100%" stopColor="#1e3a5f"/></linearGradient>
                <filter id="h-glow"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
              </defs>
              <polygon points="36,4 68,36 36,68 4,36" fill="url(#h-lg3)" opacity="0.35"/>
              <polygon points="36,4 20,20 36,36 52,20" fill="url(#h-lg2)" opacity="0.9"/>
              <polygon points="36,4 52,20 68,36 36,36" fill="url(#h-lg1)" opacity="0.65"/>
              <polygon points="4,36 20,20 36,36 20,52" fill="url(#h-lg1)" opacity="0.5"/>
              <polygon points="68,36 52,20 36,36 52,52" fill="url(#h-lg2)" opacity="0.75"/>
              <polygon points="36,68 20,52 36,36 52,52" fill="url(#h-lg3)" opacity="0.95"/>
              <circle cx="36" cy="36" r="10" fill="none" stroke="rgba(147,197,253,0.3)" strokeWidth="1"/>
              <circle cx="36" cy="36" r="6" fill="white" opacity="0.95" filter="url(#h-glow)"/>
              <circle cx="36" cy="36" r="3" fill="#93c5fd"/>
            </svg>
            <div>
              <h1 className="text-[14px] sm:text-[15px] leading-tight tracking-tight" style={{fontFamily:"'Montserrat',sans-serif",fontWeight:800}}>
                <span style={{color:"#0f172a"}}>MyCareer</span><span style={{color:"#2563eb"}}>IQ</span>
                <span className="hidden sm:inline" style={{color:"#64748b",fontWeight:500,fontSize:"13px"}}> — Job Search Pipeline</span>
              </h1>
              <p className="hidden sm:block text-xs leading-tight" style={{color:"#64748b",fontFamily:"'DM Sans',sans-serif"}}>
                by ReviveIQI · AI-Powered · Track & Apply
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Hide WorkspaceSwitcher + Team on mobile */}
            <div className="hidden sm:flex items-center gap-2">
              <WorkspaceSwitcher />
              <Button
                onClick={() => navigate("/workspace/settings")}
                variant="outline"
                size="sm"
                className="h-8 text-xs border-slate-200 text-slate-700 hover:bg-slate-50 gap-1.5"
              >
                <Settings className="w-3.5 h-3.5" />
                Team
              </Button>
            </div>

            {/* Run Now — always visible */}
            <div className="flex flex-col items-center gap-0.5">
              <Button
                onClick={handleRunNow}
                disabled={isRunning || rateLimitStatus?.canRunNow === false}
                size="sm"
                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                title={!rateLimitStatus?.canRunNow
                  ? (rateLimitStatus?.hoursUntilNextRun ? `Next run in ${rateLimitStatus.hoursUntilNextRun}h` : "Monthly limit reached")
                  : undefined}
              >
                {isRunning ? (
                  <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Running...</>
                ) : (
                  <><Play className="w-3.5 h-3.5" />Run Now</>
                )}
              </Button>
              {rateLimitStatus && rateLimitStatus.monthlyLimit !== 9999 && (
                <span className="text-[10px] leading-none font-medium" style={{
                  color: rateLimitStatus.canRunNow
                    ? (rateLimitStatus.runsThisMonth >= 5 ? "#f97316" : "#64748b")
                    : "#ef4444"
                }}>
                  {rateLimitStatus.canRunNow
                    ? `${rateLimitStatus.runsThisMonth}/${rateLimitStatus.monthlyLimit} used`
                    : (rateLimitStatus.hoursUntilNextRun ?? 0) > 0
                      ? `${rateLimitStatus.hoursUntilNextRun}h cooldown`
                      : `Limit reached`}
                </span>
              )}
            </div>

            {/* Plan badge — always visible */}
            <SubscriptionBadge onUpgrade={() => setActiveTab("pricing")} />

            {/* User menu — always visible, name hidden on mobile */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors text-sm font-medium text-slate-700 border border-slate-200"
              >
                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs flex-shrink-0">
                  {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
                </div>
                <span className="hidden sm:block max-w-[100px] truncate text-xs">{user?.name || user?.email}</span>
                <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showUserMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-xs font-semibold text-slate-900 truncate">{user?.name}</p>
                    <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign out
                  </button>
                </div>
              )}
            </div>

            {/* Export + status — desktop only */}
            <div className="hidden sm:flex items-center gap-2">
              <Button
                onClick={() => exportToCSV(filtered)}
                variant="outline"
                size="sm"
                className="h-8 text-xs border-slate-200 text-slate-700 hover:bg-slate-50 gap-1.5"
              >
                <FileDown className="w-3.5 h-3.5" />
                Export CSV
              </Button>
              <span className="text-xs text-slate-500">Updated May 2026</span>
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
        <h2 className="text-2xl font-bold text-slate-900 mb-4">Pipeline Overview</h2>
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            {
              icon: <Building2 className="w-4 h-4 text-indigo-600" />,
              label: "Total Prospects",
              value: String(activeData.length),
              sub: "Companies in pipeline",
              bg: "bg-indigo-50",
            },
            {
              icon: <Target className="w-4 h-4 text-rose-600" />,
              label: "High Priority",
              value: String(activeData.filter((c: any) => c.priority === "High").length),
              sub: "Immediate outreach targets",
              bg: "bg-rose-50",
            },
            {
              icon: <TrendingUp className="w-4 h-4 text-emerald-600" />,
              label: "Remote Roles",
              value: String(remoteCount),
              sub: `${remoteCount} of ${activeData.length} are remote-friendly`,
              bg: "bg-emerald-50",
            },
            {
              icon: <Users className="w-4 h-4 text-amber-600" />,
              label: "Key Contacts",
              value: String(activeData.filter((c: any) => c.contactName && (c.contactName as string).trim()).length),
              sub: "Contacts identified",
              bg: "bg-amber-50",
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3 shadow-sm"
            >
              <div className={`${kpi.bg} rounded-lg p-2 mt-0.5`}>{kpi.icon}</div>
              <div>
                <p className="text-2xl font-bold text-slate-900 leading-none">{kpi.value}</p>
                <p className="text-xs font-semibold text-slate-700 mt-1">{kpi.label}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{kpi.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tab Navigation */}
        <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-max sm:w-fit min-w-full sm:min-w-0">
          {(["pipeline", "analytics", "generate", "history", "settings", "pricing"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center gap-1 sm:gap-1.5 whitespace-nowrap ${
                activeTab === tab
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab === "pipeline" && <><span className="sm:hidden">📋</span><span className="hidden sm:inline">Pipeline Table</span></>}
              {tab === "analytics" && <><span className="sm:hidden">📊</span><span className="hidden sm:inline">Analytics</span></>}
              {tab === "generate" && (
                <><FileText className="w-3.5 h-3.5" /><span className="hidden sm:inline">Generate</span></>
              )}
              {tab === "history" && <><span className="sm:hidden">📁</span><span className="hidden sm:inline">History</span></>}
              {tab === "settings" && (
                <><Settings className="w-3.5 h-3.5" /><span className="hidden sm:inline">Settings</span></>
              )}
              {tab === "pricing" && <><span className="sm:hidden">⭐</span><span className="hidden sm:inline">Pricing</span></>}
            </button>
          ))}
          </div>
        </div>

        {activeTab === "pipeline" && (
          <>
            {/* Timeline panel — shown only when pipeline is empty */}
            {pipelineData.length === 0 && !isLoading && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900">Your pipeline builds over days, not seconds</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    The candidates who get offers didn't spray and pray — they built a targeted list and worked it.
                  </p>
                </div>
                <div className="divide-y divide-slate-50">
                  {[
                    {
                      day: "Day 1",
                      title: "Upload your resume",
                      body: "We score it, extract your target roles and industries, and configure your research profile. This is the foundation — garbage in, garbage out.",
                      status: pipelineData.length === 0 ? "current" : "done",
                      color: "#6366f1",
                    },
                    {
                      day: "Days 1–2",
                      title: "We research companies hiring for your roles",
                      body: "We pull live job postings from Greenhouse, Ashby, and Lever — scored for fit against your resume. No made-up listings, no stale data.",
                      status: "upcoming",
                      color: "#3b82f6",
                    },
                    {
                      day: "Days 2–3",
                      title: "Contacts are identified and outreach is prepared",
                      body: "We find the recruiter or talent partner at each company. Your outreach message is ready to send — warm, specific, human.",
                      status: "upcoming",
                      color: "#2563eb",
                    },
                    {
                      day: "Day 5+",
                      title: "You start having real conversations",
                      body: "Work your pipeline daily. Move companies through stages. The system gets more targeted the more you use it.",
                      status: "upcoming",
                      color: "#1d4ed8",
                    },
                  ].map((step, i) => (
                    <div key={i} className="flex gap-4 px-6 py-4">
                      <div className="flex flex-col items-center gap-1 flex-shrink-0 pt-0.5">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                          style={{ background: step.status === "upcoming" ? "#e2e8f0" : step.color }}
                        >
                          <span style={{ color: step.status === "upcoming" ? "#94a3b8" : "white" }}>
                            {i + 1}
                          </span>
                        </div>
                        {i < 3 && (
                          <div className="w-px flex-1 min-h-[16px]" style={{ background: "#e2e8f0" }} />
                        )}
                      </div>
                      <div className="pb-4">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span
                            className="text-xs font-bold uppercase tracking-wide"
                            style={{ color: step.status === "upcoming" ? "#94a3b8" : step.color }}
                          >
                            {step.day}
                          </span>
                          {step.status === "current" && (
                            <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-full px-2 py-0.5 font-medium">
                              You are here
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-0.5">{step.title}</p>
                        <p className="text-xs text-slate-500 leading-relaxed">{step.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    Go to <button onClick={() => setActiveTab("settings")} className="text-indigo-600 font-medium underline">Settings</button> to upload your resume and start the clock.
                  </p>
                  <span className="text-xs text-slate-400">Pipeline auto-runs daily at 8am EST</span>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 shadow-sm">
              <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
                <div className="relative flex-1 min-w-[140px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search company, role, contact..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-9 text-sm border-slate-200"
                  />
                </div>
                <Select
                  value={stageFilter}
                  onValueChange={(v) => setStageFilter(v as PipelineStage | "All")}
                >
                  <SelectTrigger className="h-9 w-[140px] text-sm border-slate-200">
                    <SelectValue placeholder="All Stages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Stages</SelectItem>
                    {stageOrder.filter(s => s && s.trim()).map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={categoryFilter}
                  onValueChange={(v) => setCategoryFilter(v as CompanyCategory | "All")}
                >
                  <SelectTrigger className="h-9 w-[180px] text-sm border-slate-200">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Categories</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={priorityFilter}
                  onValueChange={(v) => setPriorityFilter(v as "High" | "Medium" | "Low" | "All")}
                >
                  <SelectTrigger className="h-9 w-[130px] text-sm border-slate-200">
                    <SelectValue placeholder="All Priorities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Priorities</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Low">Low</SelectItem>
                  </SelectContent>
                </Select>
                {(search || stageFilter !== "All" || categoryFilter !== "All" || priorityFilter !== "All") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 text-slate-500 hover:text-slate-900"
                    onClick={() => {
                      setSearch("");
                      setStageFilter("All");
                      setCategoryFilter("All");
                      setPriorityFilter("All");
                    }}
                  >
                    <X className="w-3.5 h-3.5 mr-1" />
                    Clear
                  </Button>
                )}
                <span className="ml-auto text-xs text-slate-500">
                  {filtered.length} of {pipelineData.length} companies
                </span>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      {[
                        { label: "#", field: null, w: "w-10" },
                        { label: "Company", field: "name" as SortField, w: "w-40" },
                        { label: "Category", field: "category" as SortField, w: "w-44", hide: "hidden sm:table-cell" },
                        { label: "Role", field: "role" as SortField, w: "w-56", hide: "" },
                        { label: "Stage", field: "stage" as SortField, w: "w-28", hide: "" },
                        { label: "Priority", field: "priority" as SortField, w: "w-24", hide: "hidden md:table-cell" },
                        { label: "Key Contact", field: null, w: "w-44", hide: "hidden lg:table-cell" },
                        { label: "Remote", field: null, w: "w-20", hide: "hidden lg:table-cell" },
                        { label: "Est. Comp.", field: null, w: "w-36", hide: "hidden xl:table-cell" },
                        { label: "Links", field: null, w: "w-24", hide: "hidden md:table-cell" },
                      ].map((col) => (
                        <th
                          key={col.label}
                          className={`${col.w} ${col.hide} px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap ${
                            col.field ? "cursor-pointer hover:text-slate-900 select-none" : ""
                          }`}
                          onClick={() => col.field && handleSort(col.field)}
                        >
                          <span className="flex items-center gap-1">
                            {col.label}
                            {col.field && <SortIcon field={col.field} />}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((company, idx) => (
                      <tr
                        key={company.id}
                        className="border-b border-slate-100 hover:bg-indigo-50/30 transition-colors cursor-pointer group"
                        onClick={() => setSelectedCompany(company)}
                      >
                        <td className="px-4 py-3 text-slate-400 text-xs font-mono">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors">
                            {company.name}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${
                              categoryColors[company.category as CompanyCategory] || "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {company.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700 max-w-[220px]">
                          <span className="line-clamp-2 text-xs leading-relaxed">{company.role}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                              stageColors[company.stage]
                            }`}
                          >
                            {company.stage}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                              priorityColors[company.priority]
                            }`}
                          >
                            {company.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <div className="text-xs">
                            <p className="font-medium text-slate-800">{company.contactName}</p>
                            <p className="text-slate-500 text-[11px] leading-tight mt-0.5 max-w-[160px] truncate">
                              {company.contactTitle}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          {company.remoteOk ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-medium">
                              <MapPin className="w-3 h-3" /> Remote
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">Onsite</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap hidden xl:table-cell">
                          {company.estSalary || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <a
                              href={company.jobLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-600 hover:text-indigo-800 transition-colors"
                              title="View Job Posting"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                            {company.contactLinkedIn && (
                              <a
                                href={company.contactLinkedIn}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 transition-colors"
                                title="Contact on LinkedIn"
                              >
                                <Linkedin className="w-4 h-4" />
                              </a>
                            )}
                            <button
                              title={coverLetterCompanyIds.has(String(company.id)) ? "Cover letter generated ✓" : "Generate cover letter"}
                              onClick={() => {
                                const rawDesc = (company as any).jobDescription || company.role || "";
                                const decoded = rawDesc
                                  .replace(/&lt;/g,"<").replace(/&gt;/g,">")
                                  .replace(/&amp;/g,"&").replace(/&quot;/g,'"')
                                  .replace(/&#39;/g,"'").replace(/&nbsp;/g," ")
                                  .replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().slice(0,3000);
                                setGeneratePrefill({
                                  companyName: (company as any).companyName || company.name,
                                  jobTitle: company.role || (company as any).jobTitle || "",
                                  jobDescription: decoded,
                                  contactName: company.contactName || "Hiring Manager",
                                  companyId: String(company.id),
                                });
                                setActiveTab("generate");
                              }}
                              className={`transition-colors ${
                                coverLetterCompanyIds.has(String(company.id))
                                  ? "text-emerald-500 hover:text-emerald-700"
                                  : "text-slate-300 hover:text-emerald-600"
                              }`}
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={10} className="px-4 py-12 text-center text-slate-400 text-sm">
                          No companies match your filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {activeTab === "analytics" && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pipeline Stage Distribution */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-1">Pipeline Stage Distribution</h3>
              <p className="text-xs text-slate-500 mb-5">Companies by current outreach stage</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stageChartData} barSize={36}>
                  <XAxis
                    dataKey="stage"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {stageChartData.map((_, i) => (
                      <Cell key={i} fill={STAGE_CHART_COLORS[i % STAGE_CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Priority Breakdown */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-1">Priority Breakdown</h3>
              <p className="text-xs text-slate-500 mb-5">Companies by outreach priority</p>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={priorityChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {priorityChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      fontSize: "12px",
                    }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => (
                      <span style={{ fontSize: "12px", color: "#475569" }}>{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Category Distribution */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm lg:col-span-2">
              <h3 className="text-sm font-bold text-slate-900 mb-1">Companies by Category</h3>
              <p className="text-xs text-slate-500 mb-5">Distribution across SaaS verticals</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={categoryChartData} layout="vertical" barSize={18}>
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                    width={160}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {categoryChartData.map((_, i) => (
                      <Cell key={i} fill={CATEGORY_CHART_COLORS[i % CATEGORY_CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Remote vs Onsite */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-1">Remote vs. Onsite</h3>
              <p className="text-xs text-slate-500 mb-5">Work location flexibility</p>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Remote OK", value: remoteCount, color: "#10b981" },
                      { name: "Onsite Required", value: Math.max(0, pipelineData.length - remoteCount), color: "#94a3b8" },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {[{ color: "#10b981" }, { color: "#94a3b8" }].map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      fontSize: "12px",
                    }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => (
                      <span style={{ fontSize: "12px", color: "#475569" }}>{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Top High Priority Companies */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-1">High Priority Targets</h3>
              <p className="text-xs text-slate-500 mb-4">Companies to contact first</p>
              <div className="space-y-2">
                {pipelineData
                  .filter((c) => c.priority === "High")
                  .map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                        <p className="text-[11px] text-slate-500">{c.category}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${
                            categoryColors[c.category as CompanyCategory] || "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {c.stage}
                        </span>
                        <a
                          href={c.jobLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-800"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
            </div>
          </>
        )}

        {activeTab === "generate" && (
          <GenerateApplication prefill={generatePrefill || undefined} />
        )}

        {activeTab === "history" && (
          <ApplicationHistory />
        )}

        {activeTab === "settings" && (
          <ResearchSettings
            onRunNow={() => {
              setActiveTab("pipeline");
              handleRunNow();
            }}
          />
        )}

        {activeTab === "pricing" && (
          <PricingPage
            trigger="upgrade_cta"
            onClose={() => setActiveTab("pipeline")}
          />
        )}
      </main>

      {/* Company Detail Modal */}
      <Dialog open={!!selectedCompany} onOpenChange={() => { setSelectedCompany(null); setConfirmRemoveId(null); }}>
        <DialogContent className="max-w-lg">
          {selectedCompany && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-slate-900">
                  <Building2 className="w-5 h-5 text-indigo-600" />
                  {selectedCompany.name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="flex flex-wrap gap-2">
                  <Badge
                    className={`${stageColors[selectedCompany.stage]} border text-xs`}
                    variant="outline"
                  >
                    {selectedCompany.stage}
                  </Badge>
                  <Badge
                    className={`${priorityColors[selectedCompany.priority]} border text-xs`}
                    variant="outline"
                  >
                    {selectedCompany.priority} Priority
                  </Badge>
                  <Badge
                    className={`${getCategoryColor(selectedCompany.category)} text-xs`}
                    variant="outline"
                  >
                    {selectedCompany.category}
                  </Badge>
                  {selectedCompany.remoteOk && (
                    <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs" variant="outline">
                      Remote OK
                    </Badge>
                  )}
                </div>

                <div className="bg-slate-50 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Target Role</p>
                  <p className="text-sm font-medium text-slate-900">{selectedCompany.role}</p>
                </div>

                <div className="bg-slate-50 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Key Contact</p>
                  <p className="text-sm font-medium text-slate-900">{selectedCompany.contactName}</p>
                  <p className="text-xs text-slate-500">{selectedCompany.contactTitle}</p>
                </div>

                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <DollarSign className="w-4 h-4 text-slate-400" />
                  <span>{selectedCompany.estSalary}</span>
                  <span className="text-slate-300">·</span>
                  <Users className="w-4 h-4 text-slate-400" />
                  <span>{selectedCompany.companySize} employees</span>
                </div>

                {/* Source warning for GPT-generated jobs */}
                {selectedCompany.notes?.includes("GPT Research") && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                    <span className="text-red-500 text-sm mt-0.5">⚠️</span>
                    <div>
                      <p className="text-xs font-semibold text-red-700">AI-generated listing — job link may not work</p>
                      <p className="text-xs text-red-600 mt-0.5">This job was generated by GPT as a fallback and may have an inaccurate URL. Dismiss it and run research again for real ATS listings.</p>
                    </div>
                  </div>
                )}

                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <StickyNote className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-800 leading-relaxed">{selectedCompany.notes}</p>
                  </div>
                </div>

                {/* Primary CTA — Generate Cover Letter */}
                <button
                  onClick={() => {
                    const rawDesc = (selectedCompany as any).jobDescription || selectedCompany.role || "";
                    const decoded = rawDesc
                      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
                      .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
                      .replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
                      .replace(/<[^>]*>/g, " ")
                      .replace(/\s+/g, " ").trim()
                      .slice(0, 3000);
                    setGeneratePrefill({
                      companyName: (selectedCompany as any).companyName || selectedCompany.name,
                      jobTitle: selectedCompany.role || (selectedCompany as any).jobTitle || "",
                      jobDescription: decoded,
                      contactName: selectedCompany.contactName || "Hiring Manager",
                      companyId: String(selectedCompany.id),
                    });
                    setSelectedCompany(null);
                    setActiveTab("generate");
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold h-10 px-4 rounded-lg transition-colors shadow-sm"
                >
                  <FileText className="w-4 h-4" />
                  {coverLetterCompanyIds.has(String(selectedCompany.id))
                    ? "✓ Cover Letter Generated — Edit or Re-download"
                    : "Generate Cover Letter"}
                </button>

                {/* Secondary actions */}
                <div className="flex gap-3 pt-1">
                  {selectedCompany.notes?.includes("GPT Research") ? (
                    <div className="flex-1">
                      <Button disabled className="w-full bg-slate-200 text-slate-400 text-sm h-9 gap-2 cursor-not-allowed">
                        <ExternalLink className="w-4 h-4" />
                        Job link unavailable
                      </Button>
                    </div>
                  ) : (
                    <a href={selectedCompany.jobLink} target="_blank" rel="noopener noreferrer" className="flex-1">
                      <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm h-9 gap-2">
                        <ExternalLink className="w-4 h-4" />
                        View Job Posting
                      </Button>
                    </a>
                  )}
                  <button
                    onClick={() => handleSendOutreach(selectedCompany)}
                    className="flex-1 flex items-center justify-center gap-2 border border-blue-200 text-blue-700 hover:bg-blue-50 text-sm font-medium h-9 px-3 rounded-md transition-colors"
                  >
                    <Linkedin className="w-4 h-4" />
                    Contact on LinkedIn
                  </button>
                </div>
              </div>
            </>
          )}
            {/* Action buttons — only show for Research stage */}
            {selectedCompany && (
              <div className="flex gap-3 pt-4 border-t border-slate-200 mt-4">
                {selectedCompany.stage === "Outreach" ? (
                  <>
                    <button
                      onClick={() => handleMarkApplied(selectedCompany)}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors"
                    >
                      ✓ Mark as Applied
                    </button>
                    <button
                      onClick={() => setSelectedCompany(null)}
                      className="px-4 py-2.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg transition-colors"
                    >
                      Close
                    </button>
                  </>
                ) : selectedCompany.stage === "Research" ? (
                  <>
                    <button
                      onClick={() => handleAddToPipeline(selectedCompany)}
                      disabled={updateStage.isPending}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {updateStage.isPending ? "Adding..." : "✓ Add to Pipeline"}
                    </button>

                    {/* Dismiss / Remove flow */}
                    {confirmRemoveId === selectedCompany.id ? (
                      // Confirmation state — show Remove and Cancel
                      <div className="flex gap-2 flex-1">
                        <button
                          onClick={() => handleRemove(selectedCompany)}
                          disabled={deleteCompany.isPending}
                          className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {deleteCompany.isPending ? "Removing..." : "🗑 Remove permanently"}
                        </button>
                        <button
                          onClick={() => setConfirmRemoveId(null)}
                          className="px-4 py-2.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      // Default state — show Dismiss button with Remove option
                      <div className="flex gap-2 flex-1">
                        <button
                          onClick={() => handleDismiss(selectedCompany)}
                          disabled={updateStage.isPending}
                          className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50"
                        >
                          ✕ Dismiss
                        </button>
                        <button
                          onClick={() => setConfirmRemoveId(selectedCompany.id as number)}
                          className="px-3 py-2.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg transition-colors"
                          title="Permanently remove this job"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </>
                ) : selectedCompany.stage === "Dismissed" ? (
                  // Dismissed — show restore and remove options
                  <>
                    <button
                      onClick={async () => {
                        await updateStage.mutateAsync({ id: selectedCompany.id as number, stage: "Research" });
                        await utils.pipeline.getCompanies.invalidate();
                        toast.success(`${(selectedCompany as any).companyName || selectedCompany.name} restored to Research`);
                        setSelectedCompany(null);
                      }}
                      disabled={updateStage.isPending}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50"
                    >
                      ↩ Restore to Research
                    </button>
                    {confirmRemoveId === selectedCompany.id ? (
                      <div className="flex gap-2 flex-1">
                        <button
                          onClick={() => handleRemove(selectedCompany)}
                          disabled={deleteCompany.isPending}
                          className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {deleteCompany.isPending ? "Removing..." : "🗑 Confirm Remove"}
                        </button>
                        <button
                          onClick={() => setConfirmRemoveId(null)}
                          className="px-4 py-2.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmRemoveId(selectedCompany.id as number)}
                        className="px-4 py-2.5 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-lg transition-colors"
                      >
                        🗑 Remove
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex gap-2 flex-wrap items-center">
                    {["Outreach", "Applied", "Interviewing", "Offer", "Rejected"].map((s) => (
                      <button
                        key={s}
                        onClick={async () => {
                          await updateStage.mutateAsync({ id: selectedCompany.id as number, stage: s });
                          await utils.pipeline.getCompanies.invalidate();
                          toast.success(`Moved to ${s}`);
                          setSelectedCompany(null);
                        }}
                        disabled={selectedCompany.stage === s || updateStage.isPending}
                        className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                          selectedCompany.stage === s
                            ? "bg-indigo-100 text-indigo-700 cursor-default"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                    {/* Dismiss from any active stage */}
                    <button
                      onClick={() => handleDismiss(selectedCompany)}
                      disabled={updateStage.isPending}
                      className="text-xs px-3 py-1.5 rounded-full font-medium text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors border border-dashed border-slate-200"
                    >
                      ✕ Dismiss
                    </button>
                  </div>
                )}
              </div>
            )}
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="border-t border-slate-200 mt-12 py-6">
        <div className="max-w-screen-xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-slate-400">
            My Personal · Job Search Pipeline · Powered by AI · May 2026
          </p>
          <div className="flex items-center gap-4">
            <p className="text-xs text-slate-400">
              30 companies · 30 key contacts · All roles verified active
            </p>
            <a href="/privacy" className="text-xs text-indigo-600 hover:text-indigo-800 transition-colors">
              Privacy Policy
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
