/**
 * DocumentIntake — reusable document parser component.
 *
 * Drag & drop a PDF/DOCX, send it to `documentIntake.parse`, then optionally
 * apply the extracted data to research config via `documentIntake.applyToConfig`.
 *
 * The component is intentionally generic so it can be reused for any document
 * type (resume, prospect brief, company overview, etc.) — pass `documentType`
 * and `title` props to customize.
 */
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";

const SUPPORTED_MIMES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"];
const SUPPORTED_LABEL = "PDF";

export interface DocumentIntakeProps {
  /**
   * The document type identifier sent to the backend (e.g., "resume",
   * "prospect_brief", "company_overview"). Defaults to "resume".
   */
  documentType?: string;

  /** Card title shown to the user. */
  title?: string;

  /** Subtitle / helper copy. */
  description?: string;

  /**
   * Whether to show the "Apply to Pipeline Settings" button. Defaults to true
   * for resumes; can be set false when reusing the component for documents that
   * don't feed pipeline config.
   */
  showApplyToPipeline?: boolean;

  /** Optional workspace context (passed through to the backend). */
  workspaceId?: number;

  /** Optional callback invoked after a successful parse. */
  onParsed?: (extracted: Record<string, unknown>) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read file"));
        return;
      }
      // Strip data URL prefix; the backend handles either form anyway.
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("File read error"));
    reader.readAsDataURL(file);
  });
}

