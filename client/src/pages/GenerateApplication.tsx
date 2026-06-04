import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { FileText, Download, Copy, Loader2, Sparkles, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface GenerateApplicationProps {
  // If provided, pre-fills the form for a specific job
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
  const [isDownloading, setIsDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<"form" | "generated">("form");

  const generateMutation = trpc.application.generate.useMutation();
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
        companyId: prefill?.companyId || companyName.toLowerCase().replace(/\s+/g, "-"),
      });

      setCoverLetter(result.coverLetter);
      setApplicationId(result.applicationId);
      setStep("generated");
      toast.success("Cover letter generated");
    } catch (err: any) {
      console.error("Generation failed:", err);
      toast.error(err.message || "Failed to generate — please try again");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!applicationId) return;
    setIsDownloading(true);
    try {
      const token = localStorage.getItem("reviveiq_auth_token");
      const res = await fetch(`/api/applications/${applicationId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Download failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cover-letter-${companyName.toLowerCase().replace(/\s+/g, "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Cover letter downloaded");
    } catch (err) {
      // Fallback — generate PDF client-side from text
      downloadAsText();
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadAsText = () => {
    const blob = new Blob([coverLetter], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cover-letter-${companyName.toLowerCase().replace(/\s+/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Cover letter downloaded as text file");
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(coverLetter);
    setCopied(true);
    toast.success("Copied to clipboard — ready to paste into Easy Apply");
    setTimeout(() => setCopied(false), 2500);
  };

  const handleReset = () => {
    if (!prefill) {
      setCompanyName("");
      setJobTitle("");
      setJobDescription("");
      setContactName("Hiring Manager");
    }
    setCoverLetter("");
    setApplicationId(null);
    setStep("form");
  };

  // ── FORM VIEW ──────────────────────────────────────────────────────────────
  if (step === "form") {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
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
                  <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-medium">
                    {companyName}
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      placeholder="e.g. HubSpot"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      list="company-list"
                    />
                    <datalist id="company-list">
                      {pipelineCompanies.map((c: any) => (
                        <option key={c.id} value={c.companyName || c.name} />
                      ))}
                    </datalist>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Job Title</label>
                {prefill ? (
                  <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-medium">
                    {jobTitle}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={jobTitle}
                    onChange={e => setJobTitle(e.target.value)}
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
              <input
                type="text"
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                placeholder="Hiring Manager"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Job Description <span className="font-normal text-slate-400">(optional but improves quality)</span>
              </label>
              <textarea
                value={jobDescription}
                onChange={e => setJobDescription(e.target.value)}
                placeholder="Paste the job description here for a more tailored cover letter..."
                rows={5}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !companyName || !jobTitle}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-11 gap-2"
            >
              {isGenerating ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generating your cover letter...</>
              ) : (
                <><Sparkles className="w-4 h-4" /> Generate Cover Letter</>
              )}
            </Button>

            {isGenerating && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                  <p className="text-sm text-indigo-700">Reading your resume, extracting your career story...</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* What it does */}
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
      </div>
    );
  }

  // ── GENERATED VIEW ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
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
        <p className="text-xs text-slate-500 ml-7">Review and edit below, then download or copy</p>
      </div>

      {/* Cover letter editor */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Cover Letter</span>
          <span className="text-xs text-slate-400">{coverLetter.split(/\s+/).filter(Boolean).length} words</span>
        </div>
        <textarea
          value={coverLetter}
          onChange={e => setCoverLetter(e.target.value)}
          className="w-full px-6 py-5 text-sm text-slate-700 leading-relaxed resize-none focus:outline-none font-serif"
          rows={22}
          style={{ fontFamily: "'Georgia', serif", lineHeight: "1.8" }}
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button
          onClick={handleDownloadPDF}
          disabled={isDownloading}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white h-11 gap-2"
        >
          {isDownloading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Download PDF
        </Button>

        <Button
          onClick={handleCopy}
          variant="outline"
          className="flex-1 h-11 gap-2 border-slate-200"
        >
          {copied ? (
            <><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Copied!</>
          ) : (
            <><Copy className="w-4 h-4" /> Copy Text</>
          )}
        </Button>

        <Button
          onClick={handleReset}
          variant="outline"
          className="h-11 gap-2 border-slate-200 px-4"
          title="Generate another"
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      <p className="text-xs text-center text-slate-400">
        Tip: Use <strong>Copy Text</strong> to paste directly into LinkedIn Easy Apply or job portal text fields
      </p>
    </div>
  );
}
