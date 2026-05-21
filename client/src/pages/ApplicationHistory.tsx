import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Download, Eye, Trash2, Search, Calendar, Mail, CheckCircle, Clock, XCircle, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";

export default function ApplicationHistory() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedApplication, setSelectedApplication] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Fetch all applications
  const { data: applications = [], isLoading } = trpc.applicationHistory.list.useQuery();
  const deleteApplication = trpc.applicationHistory.delete.useMutation();
  const updateOutcome = trpc.applicationStatus.updateOutcome.useMutation();

  // Filter applications based on search term
  const filteredApplications = applications.filter(
    (app) =>
      app.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.contactName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.jobTitle.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Sort by most recent first
  const sortedApplications = [...filteredApplications].sort(
    (a, b) => new Date(b.sentAt || b.createdAt).getTime() - new Date(a.sentAt || a.createdAt).getTime()
  );

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
      sent: { bg: "bg-emerald-50", text: "text-emerald-700", icon: <CheckCircle className="w-4 h-4" /> },
      scheduled: { bg: "bg-blue-50", text: "text-blue-700", icon: <Clock className="w-4 h-4" /> },
      failed: { bg: "bg-red-50", text: "text-red-700", icon: <XCircle className="w-4 h-4" /> },
      draft: { bg: "bg-slate-50", text: "text-slate-700", icon: <Mail className="w-4 h-4" /> },
    };

    const config = statusConfig[status] || statusConfig.draft;
    return (
      <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${config.bg} ${config.text} text-xs font-medium`}>
        {config.icon}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </div>
    );
  };

  const getOutcomeBadge = (outcome: string) => {
    const outcomeConfig: Record<string, { bg: string; text: string }> = {
      pending: { bg: "bg-slate-100", text: "text-slate-700" },
      interviewing: { bg: "bg-blue-100", text: "text-blue-700" },
      offer: { bg: "bg-emerald-100", text: "text-emerald-700" },
      rejected: { bg: "bg-red-100", text: "text-red-700" },
    };

    const config = outcomeConfig[outcome] || outcomeConfig.pending;
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${config.bg} ${config.text}`}>
        {outcome.charAt(0).toUpperCase() + outcome.slice(1)}
      </span>
    );
  };

  const handleDelete = async (applicationId: number) => {
    if (confirm("Are you sure you want to delete this application record?")) {
      try {
        await deleteApplication.mutateAsync({ applicationId });
      } catch (error) {
        console.error("Delete failed:", error);
      }
    }
  };

  const handleDownloadPDF = (pdfKey: string | null | undefined, filename: string) => {
    if (!pdfKey) return;
    // In production, this would generate a presigned URL from S3
    window.open(`/manus-storage/${pdfKey}`, "_blank");
  };

  const handleOutcomeChange = async (applicationId: number, newOutcome: string) => {
    try {
      await updateOutcome.mutateAsync({
        applicationId,
        outcome: newOutcome as "pending" | "interviewing" | "offer" | "rejected",
      });
    } catch (error) {
      console.error("Failed to update outcome:", error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Application History</h2>
        <p className="text-slate-600">Track all your sent applications and their delivery status</p>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex gap-3">
          <Search className="w-5 h-5 text-slate-400 mt-2.5" />
          <Input
            type="text"
            placeholder="Search by company, contact, or job title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1"
          />
        </div>
      </div>

      {/* Applications Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Loading applications...</div>
        ) : sortedApplications.length === 0 ? (
          <div className="p-8 text-center">
            <Mail className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">No applications yet</p>
            <p className="text-slate-500 text-sm">Generate and send applications from the Generate tab to see them here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Company</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Contact</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Outcome</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Sent Date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedApplications.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{app.companyName}</div>
                      <div className="text-sm text-slate-500">{app.jobTitle}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-900">{app.contactName}</div>
                      {app.contactEmail && <div className="text-sm text-slate-500">{app.contactEmail}</div>}
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(app.status)}</td>
                    <td className="px-6 py-4">{getOutcomeBadge(app.outcome)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-slate-600">
                        <Calendar className="w-4 h-4" />
                        {app.sentAt ? format(new Date(app.sentAt), "MMM d, yyyy") : format(new Date(app.createdAt), "MMM d, yyyy")}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedApplication(app);
                            setShowPreview(true);
                          }}
                          className="text-blue-600 border-blue-200 hover:bg-blue-50"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {app.coverLetterPdfKey && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownloadPDF(app.coverLetterPdfKey, `${app.companyName}-cover-letter.pdf`)}
                            className="text-green-600 border-green-200 hover:bg-green-50"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(app.id)}
                          className="text-red-600 border-red-200 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Application Preview Dialog */}
      {selectedApplication && (
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedApplication.companyName} - {selectedApplication.jobTitle}</DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              {/* Application Details */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1">Contact</p>
                  <p className="text-sm text-slate-900">{selectedApplication.contactName}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1">Email</p>
                  <p className="text-sm text-slate-900">{selectedApplication.contactEmail || "N/A"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1">Status</p>
                  {getStatusBadge(selectedApplication.status)}
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1">Outcome</p>
                  {getOutcomeBadge(selectedApplication.outcome)}
                </div>
              </div>

              {/* Cover Letter */}
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-2">Cover Letter</h3>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 max-h-[300px] overflow-y-auto">
                  <div className="text-sm text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">
                    {selectedApplication.coverLetter}
                  </div>
                </div>
              </div>

              {/* Resume */}
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-2">Tailored Resume</h3>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 max-h-[300px] overflow-y-auto">
                  <div className="text-sm text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">
                    {selectedApplication.tailoredResume}
                  </div>
                </div>
              </div>

              {/* Download Buttons */}
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <Button
                  variant="outline"
                  onClick={() => setShowPreview(false)}
                  className="flex-1"
                >
                  Close
                </Button>
                {selectedApplication.coverLetterPdfKey && (
                  <Button
                    onClick={() => handleDownloadPDF(selectedApplication.coverLetterPdfKey, `${selectedApplication.companyName}-cover-letter.pdf`)}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download PDF
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
