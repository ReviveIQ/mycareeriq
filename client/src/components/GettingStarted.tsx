import { useState, useEffect } from "react";
import { CheckCircle, Circle, ChevronDown, ChevronUp, X, Zap } from "lucide-react";

interface Step {
  id: string;
  action: string;
  why: string;
  automation: string;
  time?: string;
  cta: string;
  onAction: () => void;
}

interface GettingStartedProps {
  hasResume: boolean;
  hasRoles: boolean;
  hasLocation: boolean;
  hasPipeline: boolean;
  hasInbox: boolean;
  onGoToSettings: () => void;
  onRunScan: () => void;
  onGoToInbox: () => void;
  onDismiss: () => void;
}

const STORAGE_KEY = "mciq_onboarding_dismissed";

export default function GettingStarted({
  hasResume,
  hasRoles,
  hasLocation,
  hasPipeline,
  hasInbox,
  onGoToSettings,
  onRunScan,
  onGoToInbox,
  onDismiss,
}: GettingStartedProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const steps: Step[] = [
    {
      id: "resume",
      action: "Upload Your Resume",
      why: "So MyCareerIQ can understand your experience, personalize every cover letter, and recommend roles that fit your background.",
      automation: "We'll analyze your experience and build your career profile automatically.",
      time: "30 seconds",
      cta: "Go to Settings",
      onAction: onGoToSettings,
    },
    {
      id: "roles",
      action: "Choose Your Target Roles",
      why: "Review the roles we discovered from your resume. The more specific you are, the better your matches.",
      automation: "We'll use these to filter thousands of live openings down to the ones that actually fit.",
      time: "1 minute",
      cta: "Set Target Roles",
      onAction: onGoToSettings,
    },
    {
      id: "location",
      action: "Set Your Location",
      why: "Tell us where you want to work — Remote, Hybrid, Onsite, and your state.",
      automation: "We'll automatically remove every job that doesn't match your preferences.",
      time: "30 seconds",
      cta: "Set Location",
      onAction: onGoToSettings,
    },
    {
      id: "pipeline",
      action: "Find Your First Opportunities",
      why: "Search live openings across 30+ companies right now.",
      automation: "We'll score each role, find hiring managers, and build your pipeline automatically.",
      time: "30–60 seconds",
      cta: "Find Jobs",
      onAction: onRunScan,
    },
    {
      id: "inbox",
      action: "Connect InboxIQ",
      why: "Connect Gmail once and we'll automatically detect replies, interview invites, rejections, and offers.",
      automation: "Your pipeline updates automatically — no manual tracking required.",
      time: "1 minute",
      cta: "Connect Gmail",
      onAction: onGoToInbox,
    },
  ];

  const completed = [
    hasResume,
    hasRoles,
    hasLocation,
    hasPipeline,
    hasInbox,
  ];

  const completedCount = completed.filter(Boolean).length;
  const progress = Math.round((completedCount / steps.length) * 100);
  const allDone = completedCount === steps.length;

  // Auto-expand first incomplete step
  useEffect(() => {
    const firstIncomplete = steps.find((s, i) => !completed[i]);
    if (firstIncomplete && !expandedStep) {
      setExpandedStep(firstIncomplete.id);
    }
  }, [hasResume, hasRoles, hasLocation, hasPipeline, hasInbox]);

  if (allDone) return null;

  return (
    <div className="bg-white border border-indigo-100 rounded-2xl shadow-sm overflow-hidden mb-6">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer select-none bg-gradient-to-r from-indigo-50 to-white"
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Get started with MyCareerIQ</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {completedCount} of {steps.length} steps complete
              {completedCount > 0 && <span className="text-indigo-600 font-medium ml-1">· Great progress!</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Progress bar */}
          <div className="hidden sm:block w-32">
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1 text-right">{progress}%</p>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onDismiss(); }}
            className="p-1.5 text-slate-300 hover:text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          {collapsed
            ? <ChevronDown className="w-4 h-4 text-slate-400" />
            : <ChevronUp className="w-4 h-4 text-slate-400" />
          }
        </div>
      </div>

      {/* Steps */}
      {!collapsed && (
        <div className="divide-y divide-slate-50">
          {steps.map((step, idx) => {
            const isDone = completed[idx];
            const isExpanded = expandedStep === step.id;

            return (
              <div
                key={step.id}
                className={`transition-colors ${isDone ? "bg-slate-50/50" : "bg-white hover:bg-slate-50/50"}`}
              >
                <button
                  className="w-full flex items-start gap-3 px-5 py-3.5 text-left"
                  onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                >
                  {isDone
                    ? <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    : <Circle className="w-5 h-5 text-slate-300 flex-shrink-0 mt-0.5" />
                  }
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${isDone ? "text-slate-400 line-through" : "text-slate-900"}`}>
                        Step {idx + 1} — {step.action}
                      </span>
                      {isDone && (
                        <span className="text-[10px] text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full">
                          Complete
                        </span>
                      )}
                      {!isDone && step.time && (
                        <span className="text-[10px] text-slate-400">⏱ {step.time}</span>
                      )}
                    </div>
                  </div>
                  {!isDone && (
                    <span className="text-slate-300 flex-shrink-0">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </span>
                  )}
                </button>

                {/* Expanded content */}
                {isExpanded && !isDone && (
                  <div className="px-5 pb-4 ml-8">
                    <p className="text-sm text-slate-600 leading-relaxed mb-2">{step.why}</p>
                    <div className="flex items-start gap-2 bg-indigo-50 rounded-lg px-3 py-2 mb-3">
                      <Zap className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-indigo-700 leading-relaxed">{step.automation}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); step.onAction(); }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      {step.cta} →
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
