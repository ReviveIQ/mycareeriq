import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle, X } from "lucide-react";

interface ParsedDocument {
  candidateName?: string;
  targetRoles: string[];
  targetIndustries: string[];
  skills: string[];
  seniorityLevel: string;
  yearsOfExperience: number;
  summary: string;
}

interface DocumentIntakeProps {
  onApply: (roles: string, industries: string) => void;
}

export function DocumentIntake({ onApply }: DocumentIntakeProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedDocument | null>(null);
  const [editedRoles, setEditedRoles] = useState<string[]>([]);
  const [editedIndustries, setEditedIndustries] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (!f.name.match(/\.(pdf|docx|doc)$/i)) {
      toast.error("Please upload a PDF or Word document");
      return;
    }
    setFile(f);
    setParsed(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setParsing(true);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/trpc/documentIntake.parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          json: {
            fileBase64: base64,
            fileName: file.name,
            documentType: "resume",
          },
        }),
      });

      const data = await res.json();
      const result = data[0]?.result?.data?.json || data?.result?.data?.json;

      if (!result) throw new Error("Failed to parse document");

      setParsed(result);
      setEditedRoles(result.targetRoles || []);
      setEditedIndustries(result.targetIndustries || []);
      toast.success(`Parsed for ${result.candidateName || "you"} · ${result.seniorityLevel} · ${result.yearsOfExperience}y exp`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to analyze document. Please try again.");
    } finally {
      setParsing(false);
    }
  };

  const removeRole = (i: number) => setEditedRoles(editedRoles.filter((_, idx) => idx !== i));
  const removeIndustry = (i: number) => setEditedIndustries(editedIndustries.filter((_, idx) => idx !== i));

  const handleApply = () => {
    onApply(editedRoles.join(", "), editedIndustries.join(", "));
    toast.success("Pipeline configured from your document");
  };

  return (
    <div className="space-y-4">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.doc"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
        <p className="text-sm text-gray-600">
          {file ? (
            <span className="flex items-center justify-center gap-2 text-blue-600">
              <FileText className="w-4 h-4" />
              {file.name}
            </span>
          ) : (
            "Drag & drop a PDF or DOCX. We'll extract target roles and industries and apply them to your pipeline settings."
          )}
        </p>
      </div>

      {file && !parsed && (
        <Button onClick={handleAnalyze} disabled={parsing} className="w-full">
          {parsing ? "Analyzing your document..." : "Analyze Document"}
        </Button>
      )}

      {parsed && (
        <div className="space-y-4 border rounded-lg p-4 bg-green-50">
          <div className="flex items-center gap-2 text-green-700 font-medium">
            <CheckCircle className="w-4 h-4" />
            Parsed for {parsed.candidateName} · {parsed.seniorityLevel} · {parsed.yearsOfExperience}y exp
          </div>

          <p className="text-sm text-gray-600 italic">"{parsed.summary}"</p>

          <div>
            <p className="text-sm font-medium mb-2">Target Roles</p>
            <div className="flex flex-wrap gap-2">
              {editedRoles.map((role, i) => (
                <span key={i} className="flex items-center gap-1 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                  {role}
                  <button onClick={() => removeRole(i)}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Target Industries</p>
            <div className="flex flex-wrap gap-2">
              {editedIndustries.map((ind, i) => (
                <span key={i} className="flex items-center gap-1 bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm">
                  {ind}
                  <button onClick={() => removeIndustry(i)}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          </div>

          <Button onClick={handleApply} className="w-full">
            Apply to Pipeline Settings
          </Button>
        </div>
      )}
    </div>
  );
}
