import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { FileText, Download, Copy, Loader2, Sparkles, CheckCircle2, RefreshCw, Clock, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface GenerateApplicationProps {
  prefill?: {
    companyName: string;
    jobTitle: string;
    jobDescription: string;
    contactName?: string;
    companyId: string;
  };
}

export default function GenerateApplication({ prefill }: GenerateApplicationProps = {}) {
  const [companyName, setCompanyName] = useState(prefill?.companyName || "");
  const [jobTitle, setJobTitle] = useState(prefill?.jobTitle || "");
  const [jobDescription, setJobDescription] = useState(prefill?.jobDescription || "");
  const [contactName, setContactName] = useState(prefill?.contactName || "Hiring Manager");
  const [coverLetter, setCoverLetter] = useState("");
  const [applicationId, setApplicationId] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState<number | "current" | null>(null);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<"form" | "generated">("form");
  const [activeView, setActiveView] = useState<"generate" | "history">("generate");
  const [scores, setScores] = useState<{ authenticity: number; relevance: number; readability: number } | null>(null);
  const [mode, setMode] = useState<string>("");
  const [isImproving, setIsImproving] = useState(false);

  const generateMutation = trpc.application.generate.useMutation();
  const utils = trpc.useUtils();
  const { data: history = [], refetch: refetchHistory } = trpc.application.list.useQuery();
  const { data: pipelineCompanies = [] } = trpc.pipeline.getCompanies.useQuery();

  const handleGenerate = async () => {
    if (!companyName || !jobTitle) {
      toast.error("Company name and job title are required");
      return;
    }
    setIsGenerating(true);
    try {
      const result = await generateMutation.mutateAsync({
        companyName,
        jobTitle,
        jobDescription: jobDescription || jobTitle,
        contactName: contactName || "Hiring Manager",
        contactEmail: "",
        companyId: prefill?.companyId || `${companyName.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
      });
      setCoverLetter(result.coverLetter);
      setApplicationId(result.applicationId);
      setScores(result.scores || null);
      setMode(result.mode || "");
      setStep("generated");
      refetchHistory();
      utils.pipeline.getCompanies.invalidate();
      if (result.addedToPipeline) {
        toast.success(`Cover letter generated — ${companyName} added to your pipeline`);
      } else {
        toast.success("Cover letter generated");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to generate — please try again");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async (appId: number | "current", companyLabel: string) => {
    const id = appId === "current" ? applicationId : appId;
    if (!id) return;
    setIsDownloading(appId);
    try {
      const token = localStorage.getItem("reviveiq_auth_token");
      const res = await fetch(`/api/applications/${id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cover-letter-${companyLabel.toLowerCase().replace(/\s+/g, "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Downloaded");
    } catch {
      // Fallback to text download from history
      const app = (history as any[]).find((a: any) => a.id === id);
      if (app?.coverLetter) {
        const blob = new Blob([app.coverLetter], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `cover-letter-${companyLabel.toLowerCase().replace(/\s+/g, "-")}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Downloaded as text file");
      }
    } finally {
      setIsDownloading(null);
    }
  };

  const handleCopy = async (text?: string) => {
    await navigator.clipboard.writeText(text || coverLetter);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2500);
  };

  const handleReset = () => {
    if (!prefill) {
      setCompanyName(""); setJobTitle(""); setJobDescription(""); setContactName("Hiring Manager");
    }
    setCoverLetter(""); setApplicationId(null); setStep("form"); setScores(null); setMode("");
  };

  const handleImprove = async () => {
    if (!companyName || !jobTitle) return;
    setIsImproving(true);
    try {
      const result = await generateMutation.mutateAsync({
        companyName,
        jobTitle,
        jobDescription: jobDescription || jobTitle,
        contactName: contactName || "Hiring Manager",
        contactEmail: "",
        companyId: prefill?.companyId || `${companyName.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
      });
      setCoverLetter(result.coverLetter);
      setScores(result.scores || null);
      setMode(result.mode || "");
      refetchHistory();
      toast.success("Cover letter regenerated");
    } catch {
      toast.error("Regeneration failed — please try again");
    } finally {
      setIsImproving(false);
    }
  };

  const formatDate = (d: any) => {
    if (!d) return "";
    const date = new Date(d);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">

      {/* View toggle */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveView("generate")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
            activeView === "generate" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" /> Generate
        </button>
        <button
          onClick={() => { setActiveView("history"); refetchHistory(); }}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
            activeView === "history" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          History
          {(history as any[]).length > 0 && (
            <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {(history as any[]).length}
            </span>
          )}
        </button>
      </div>

      {/* ── HISTORY VIEW ─────────────────────────────────────────────────── */}
      {activeView === "history" && (
        <div className="space-y-3">
          {(history as any[]).length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 font-medium">No cover letters yet</p>
              <p className="text-slate-400 text-sm mt-1">Generated cover letters will appear here</p>
              <button
                onClick={() => setActiveView("generate")}
                className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Generate your first
              </button>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500 px-1">{(history as any[]).length} cover letter{(history as any[]).length !== 1 ? "s" : ""} saved</p>
              {[...(history as any[])].reverse().map((app: any) => (
                <div key={app.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 text-sm truncate">{app.companyName}</p>
                        <p className="text-xs text-slate-500 truncate">{app.jobTitle} · {formatDate(app.createdAt)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <button
                        onClick={() => handleCopy(app.coverLetter)}
                        className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                        title="Copy text"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDownload(app.id, app.companyName)}
                        disabled={isDownloading === app.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isDownloading === app.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        PDF
                      </button>
                      <button
                        onClick={() => {
                          setCoverLetter(app.coverLetter);
                          setApplicationId(app.id);
                          setCompanyName(app.companyName);
                          setJobTitle(app.jobTitle || "");
                          setStep("generated");
                          setActiveView("generate");
                        }}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Open and edit"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Preview first 2 lines */}
                  {app.coverLetter && (
                    <div className="px-5 pb-4">
                      <p className="text-xs text-slate-400 leading-relaxed line-clamp-2 font-serif">
                        {app.coverLetter.split("\n").filter((l: string) => l.trim()).slice(3, 5).join(" ")}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── GENERATE VIEW ────────────────────────────────────────────────── */}
      {activeView === "generate" && step === "form" && (
        <>
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Generate Cover Letter</h2>
                <p className="text-sm text-slate-500">AI-written from your resume, tailored to the role</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Company</label>
                  {prefill ? (
                    <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-medium">{companyName}</div>
                  ) : (
                    <div>
                      <input
                        type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
                        placeholder="e.g. HubSpot" list="company-list"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                      <datalist id="company-list">
                        {(pipelineCompanies as any[]).map((c: any) => (
                          <option key={c.id} value={c.companyName || c.name} />
                        ))}
                      </datalist>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Job Title</label>
                  {prefill ? (
                    <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-medium">{jobTitle}</div>
                  ) : (
                    <input type="text" value={jobTitle} onChange={e => setJobTitle(e.target.value)}
                      placeholder="e.g. Enterprise Account Executive"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Hiring Manager <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input type="text" value={contactName} onChange={e => setContactName(e.target.value)}
                  placeholder="Hiring Manager"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Job Description <span className="font-normal text-slate-400">(optional but improves quality)</span>
                </label>
                <textarea value={jobDescription} onChange={e => setJobDescription(e.target.value)}
                  placeholder="Paste the job description here for a more tailored cover letter..."
                  rows={5} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                />
              </div>

              <Button onClick={handleGenerate} disabled={isGenerating || !companyName || !jobTitle}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-11 gap-2">
                {isGenerating
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating your cover letter...</>
                  : <><Sparkles className="w-4 h-4" /> Generate Cover Letter</>
                }
              </Button>

              {isGenerating && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      {[0,1,2].map(i => (
                        <div key={i} className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                    <p className="text-sm text-indigo-700">Reading your resume, extracting your career story...</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: "📄", title: "Resume-driven", body: "Pulls from your actual experience — not a template" },
              { icon: "🎯", title: "Role-matched", body: "Aligns your background to what this company needs" },
              { icon: "✏️", title: "Fully editable", body: "Review and adjust before downloading" },
            ].map(item => (
              <div key={item.title} className="bg-white rounded-lg border border-slate-200 p-4 text-center">
                <div className="text-2xl mb-2">{item.icon}</div>
                <p className="text-xs font-semibold text-slate-800 mb-1">{item.title}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── GENERATED VIEW ───────────────────────────────────────────────── */}
      {activeView === "generate" && step === "generated" && (
        <div className="space-y-4">
          {/* Header with scores */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <h2 className="text-base font-bold text-slate-900">Cover Letter Ready</h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-medium text-slate-700">{companyName}</span>
                <span>·</span>
                <span>{jobTitle}</span>
              </div>
            </div>

            {/* Mode chip + Score badges */}
            <div className="flex items-center gap-2 flex-wrap">
              {mode && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full border border-indigo-100">
                  ✦ {mode.replace(/_/g, " ")}
                </span>
              )}
              {scores && (
                <>
                  {[
                    { label: "Authentic", value: scores.authenticity },
                    { label: "Relevant", value: scores.relevance },
                    { label: "Readable", value: scores.readability },
                  ].map(s => (
                    <span key={s.label} className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full border ${
                      s.value >= 8 ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                      : s.value >= 6 ? "bg-amber-50 text-amber-700 border-amber-100"
                      : "bg-red-50 text-red-700 border-red-100"
                    }`}>
                      {s.label} {s.value}/10
                    </span>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Editable letter */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Cover Letter</span>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium ${
                  coverLetter.split(/\s+/).filter(Boolean).length < 250 ? "text-amber-500"
                  : coverLetter.split(/\s+/).filter(Boolean).length > 350 ? "text-amber-500"
                  : "text-emerald-600"
                }`}>
                  {coverLetter.split(/\s+/).filter(Boolean).length} words
                  <span className="text-slate-400 font-normal ml-1">(target 250–350)</span>
                </span>
              </div>
            </div>
            <textarea value={coverLetter} onChange={e => setCoverLetter(e.target.value)}
              className="w-full px-6 py-5 text-sm text-slate-700 leading-relaxed resize-none focus:outline-none"
              rows={22} style={{ fontFamily: "'Georgia', serif", lineHeight: "1.8" }}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button onClick={() => handleDownload("current", companyName)}
              disabled={isDownloading === "current"}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white h-11 gap-2">
              {isDownloading === "current" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Download PDF
            </Button>
            <Button onClick={() => handleCopy()} variant="outline" className="flex-1 h-11 gap-2 border-slate-200">
              {copied ? <><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy Text</>}
            </Button>
            <Button onClick={handleImprove} variant="outline" disabled={isImproving}
              className="h-11 gap-2 border-slate-200 px-4 text-indigo-600 hover:text-indigo-700 hover:border-indigo-200" title="Regenerate">
              {isImproving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
            <Button onClick={handleReset} variant="outline" className="h-11 gap-2 border-slate-200 px-4" title="Start over">
              <Sparkles className="w-4 h-4" />
            </Button>
          </div>

          <button onClick={() => setActiveView("history")}
            className="w-full text-xs text-slate-400 hover:text-indigo-600 text-center py-1 transition-colors">
            View all saved cover letters →
          </button>
        </div>
      )}
    </div>
  );
}
