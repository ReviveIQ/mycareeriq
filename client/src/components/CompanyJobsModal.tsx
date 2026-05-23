import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { X, ExternalLink, Briefcase, MapPin, Building2, Loader2 } from "lucide-react";

interface CompanyJobsModalProps {
  companyName: string;
  onClose: () => void;
}

export function CompanyJobsModal({ companyName, onClose }: CompanyJobsModalProps) {
  const { data, isLoading } = trpc.pipeline.getCompanyJobs.useQuery(
    { companyName },
    { enabled: true }
  );

  const jobs = data?.jobs || [];
  const found = data?.found || false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 text-lg">{companyName}</h2>
              <p className="text-xs text-slate-500">Live job postings from company careers page</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              <p className="text-slate-500 text-sm">Checking {companyName} careers page...</p>
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Briefcase className="w-10 h-10 text-slate-300" />
              <p className="text-slate-600 font-medium">No direct postings found</p>
              <p className="text-slate-400 text-sm text-center max-w-xs">
                {companyName} may not use Greenhouse or Lever. Try searching on their careers page directly.
              </p>
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(companyName + " careers jobs account executive")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Search {companyName} Careers
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-slate-500">
                  Found <strong className="text-slate-800">{jobs.length}</strong> open positions
                  <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                    Live from {jobs[0]?.source === "greenhouse" ? "Greenhouse" : "Lever"}
                  </span>
                </span>
              </div>

              {jobs.map((job) => (
                <a
                  key={job.id}
                  href={job.applyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-4 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors text-sm leading-snug">
                        {job.title}
                      </h3>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {job.location && (
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <MapPin className="w-3 h-3" />
                            {job.location}
                          </span>
                        )}
                        {job.department && (
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <Briefcase className="w-3 h-3" />
                            {job.department}
                          </span>
                        )}
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 flex-shrink-0 mt-0.5 transition-colors" />
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Powered by Greenhouse & Lever APIs
          </span>
          <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-700 font-medium">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
