import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { X, ExternalLink, Briefcase, MapPin, Building2, Loader2, Wifi, Search } from "lucide-react";

interface CompanyJobsModalProps {
  companyName: string;
  targetRole?: string;
  onClose: () => void;
}

function isRemoteJob(job: any): boolean {
  const text = `${job.title} ${job.location} ${job.department}`.toLowerCase();
  return text.includes("remote") || text.includes("work from home") || text.includes("distributed") || text.includes("anywhere");
}

function isRelevantJob(job: any, searchTerm: string): boolean {
  if (!searchTerm) return true;
  const text = `${job.title} ${job.department}`.toLowerCase();
  const terms = searchTerm.toLowerCase().split(" ");
  return terms.some(t => t.length > 2 && text.includes(t));
}

export function CompanyJobsModal({ companyName, targetRole, onClose }: CompanyJobsModalProps) {
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [search, setSearch] = useState(targetRole?.split(" ").slice(0, 2).join(" ") || "");

  const { data, isLoading } = trpc.pipeline.getCompanyJobs.useQuery(
    { companyName },
    { enabled: true }
  );

  const allJobs = data?.jobs || [];
  const source = allJobs[0]?.source;

  const filtered = allJobs.filter(job => {
    if (remoteOnly && !isRemoteJob(job)) return false;
    if (search && !isRelevantJob(job, search)) return false;
    return true;
  });

  const remoteCount = allJobs.filter(isRemoteJob).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 text-lg">{companyName}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-slate-500">Live from careers page</p>
                {source && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium capitalize">
                    {source}
                  </span>
                )}
                {remoteCount > 0 && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                    {remoteCount} remote
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Filters */}
        {allJobs.length > 0 && (
          <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by role title..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Remote toggle */}
            <button
              onClick={() => setRemoteOnly(!remoteOnly)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                remoteOnly
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-blue-400"
              }`}
            >
              <Wifi className="w-3.5 h-3.5" />
              Remote Only
              {remoteCount > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs ${remoteOnly ? "bg-blue-500" : "bg-slate-100 text-slate-600"}`}>
                  {remoteCount}
                </span>
              )}
            </button>

            <span className="text-xs text-slate-400">
              {filtered.length} of {allJobs.length}
            </span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              <p className="text-slate-500 text-sm">Checking {companyName} careers page...</p>
              <p className="text-slate-400 text-xs">Searching Greenhouse & Lever</p>
            </div>
          ) : allJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Briefcase className="w-10 h-10 text-slate-300" />
              <p className="text-slate-600 font-medium">No direct ATS postings found</p>
              <p className="text-slate-400 text-sm text-center max-w-xs">
                {companyName} may use a different careers platform. Search directly:
              </p>
              <div className="flex flex-col gap-2 w-full max-w-xs mt-1">
                <a
                  href={`https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(targetRole || "Account Executive")}&company=${encodeURIComponent(companyName)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Search on LinkedIn Jobs
                </a>
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(companyName + " " + (targetRole || "Account Executive") + " jobs careers")}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Search on Google
                </a>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Search className="w-8 h-8 text-slate-300" />
              <p className="text-slate-600 font-medium">No matching roles</p>
              <p className="text-slate-400 text-sm">Try a different search term or turn off Remote Only</p>
              <button
                onClick={() => { setSearch(""); setRemoteOnly(false); }}
                className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-sm hover:bg-slate-200 transition-colors"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((job) => {
                const remote = isRemoteJob(job);
                return (
                  <a
                    key={job.id}
                    href={job.applyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start justify-between gap-4 p-4 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors text-sm">
                          {job.title}
                        </h3>
                        {remote && (
                          <span className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                            <Wifi className="w-3 h-3" />
                            Remote
                          </span>
                        )}
                      </div>
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
                  </a>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Powered by Greenhouse & Lever APIs · Live data
          </span>
          <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-700 font-medium">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
