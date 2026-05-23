import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const STAGES = ["Research", "Outreach", "Applied", "Interviewing", "Offer", "Rejected"] as const;
type Stage = typeof STAGES[number];

const STAGE_COLORS: Record<Stage, string> = {
  Research: "bg-slate-100 text-slate-700 hover:bg-slate-200",
  Outreach: "bg-blue-100 text-blue-700 hover:bg-blue-200",
  Applied: "bg-purple-100 text-purple-700 hover:bg-purple-200",
  Interviewing: "bg-amber-100 text-amber-700 hover:bg-amber-200",
  Offer: "bg-green-100 text-green-700 hover:bg-green-200",
  Rejected: "bg-red-100 text-red-600 hover:bg-red-200",
};

interface StageSelectorProps {
  companyId: number;
  currentStage: Stage;
  onUpdate?: (newStage: Stage) => void;
}

export function StageSelector({ companyId, currentStage, onUpdate }: StageSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [stage, setStage] = useState<Stage>(currentStage);
  const utils = trpc.useUtils();

  const updateStage = trpc.pipeline.updateStage.useMutation({
    onSuccess: (_, vars) => {
      setStage(vars.stage);
      onUpdate?.(vars.stage);
      utils.pipeline.getCompanies.invalidate();
      utils.pipeline.getCompanyCount.invalidate();
      toast.success(`Stage updated to ${vars.stage}`);
    },
    onError: () => toast.error("Failed to update stage"),
  });

  const handleSelect = (newStage: Stage) => {
    setIsOpen(false);
    if (newStage === stage) return;
    updateStage.mutate({ id: companyId, stage: newStage });
  };

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${STAGE_COLORS[stage]}`}
      >
        {stage}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-8 z-20 bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-[140px]">
            {STAGES.map((s) => (
              <button
                key={s}
                onClick={(e) => { e.stopPropagation(); handleSelect(s); }}
                className={`w-full text-left px-3 py-2 text-xs font-semibold flex items-center gap-2 hover:bg-slate-50 transition-colors ${s === stage ? "bg-slate-50" : ""}`}
              >
                <span className={`w-2 h-2 rounded-full ${
                  s === "Research" ? "bg-slate-400" :
                  s === "Outreach" ? "bg-blue-400" :
                  s === "Applied" ? "bg-purple-400" :
                  s === "Interviewing" ? "bg-amber-400" :
                  s === "Offer" ? "bg-green-400" : "bg-red-400"
                }`} />
                {s}
                {s === stage && <span className="ml-auto text-slate-400">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