export function DocumentIntake({
  documentType = "resume",
  title = "Upload Resume",
  description = "Drag & drop your resume to auto-configure your pipeline.",
  showApplyToPipeline = true,
  workspaceId,
  onParsed,
}: DocumentIntakeProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [extracted, setExtracted] = useState<Record<string, unknown> | null>(null);
  const [resumeScore, setResumeScore] = useState<any>(null);
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [targetIndustries, setTargetIndustries] = useState<string[]>([]);
  const [newRole, setNewRole] = useState("");
  const [newIndustry, setNewIndustry] = useState("");
  const [analyzingStage, setAnalyzingStage] = useState(0);

  // Analyzing stage labels — shown sequentially during processing
  const ANALYZING_STAGES = [
    "Reading your resume...",
    "Analyzing career progression...",
    "Extracting measurable achievements...",
    "Scoring ATS compatibility...",
    "Identifying keyword gaps...",
    "Building your target role profile...",
  ];

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const parseMutation = trpc.documentIntake.parse.useMutation();
  const applyMutation = trpc.documentIntake.applyToConfig.useMutation();
  const utils = trpc.useUtils();

  const isAnalyzing = parseMutation.isPending;
  const isApplying = applyMutation.isPending;

  // Cycle through analyzing stages while processing
  useEffect(() => {
    if (isAnalyzing) {
      setAnalyzingStage(0);
      stageIntervalRef.current = setInterval(() => {
        setAnalyzingStage(prev => Math.min(prev + 1, ANALYZING_STAGES.length - 1));
      }, 1800);
    } else {
      if (stageIntervalRef.current) {
        clearInterval(stageIntervalRef.current);
        stageIntervalRef.current = null;
      }
    }
    return () => {
      if (stageIntervalRef.current) clearInterval(stageIntervalRef.current);
    };
  }, [isAnalyzing]);

  // ---- Drag & drop handlers ----
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const validateAndSetFile = (selected: File) => {
    if (!SUPPORTED_MIMES.includes(selected.type)) {
      // Some browsers report an empty MIME; fall back to extension check.
      const lower = selected.name.toLowerCase();
      if (!lower.endsWith(".pdf") && !lower.endsWith(".docx") && !lower.endsWith(".doc")) {
        toast.error(`Unsupported file type. Please upload a ${SUPPORTED_LABEL}.`);
        return;
      }
    }
    setFile(selected);
    setExtracted(null);
    setTargetRoles([]);
    setTargetIndustries([]);
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const dropped = e.dataTransfer.files?.[0];
      if (dropped) validateAndSetFile(dropped);
    },
    [],
  );

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) validateAndSetFile(selected);
  };

  const clearFile = () => {
    setFile(null);
    setExtracted(null);
    setResumeScore(null);
    setTargetRoles([]);
    setTargetIndustries([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ---- Analyze ----
  const handleAnalyze = async () => {
    if (!file) return;
    try {
      const base64 = await readFileAsBase64(file);
      const mimeType = file.type || (file.name.endsWith(".docx") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf");

      const result = await parseMutation.mutateAsync({
        fileBase64: base64,
        fileName: file.name,
        mimeType,
        documentType,
      });

      setExtracted(result.extracted);

      // Capture resume score if returned
      if ((result as any).resumeScore) {
        setResumeScore((result as any).resumeScore);
      }

      // Populate editable tag lists for resume documents.
      const ex = result.extracted as {
        targetRoles?: unknown;
        targetIndustries?: unknown;
      };
      if (Array.isArray(ex.targetRoles)) {
        setTargetRoles(ex.targetRoles.filter((r): r is string => typeof r === "string"));
      }
      if (Array.isArray(ex.targetIndustries)) {
        setTargetIndustries(
          ex.targetIndustries.filter((r): r is string => typeof r === "string"),
        );
      }

      toast.success(`${title} analyzed successfully`);
      onParsed?.(result.extracted);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to analyze document";
      toast.error(msg);
    }
  };

  // ---- Apply to config ----
  const handleApply = async () => {
    try {
      await applyMutation.mutateAsync({
        targetRoles,
        targetCategories: targetIndustries,
      });
      // Refresh research config queries so any open settings page updates.
      await utils.researchConfig.get.invalidate().catch(() => {});
      toast.success("Pipeline configured from your document");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to apply settings";
      toast.error(msg);
    }
  };

  // ---- Tag helpers ----
  const addTag = (
    list: string[],
    setter: (v: string[]) => void,
    value: string,
    clear: () => void,
  ) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (list.some((x) => x.toLowerCase() === trimmed.toLowerCase())) {
      clear();
      return;
    }
    setter([...list, trimmed]);
    clear();
  };

  const removeTag = (
    list: string[],
    setter: (v: string[]) => void,
    idx: number,
  ) => setter(list.filter((_, i) => i !== idx));

  const summary = useMemo(() => {
    if (!extracted) return null;
    const ex = extracted as {
      candidateName?: string;
      seniorityLevel?: string;
      yearsOfExperience?: number;
      summary?: string;
    };
    return ex;
  }, [extracted]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <FileText className="w-6 h-6 text-indigo-600" />
          <h3 className="text-xl font-bold text-slate-900">{title}</h3>
        </div>
        <p className="text-sm text-slate-600">{description}</p>
      </div>

      {/* Drop zone */}
      {!file && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            isDragging
              ? "border-indigo-500 bg-indigo-50"
              : "border-slate-300 bg-slate-50 hover:border-indigo-400"
          }`}
          role="button"
          tabIndex={0}
        >
          <Upload className="w-10 h-10 mx-auto text-slate-400 mb-3" />
          <p className="text-sm font-medium text-slate-700">
            Drag & drop your file here, or{" "}
            <span className="text-indigo-600 underline">browse</span>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Supported: {SUPPORTED_LABEL} (max ~10 MB)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={onFileInputChange}
            className="hidden"
          />
        </div>
      )}

      {/* Selected file panel */}
      {file && !extracted && (
        <div className="border border-slate-200 rounded-xl p-4 flex items-center gap-3 bg-slate-50">
          <FileText className="w-8 h-8 text-indigo-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">
              {file.name}
            </p>
            <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={clearFile} disabled={isAnalyzing}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Staged analyzing progress */}
      {file && !extracted && isAnalyzing && (
        <div className="border border-indigo-100 rounded-xl p-6 bg-indigo-50 space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-indigo-600 animate-spin flex-shrink-0" />
            <p className="text-sm font-semibold text-indigo-900">
              {ANALYZING_STAGES[analyzingStage]}
            </p>
          </div>
          {/* Stage progress dots */}
          <div className="flex gap-1.5">
            {ANALYZING_STAGES.map((_, i) => (
              <div
                key={i}
                className="h-1 rounded-full transition-all duration-500"
                style={{
                  flex: i <= analyzingStage ? 2 : 1,
                  background: i <= analyzingStage ? "#4f46e5" : "#e0e7ff",
                }}
              />
            ))}
          </div>
          <p className="text-xs text-indigo-500">
            This takes 15–20 seconds. We're doing real work — not just pattern matching.
          </p>
        </div>
      )}

      {/* Analyze button — hidden while analyzing in progress */}
      {file && !extracted && !isAnalyzing && (
        <div className="flex gap-3">
          <Button
            onClick={handleAnalyze}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Upload className="w-4 h-4 mr-2" />
            Analyze Resume
          </Button>
          <Button variant="outline" onClick={clearFile}>
            Cancel
          </Button>
        </div>
      )}

      {/* Parsed output */}
      {extracted && (
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>
              Parsed{" "}
              {summary?.candidateName ? `for ${summary.candidateName}` : "successfully"}
              {summary?.seniorityLevel ? ` · ${summary.seniorityLevel}` : ""}
              {typeof summary?.yearsOfExperience === "number"
                ? ` · ${summary.yearsOfExperience}y exp`
                : ""}
            </span>
          </div>

          {summary?.summary && (
            <p className="text-sm text-slate-700 italic">"{summary.summary}"</p>
          )}

          {/* ── Resume Score Card ─────────────────────────────────────── */}
          {resumeScore && documentType === "resume" && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              {/* Score header */}
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{
                      background: resumeScore.overallScore >= 8 ? "#dcfce7" : resumeScore.overallScore >= 6 ? "#fef9c3" : "#fee2e2",
                      color: resumeScore.overallScore >= 8 ? "#15803d" : resumeScore.overallScore >= 6 ? "#a16207" : "#b91c1c",
                    }}
                  >
                    {resumeScore.overallScore}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">Resume Score</p>
                    <p className="text-xs text-slate-500">
                      {resumeScore.overallScore >= 8
                        ? "Strong — ready to run your pipeline"
                        : resumeScore.overallScore >= 6
                        ? "Decent — a few improvements would help"
                        : "Needs work — this may be holding you back"}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-slate-400 font-medium">/ 10</span>
              </div>

              {/* Dimension bars */}
              <div className="divide-y divide-slate-100">
                {Object.values(resumeScore.dimensions || {}).map((dim: any) => (
                  <div key={dim.label} className="px-4 py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                          {dim.flag && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
                          {dim.label}
                        </span>
                        <span
                          className="text-xs font-bold"
                          style={{ color: dim.score >= 8 ? "#15803d" : dim.score >= 6 ? "#a16207" : "#b91c1c" }}
                        >
                          {dim.score}/10
                        </span>
                      </div>
                      {/* Bar */}
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1.5">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${dim.score * 10}%`,
                            background: dim.score >= 8 ? "#22c55e" : dim.score >= 6 ? "#eab308" : "#ef4444",
                          }}
                        />
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">{dim.reason}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Top issue + CTA */}
              {resumeScore.recommendTransformation && (
                <div className="px-4 py-4 bg-blue-50 border-t border-blue-100">
                  <p className="text-xs text-slate-600 mb-3">
                    <span className="font-semibold text-slate-800">Biggest opportunity: </span>
                    {resumeScore.topIssue}
                  </p>
                  <a
                    href="https://resumeiq.reviveiqi.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    Transform with ResumeIQ
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <p className="text-xs text-slate-400 mt-2">
                    ResumeIQ rewrites every bullet with measurable impact — ATS-optimized, ready to get callbacks. First one free.
                  </p>
                </div>
              )}

              {/* Strong resume — no CTA needed */}
              {!resumeScore.recommendTransformation && (
                <div className="px-4 py-3 bg-emerald-50 border-t border-emerald-100">
                  <p className="text-xs text-emerald-700 font-medium">
                    ✓ Your resume is in good shape. Run your pipeline with confidence.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Target Roles */}
          <TagEditor
            label="Target Roles"
            placeholder="Add a role"
            tags={targetRoles}
            onAdd={(v) =>
              addTag(targetRoles, setTargetRoles, v, () => setNewRole(""))
            }
            onRemove={(idx) => removeTag(targetRoles, setTargetRoles, idx)}
            inputValue={newRole}
            onInputChange={setNewRole}
          />

          {/* Target Industries */}
          <div>
            <TagEditor
              label="Target Industries"
              placeholder="Add an industry"
              tags={targetIndustries}
              onAdd={(v) =>
                addTag(targetIndustries, setTargetIndustries, v, () =>
                  setNewIndustry(""),
                )
              }
              onRemove={(idx) => removeTag(targetIndustries, setTargetIndustries, idx)}
              inputValue={newIndustry}
              onInputChange={setNewIndustry}
            />
            {documentType === "resume" && (
              <button
                type="button"
                onClick={() => {
                  const suggestions = [
                    "Revenue Intelligence",
                    "Sales Enablement",
                    "B2B SaaS",
                    "RevTech",
                  ];
                  const seen = new Set(
                    targetIndustries.map((s) => s.toLowerCase()),
                  );
                  const merged = [...targetIndustries];
                  for (const s of suggestions) {
                    if (!seen.has(s.toLowerCase())) {
                      seen.add(s.toLowerCase());
                      merged.push(s);
                    }
                  }
                  setTargetIndustries(merged);
                }}
                className="mt-1 text-xs text-indigo-600 hover:text-indigo-800 underline"
              >
                + Add suggested AE industries (Revenue Intelligence, Sales Enablement, B2B SaaS, RevTech)
              </button>
            )}
          </div>

          <div className="flex gap-3 pt-2 border-t border-slate-200">
            {showApplyToPipeline && (
              <Button
                onClick={handleApply}
                disabled={isApplying}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isApplying ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Applying...
                  </>
                ) : (
                  "Apply to Pipeline Settings"
                )}
              </Button>
            )}
            <Button variant="outline" onClick={clearFile}>
              Upload Another
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface TagEditorProps {
  label: string;
  placeholder: string;
  tags: string[];
  onAdd: (value: string) => void;
  onRemove: (idx: number) => void;
  inputValue: string;
  onInputChange: (v: string) => void;
}

function TagEditor({
  label,
  placeholder,
  tags,
  onAdd,
  onRemove,
  inputValue,
  onInputChange,
}: TagEditorProps) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-900 mb-2">{label}</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {tags.length === 0 && (
          <p className="text-xs text-slate-500 italic">No {label.toLowerCase()} extracted yet.</p>
        )}
        {tags.map((tag, idx) => (
          <span
            key={`${tag}-${idx}`}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-sm text-indigo-800"
          >
            {tag}
            <button
              type="button"
              onClick={() => onRemove(idx)}
              className="hover:text-indigo-950"
              aria-label={`Remove ${tag}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd(inputValue);
            }
          }}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onAdd(inputValue)}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export default DocumentIntake;
