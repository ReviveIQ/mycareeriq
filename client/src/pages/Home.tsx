// Design Philosophy: "Territory Map" — Clean Professional Light Dashboard
// DM Sans (headers) + Inter (body), off-white background, deep indigo accent
// CRM-like interface with status badges, filter chips, and sortable columns

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { stageColors, priorityColors, categoryColors, stageOrder, exportToCSV, type PipelineStage, type Company, type CompanyCategory } from "@/lib/pipelineData";
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
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { useLocation } from "wouter";

type SortField = "name" | "category" | "stage" | "priority" | "role";
type SortDir = "asc" | "desc";

const STAGE_CHART_COLORS = ["#94a3b8", "#f59e0b", "#6366f1", "#8b5cf6", "#10b981", "#ef4444"];
const CATEGORY_CHART_COLORS = ["#6366f1", "#8b5cf6", "#14b8a6", "#ec4899", "#f97316", "#06b6d4", "#0ea5e9", "#84cc16", "#10b981", "#f43f5e"];

export default function Home() {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<PipelineStage | "All">("All");
  const [categoryFilter, setCategoryFilter] = useState<CompanyCategory | "All">("All");
  const [priorityFilter, setPriorityFilter] = useState<"High" | "Medium" | "Low" | "All">("All");
  const [sortField, setSortField] = useState<SortField>("priority");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [activeTab, setActiveTab] = useState<"pipeline" | "analytics" | "generate" | "history" | "settings">("pipeline");
  const [isRunning, setIsRunning] = useState(false);
  const [, navigate] = useLocation();

  // Fetch pipeline data from tRPC
  const { data: pipelineData = [], isLoading } = trpc.pipeline.getCompanies.useQuery();
  const { data: companyCount = 0 } = trpc.pipeline.getCompanyCount.useQuery();
  const { data: highPriorityCount = 0 } = trpc.pipeline.getHighPriority.useQuery();
  const { data: remoteCount = 0 } = trpc.pipeline.getRemoteCount.useQuery();
  const runResearch = trpc.monitoring.runNow.useMutation();
  const updateStage = trpc.pipeline.updateStage.useMutation();
  const deleteCompany = trpc.pipeline.deleteCompany.useMutation();

  const handleAddToPipeline = async (company: Company) => {
    if (!company.id) return;
    await updateStage.mutateAsync({ id: company.id as number, stage: "Outreach" });
    await utils.pipeline.getCompanies.invalidate();
    toast.success(`${company.name} added to pipeline — ready for outreach`);
    setSelectedCompany(null);
  };

  const handleDismiss = async (company: Company) => {
    if (!company.id) return;
    await deleteCompany.mutateAsync({ id: company.id as number });
    await utils.pipeline.getCompanies.invalidate();
    await utils.pipeline.getCompanyCount.invalidate();
    toast.success(`${company.name} dismissed`);
    setSelectedCompany(null);
  };
  const utils = trpc.useUtils();

  const categories = useMemo(() => {
    const cats = Array.from(new Set(pipelineData.map((c) => c.category)));
    return cats.sort();
  }, [pipelineData]);

  const filtered = useMemo(() => {
    let data = [...pipelineData];
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.role.toLowerCase().includes(q) ||
          c.contactName.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q)
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
  }, [search, stageFilter, categoryFilter, priorityFilter, sortField, sortDir]);

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
      await runResearch.mutateAsync();
      toast.success("Job research started — your pipeline will update in 20-30 seconds");

      // Poll every 5 seconds for 60 seconds to catch when results arrive
      let polls = 0;
      const poll = setInterval(async () => {
        polls++;
        await utils.pipeline.getCompanies.invalidate();
        await utils.pipeline.getCompanyCount.invalidate();
        await utils.pipeline.getHighPriority.invalidate();
        await utils.pipeline.getRemoteCount.invalidate();
        if (polls >= 12) {
          clearInterval(poll);
          setIsRunning(false);
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
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width:"34px",height:"34px",flexShrink:0}}>
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
              <h1 className="text-[15px] leading-tight tracking-tight" style={{fontFamily:"'Syne',sans-serif",fontWeight:800}}>
                <span style={{color:"#0f172a"}}>MyCareer</span><span style={{color:"#2563eb"}}>IQ</span>
                <span style={{color:"#64748b",fontWeight:500,fontSize:"13px"}}> — Job Search Pipeline</span>
              </h1>
              <p className="text-xs leading-tight" style={{color:"#64748b",fontFamily:"'DM Sans',sans-serif"}}>
                by ReviveIQI · AI-Powered · Track & Apply
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
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
            <Button
              onClick={handleRunNow}
              disabled={isRunning}
              size="sm"
              className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            >
              {isRunning ? (
                <>
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  Run Now
                </>
              )}
            </Button>
            <Button
              onClick={() => exportToCSV(filtered)}
              variant="outline"
              size="sm"
              className="h-8 text-xs border-slate-200 text-slate-700 hover:bg-slate-50 gap-1.5"
            >
              <FileDown className="w-3.5 h-3.5" />
              Export CSV
            </Button>
            <span className="text-xs text-slate-500 hidden sm:block">Updated May 2026</span>
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-6 py-6 space-y-6">
        <h2 className="text-2xl font-bold text-slate-900 mb-4">Pipeline Overview</h2>
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            {
              icon: <Building2 className="w-4 h-4 text-indigo-600" />,
              label: "Total Prospects",
              value: String(companyCount),
              sub: "Companies in pipeline",
              bg: "bg-indigo-50",
            },
            {
              icon: <Target className="w-4 h-4 text-rose-600" />,
              label: "High Priority",
              value: String(pipelineData.filter((c) => c.priority === "High").length),
              sub: "Immediate outreach targets",
              bg: "bg-rose-50",
            },
            {
              icon: <TrendingUp className="w-4 h-4 text-emerald-600" />,
              label: "Remote Roles",
              value: String(remoteCount),
              sub: `${remoteCount} of 30 are remote-friendly`,
              bg: "bg-emerald-50",
            },
            {
              icon: <Users className="w-4 h-4 text-amber-600" />,
              label: "Key Contacts",
              value: String(companyCount),
              sub: "VPs & Directors identified",
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
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
          {(["pipeline", "analytics", "generate", "history", "settings"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
                activeTab === tab
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab === "pipeline" && "Pipeline Table"}
              {tab === "analytics" && "Analytics"}
              {tab === "generate" && (
                <>
                  <FileText className="w-4 h-4" />
                  Generate
                </>
              )}
              {tab === "history" && "History"}
              {tab === "settings" && (
                <>
                  <Settings className="w-4 h-4" />
                  Settings
                </>
              )}
            </button>
          ))}
        </div>

        {activeTab === "pipeline" && (
          <>
            {/* Filters */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[200px]">
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
                    {stageOrder.map((s) => (
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
                        { label: "Category", field: "category" as SortField, w: "w-44" },
                        { label: "Role", field: "role" as SortField, w: "w-56" },
                        { label: "Stage", field: "stage" as SortField, w: "w-28" },
                        { label: "Priority", field: "priority" as SortField, w: "w-24" },
                        { label: "Key Contact", field: null, w: "w-44" },
                        { label: "Remote", field: null, w: "w-20" },
                        { label: "Est. Comp.", field: null, w: "w-36" },
                        { label: "Links", field: null, w: "w-24" },
                      ].map((col) => (
                        <th
                          key={col.label}
                          className={`${col.w} px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap ${
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
                        <td className="px-4 py-3">
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
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                              priorityColors[company.priority]
                            }`}
                          >
                            {company.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs">
                            <p className="font-medium text-slate-800">{company.contactName}</p>
                            <p className="text-slate-500 text-[11px] leading-tight mt-0.5 max-w-[160px] truncate">
                              {company.contactTitle}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {company.remoteOk ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-medium">
                              <MapPin className="w-3 h-3" /> Remote
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">Onsite</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                          {company.estSalary}
                        </td>
                        <td className="px-4 py-3">
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
                      { name: "Onsite Required", value: 30 - remoteCount, color: "#94a3b8" },
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
          <GenerateApplication />
        )}

        {activeTab === "history" && (
          <ApplicationHistory />
        )}

        {activeTab === "settings" && <ResearchSettings />}
      </main>

      {/* Company Detail Modal */}
      <Dialog open={!!selectedCompany} onOpenChange={() => setSelectedCompany(null)}>
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
                    className={`${categoryColors[selectedCompany.category]} text-xs`}
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

                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <StickyNote className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-800 leading-relaxed">{selectedCompany.notes}</p>
                  </div>
                </div>

                <div className="flex gap-3 pt-1">
                  <a
                    href={selectedCompany.jobLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1"
                  >
                    <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm h-9 gap-2">
                      <ExternalLink className="w-4 h-4" />
                      View Job Posting
                    </Button>
                  </a>
                  <a
                    href={selectedCompany.contactLinkedIn}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1"
                  >
                    <Button
                      variant="outline"
                      className="w-full border-blue-200 text-blue-700 hover:bg-blue-50 text-sm h-9 gap-2"
                    >
                      <Linkedin className="w-4 h-4" />
                      Contact on LinkedIn
                    </Button>
                  </a>
                </div>
              </div>
            </>
          )}
            {/* Action buttons — only show for Research stage */}
            {selectedCompany && (
              <div className="flex gap-3 pt-4 border-t border-slate-200 mt-4">
                {selectedCompany.stage === "Research" ? (
                  <>
                    <button
                      onClick={() => handleAddToPipeline(selectedCompany)}
                      disabled={updateStage.isPending}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {updateStage.isPending ? "Adding..." : "✓ Add to Pipeline"}
                    </button>
                    <button
                      onClick={() => handleDismiss(selectedCompany)}
                      disabled={deleteCompany.isPending}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {deleteCompany.isPending ? "Removing..." : "✕ Dismiss"}
                    </button>
                  </>
                ) : (
                  <div className="flex gap-2 flex-wrap">
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
