import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Star, ExternalLink, Linkedin, MapPin, DollarSign, User, Building2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { StageSelector } from "./StageSelector";

export function WishlistTab() {
  const { data: pipelineData = [], refetch } = trpc.pipeline.getCompanies.useQuery(
    undefined,
    { staleTime: 0 }
  );
  const utils = trpc.useUtils();

  const toggleWishlist = trpc.pipeline.toggleWishlist.useMutation({
    onSuccess: () => {
      utils.pipeline.getCompanies.invalidate();
      toast.success("Removed from wishlist");
    }
  });

  const wishlisted = pipelineData.filter((c: any) => c.wishlisted);

  if (wishlisted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center">
          <Star className="w-8 h-8 text-amber-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-800">Your wishlist is empty</h3>
        <p className="text-slate-500 text-sm text-center max-w-sm">
          Star companies from the Pipeline Table to add them to your wishlist. These become your priority outreach targets.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">My Wishlist</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {wishlisted.length} priority {wishlisted.length === 1 ? "company" : "companies"} — your top outreach targets
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full">
          <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
          {wishlisted.length} starred
        </div>
      </div>

      {/* Cards */}
      <div className="grid gap-4">
        {wishlisted.map((company: any) => (
          <div
            key={company.id}
            className="bg-white rounded-xl border border-slate-200 shadow-sm hover:border-amber-300 hover:shadow-md transition-all p-5"
          >
            <div className="flex items-start justify-between gap-4">
              {/* Left: Company info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 text-base">{company.name}</h3>
                    <p className="text-sm text-slate-500">{company.role}</p>
                  </div>
                </div>

                {/* Details row */}
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  {company.estSalary && (
                    <span className="flex items-center gap-1 text-xs text-slate-600 bg-slate-50 px-2 py-1 rounded-md">
                      <DollarSign className="w-3 h-3" />
                      {company.estSalary}
                    </span>
                  )}
                  {company.remote !== undefined && (
                    <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md ${company.remote ? "bg-green-50 text-green-700" : "bg-slate-50 text-slate-600"}`}>
                      <MapPin className="w-3 h-3" />
                      {company.remote ? "Remote" : "Onsite"}
                    </span>
                  )}
                  {company.contactName && (
                    <span className="flex items-center gap-1 text-xs text-slate-600 bg-blue-50 px-2 py-1 rounded-md">
                      <User className="w-3 h-3 text-blue-500" />
                      {company.contactName}
                      {company.contactEmail && <span className="text-blue-500 ml-1">· {company.contactEmail}</span>}
                    </span>
                  )}
                </div>

                {/* Notes */}
                {company.notes && (
                  <p className="text-xs text-slate-400 mt-2 line-clamp-2">{company.notes}</p>
                )}
              </div>

              {/* Right: Stage + Actions */}
              <div className="flex flex-col items-end gap-3 flex-shrink-0">
                <StageSelector
                  companyId={company.id}
                  currentStage={(company.stage || "Research") as any}
                />

                <div className="flex items-center gap-2">
                  {company.jobLink && (
                    <a
                      href={company.jobLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-md hover:bg-indigo-50 text-indigo-400 hover:text-indigo-600 transition-colors"
                      title="View job posting"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  {company.contactLinkedIn && (
                    <a
                      href={company.contactLinkedIn}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-md hover:bg-blue-50 text-blue-400 hover:text-blue-600 transition-colors"
                      title="View LinkedIn"
                    >
                      <Linkedin className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    onClick={() => toggleWishlist.mutate({ id: company.id, wishlisted: false })}
                    className="p-1.5 rounded-md hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors"
                    title="Remove from wishlist"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
