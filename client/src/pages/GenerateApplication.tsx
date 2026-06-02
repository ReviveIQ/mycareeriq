import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Loader2, Send, Clock, FileText, CheckCircle, Linkedin, AlertCircle, Mail, Zap } from "lucide-react";
import { trpc as trpcClient } from "@/lib/trpc";
import { toast } from "sonner";

export default function GenerateApplication() {
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [sendMode, setSendMode] = useState<"immediate" | "scheduled">("immediate");
  const [scheduledTime, setScheduledTime] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedDocs, setGeneratedDocs] = useState<{
    coverLetter: string;
    tailoredResume: string;
    applicationId: number;
  } | null>(null);
  const [editMode, setEditMode] = useState<"cover-letter" | "resume" | null>(null);
  const [editedCoverLetter, setEditedCoverLetter] = useState("");
  const [editedResume, setEditedResume] = useState("");
  const [linkedInProfileUrl, setLinkedInProfileUrl] = useState("");
  const [verificationMode, setVerificationMode] = useState<"pending" | "verified">("pending");
  const [verifiedContactName, setVerifiedContactName] = useState("");
  const [verifiedContactLinkedIn, setVerifiedContactLinkedIn] = useState("");
  const [verificationNotes, setVerificationNotes] = useState("");
  
  // Email lookup states
  const [suggestedEmails, setSuggestedEmails] = useState<Array<{ email: string; score: number; confidence: string }>>([]);
  const [isSearchingEmails, setIsSearchingEmails] = useState(false);
  const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [manualEmail, setManualEmail] = useState("");

  const generateMutation = trpc.application.generate.useMutation();
  const { data: pipelineCompanies = [] } = trpc.pipeline.getCompanies.useQuery();
  const sendMutation = trpc.application.send.useMutation();
  const emailLookupMutation = trpc.emailLookup.getSuggestedEmails.useMutation();

  const company = selectedCompany
    ? pipelineCompanies.find((c: any) => c.name === selectedCompany || c.companyName === selectedCompany)
    : null;

  const handleGenerate = async () => {
    if (!company) {
      toast.error("Please select a company first");
      return;
    }

    setIsGenerating(true);
    try {
      const result = await generateMutation.mutateAsync({
        companyName: company.name,
        jobTitle: company.role,
        jobDescription: company.role,
        contactName: company.contactName,
        contactEmail: company.contactLinkedIn,
        companyId: company.id.toString(),
      });

      setGeneratedDocs({
        coverLetter: result.coverLetter,
        tailoredResume: result.tailoredResume,
        applicationId: result.applicationId,
      });
      setEditedCoverLetter(result.coverLetter);
      setEditedResume(result.tailoredResume);
      setShowPreview(true);
      toast.success("Documents generated successfully!");
    } catch (error) {
      console.error("Generation failed:", error);
      toast.error("Failed to generate documents. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSearchEmails = async () => {
    if (!company) {
      toast.error("Please select a company first");
      return;
    }

    setIsSearchingEmails(true);
    try {
      const firstName = company.contactName.split(" ")[0];
      const lastName = company.contactName.split(" ").slice(1).join(" ");
      
      const result = await emailLookupMutation.mutateAsync({
        firstName,
        lastName,
        company: company.name,
        limit: 3,
      });

      if (result.suggested && result.suggested.length > 0) {
        setSuggestedEmails(result.suggested);
        setShowEmailSuggestions(true);
        toast.success(`Found ${result.suggested.length} email suggestions`);
      } else {
        toast.info("No email suggestions found. You can enter manually.");
      }
    } catch (error) {
      console.error("Email search failed:", error);
      toast.error("Failed to search for emails");
    } finally {
      setIsSearchingEmails(false);
    }
  };

  const handleSend = async () => {
    if (!generatedDocs) {
      toast.error("No documents to send");
      return;
    }
    
    if (!verifiedContactLinkedIn) {
      toast.error("Please verify a LinkedIn profile first");
      return;
    }

    try {
      // Use selected email, manual email, or derive one
      let hiringManagerEmail = selectedEmail || manualEmail;
      
      if (!hiringManagerEmail && company?.contactName) {
        hiringManagerEmail = `${company.contactName.toLowerCase().replace(/\s+/g, '.')}@${company.name.toLowerCase().replace(/[\s/&-]+/g, '')}.com`;
      }
      
      if (!hiringManagerEmail) {
        toast.error("Please select or enter an email address");
        return;
      }

      if (sendMode === "immediate") {
        await sendMutation.mutateAsync({
          applicationId: generatedDocs.applicationId,
          sendImmediately: true,
          hiringManagerEmail: hiringManagerEmail,
        });
        toast.success("Application sent successfully!");
      } else if (sendMode === "scheduled" && scheduledTime) {
        await sendMutation.mutateAsync({
          applicationId: generatedDocs.applicationId,
          sendImmediately: false,
          scheduledTime: new Date(scheduledTime),
          hiringManagerEmail: hiringManagerEmail,
        });
        toast.success("Application scheduled successfully!");
      } else {
        toast.error("Please select a send time");
        return;
      }

      setShowPreview(false);
      setGeneratedDocs(null);
      setSelectedCompany(null);
      setScheduledTime("");
      setLinkedInProfileUrl("");
      setVerificationMode("pending");
      setVerifiedContactName("");
      setVerifiedContactLinkedIn("");
      setSuggestedEmails([]);
      setSelectedEmail(null);
      setManualEmail("");
      setShowEmailSuggestions(false);
    } catch (error) {
      console.error("Send failed:", error);
      toast.error("Failed to send application. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <FileText className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-bold text-slate-900">Generate & Send Application</h2>
        </div>
        <p className="text-sm text-slate-600 mb-6">
          Auto-generate a custom cover letter and tailored resume for any company. Review, then send immediately or schedule for later.
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-slate-700 mb-2 block">
              Select a Company
            </label>
            <select
              value={selectedCompany || ""}
              onChange={(e) => setSelectedCompany(e.target.value || null)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Choose a company from your pipeline...</option>
              {pipelineCompanies.map((c: any) => (
                <option key={c.id} value={c.name}>
                  {c.name} — {c.role}
                </option>
              ))}
            </select>
          </div>

          {company && (
            <Card className="p-4 bg-indigo-50 border-indigo-200">
              <div className="text-sm">
                <p className="font-semibold text-indigo-900">{company?.companyName || company?.name}</p>
                <p className="text-indigo-700">{company.role}</p>
                <p className="text-indigo-600 text-xs mt-1">Contact: {company?.contactName || "Hiring Manager"}</p>
              </div>
            </Card>
          )}

          <Button
            onClick={handleGenerate}
            disabled={!company || isGenerating}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 mr-2" />
                Generate Cover Letter & Resume
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Your Application</DialogTitle>
          </DialogHeader>

          {generatedDocs && (
            <div className="space-y-6">
              <Tabs defaultValue="cover-letter" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="cover-letter">Cover Letter</TabsTrigger>
                  <TabsTrigger value="resume">Tailored Resume</TabsTrigger>
                </TabsList>

                <TabsContent value="cover-letter" className="space-y-4">
                  {editMode === "cover-letter" ? (
                    <div className="space-y-2">
                      <textarea
                        value={editedCoverLetter}
                        onChange={(e) => setEditedCoverLetter(e.target.value)}
                        className="w-full h-[400px] p-4 border border-indigo-300 rounded-lg font-sans text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                      />
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditedCoverLetter(generatedDocs.coverLetter);
                            setEditMode(null);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="bg-indigo-600 hover:bg-indigo-700 text-white"
                          onClick={() => {
                            setGeneratedDocs({
                              ...generatedDocs,
                              coverLetter: editedCoverLetter,
                            });
                            setEditMode(null);
                          }}
                        >
                          Save Changes
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => setEditMode("cover-letter")}
                      className="bg-slate-50 rounded-lg p-4 border border-slate-200 min-h-[300px] max-h-[400px] overflow-y-auto cursor-pointer hover:bg-slate-100 transition-colors group"
                    >
                      <div className="text-sm text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">
                        {editedCoverLetter}
                      </div>
                      <div className="mt-3 text-xs text-slate-500 group-hover:text-slate-700 transition-colors">
                        Click to edit
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="resume" className="space-y-4">
                  {editMode === "resume" ? (
                    <div className="space-y-2">
                      <textarea
                        value={editedResume}
                        onChange={(e) => setEditedResume(e.target.value)}
                        className="w-full h-[400px] p-4 border border-indigo-300 rounded-lg font-sans text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                      />
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditedResume(generatedDocs.tailoredResume);
                            setEditMode(null);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="bg-indigo-600 hover:bg-indigo-700 text-white"
                          onClick={() => {
                            setGeneratedDocs({
                              ...generatedDocs,
                              tailoredResume: editedResume,
                            });
                            setEditMode(null);
                          }}
                        >
                          Save Changes
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => setEditMode("resume")}
                      className="bg-slate-50 rounded-lg p-4 border border-slate-200 min-h-[300px] max-h-[400px] overflow-y-auto cursor-pointer hover:bg-slate-100 transition-colors group"
                    >
                      <div className="text-sm text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">
                        {editedResume}
                      </div>
                      <div className="mt-3 text-xs text-slate-500 group-hover:text-slate-700 transition-colors">
                        Click to edit
                      </div>
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              {/* Email Lookup Section */}
              <div className="border-t border-slate-200 pt-4 pb-4 space-y-4">
                <div className="flex items-start gap-3 bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <Mail className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-purple-900">
                    <p className="font-semibold mb-1">Find Hiring Manager Email</p>
                    <p>Use Hunter.io to automatically discover the hiring manager's email address.</p>
                  </div>
                </div>

                {!showEmailSuggestions ? (
                  <Button
                    onClick={handleSearchEmails}
                    disabled={isSearchingEmails || !company}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    {isSearchingEmails ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 mr-2" />
                        Search for Email Suggestions
                      </>
                    )}
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-slate-900">Suggested Emails:</p>
                    <div className="space-y-2">
                      {suggestedEmails.map((email, idx) => (
                        <label key={idx} className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                          <input
                            type="radio"
                            name="email"
                            value={email.email}
                            checked={selectedEmail === email.email}
                            onChange={(e) => setSelectedEmail(e.target.value)}
                            className="w-4 h-4"
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-900">{email.email}</p>
                            <p className="text-xs text-slate-500">
                              Confidence: <span className={`font-semibold ${
                                email.confidence === 'high' ? 'text-emerald-600' :
                                email.confidence === 'medium' ? 'text-amber-600' :
                                'text-slate-600'
                              }`}>{email.confidence}</span> ({email.score}%)
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowEmailSuggestions(false);
                        setSuggestedEmails([]);
                        setSelectedEmail(null);
                      }}
                      className="w-full"
                    >
                      Search Again
                    </Button>
                  </div>
                )}

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="px-2 bg-white text-slate-500">Or enter manually</span>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-2 block">Email Address</label>
                  <Input
                    type="email"
                    placeholder="hiring.manager@company.com"
                    value={manualEmail}
                    onChange={(e) => setManualEmail(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Contact Verification Section */}
              <div className="border-t border-slate-200 pt-4 pb-4 space-y-4">
                <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-900">
                    <p className="font-semibold mb-1">Verify LinkedIn Profile</p>
                    <p>Paste the hiring manager's LinkedIn profile URL to verify their identity before sending.</p>
                  </div>
                </div>

                {verificationMode === "pending" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-semibold text-slate-700 mb-2 block">LinkedIn Profile URL</label>
                      <Input
                        type="url"
                        placeholder="https://linkedin.com/in/john-doe"
                        value={linkedInProfileUrl}
                        onChange={(e) => setLinkedInProfileUrl(e.target.value)}
                        className="w-full"
                      />
                      <p className="text-xs text-slate-500 mt-2">Copy the contact's LinkedIn profile URL from their profile page</p>
                    </div>

                    <Button
                      onClick={() => {
                        if (linkedInProfileUrl && linkedInProfileUrl.includes("linkedin.com")) {
                          const nameMatch = linkedInProfileUrl.match(/\/in\/([\w-]+)/);
                          const extractedName = nameMatch ? nameMatch[1].replace(/-/g, " ") : "LinkedIn User";
                          setVerifiedContactName(extractedName);
                          setVerifiedContactLinkedIn(linkedInProfileUrl);
                          setVerificationMode("verified");
                          toast.success(`LinkedIn profile verified!`);
                        } else {
                          toast.error("Please enter a valid LinkedIn profile URL");
                        }
                      }}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <Linkedin className="w-4 h-4 mr-2" />
                      Verify LinkedIn Profile
                    </Button>
                  </div>
                )}

                {verificationMode === "verified" && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-emerald-600" />
                      <p className="font-semibold text-emerald-900">LinkedIn Profile Verified</p>
                    </div>
                    <div className="text-sm text-emerald-800 space-y-1">
                      <p><strong>Profile:</strong> {verifiedContactName}</p>
                      <p><strong>URL:</strong> <a href={verifiedContactLinkedIn} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">{verifiedContactLinkedIn}</a></p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setVerificationMode("pending");
                        setLinkedInProfileUrl("");
                        setVerifiedContactName("");
                        setVerifiedContactLinkedIn("");
                      }}
                      className="w-full"
                    >
                      Change Profile
                    </Button>
                  </div>
                )}
              </div>

              {/* Send Options */}
              <div className="border-t border-slate-200 pt-4" style={{ opacity: verificationMode === "verified" ? 1 : 0.5, pointerEvents: verificationMode === "verified" ? "auto" : "none" }}>
                <p className="text-sm font-semibold text-slate-900 mb-4">Send Options</p>
                {verificationMode !== "verified" && (
                  <p className="text-xs text-amber-600 mb-3 bg-amber-50 p-2 rounded">Verify LinkedIn profile first to enable sending</p>
                )}

                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                    <input
                      type="radio"
                      name="sendMode"
                      value="immediate"
                      checked={sendMode === "immediate"}
                      onChange={(e) => setSendMode(e.target.value as "immediate" | "scheduled")}
                      className="w-4 h-4"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-900">Send Immediately</p>
                      <p className="text-xs text-slate-500">Application will be sent right away</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                    <input
                      type="radio"
                      name="sendMode"
                      value="scheduled"
                      checked={sendMode === "scheduled"}
                      onChange={(e) => setSendMode(e.target.value as "immediate" | "scheduled")}
                      className="w-4 h-4"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">Schedule for Later</p>
                      <p className="text-xs text-slate-500">Choose when to send</p>
                    </div>
                  </label>

                  {sendMode === "scheduled" && (
                    <div className="ml-7 space-y-2">
                      <Input
                        type="datetime-local"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        className="w-full"
                      />
                    </div>
                  )}

                  <Button
                    onClick={handleSend}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white mt-4"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Send Now
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
