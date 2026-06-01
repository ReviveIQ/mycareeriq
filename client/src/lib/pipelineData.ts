// Design Philosophy: "Territory Map" — Clean Professional Light Dashboard
// DM Sans (headers) + Inter (body), off-white background, deep indigo accent
// CRM-like interface with status badges, filter chips, and sortable columns

export type PipelineStage = "Research" | "Outreach" | "Applied" | "Interviewing" | "Offer" | "Rejected";

export type CompanyCategory = string;

export interface Company {
  id: number;
  name: string;
  category: CompanyCategory;
  stage: PipelineStage;
  role: string;
  jobLink: string;
  contactName: string;
  contactTitle: string;
  contactLinkedIn: string;
  priority: "High" | "Medium" | "Low";
  notes: string;
  remoteOk: boolean;
  estSalary: string;
  companySize: string;
}

// Static pipeline data — kept empty, real data comes from TiDB via tRPC
export const pipelineData: Company[] = [];

export const stageColors: Record<PipelineStage, string> = {
  Research: "bg-slate-100 text-slate-700 border-slate-200",
  Outreach: "bg-amber-50 text-amber-700 border-amber-200",
  Applied: "bg-blue-50 text-blue-700 border-blue-200",
  Interviewing: "bg-violet-50 text-violet-700 border-violet-200",
  Offer: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Rejected: "bg-red-50 text-red-600 border-red-200",
};

export const priorityColors: Record<"High" | "Medium" | "Low", string> = {
  High: "bg-rose-50 text-rose-700 border-rose-200",
  Medium: "bg-amber-50 text-amber-700 border-amber-200",
  Low: "bg-slate-50 text-slate-600 border-slate-200",
};

const _categoryColorMap: Record<string, string> = {
  "Sales Enablement": "bg-indigo-50 text-indigo-700",
  "Revenue Intelligence": "bg-violet-50 text-violet-700",
  "Customer Success": "bg-teal-50 text-teal-700",
  "Marketing Automation": "bg-pink-50 text-pink-700",
  "HR / Workforce Tech": "bg-orange-50 text-orange-700",
  "Subscription / Billing": "bg-cyan-50 text-cyan-700",
  "Social Media SaaS": "bg-sky-50 text-sky-700",
  "Partnership Platform": "bg-lime-50 text-lime-700",
  "EdTech SaaS": "bg-emerald-50 text-emerald-700",
  "Compliance SaaS": "bg-rose-50 text-rose-700",
  "B2B SaaS": "bg-blue-50 text-blue-700",
  "CRM": "bg-indigo-50 text-indigo-700",
  "Enterprise Software": "bg-violet-50 text-violet-700",
  "Sales Technology": "bg-indigo-50 text-indigo-700",
};

export function getCategoryColor(category: string): string {
  return _categoryColorMap[category] || "bg-slate-50 text-slate-600";
}

// Keep for backwards compatibility
export const categoryColors = new Proxy(_categoryColorMap, {
  get(target, key: string) {
    return target[key] || "bg-slate-50 text-slate-600";
  }
}) as Record<string, string>;

export const stageOrder: PipelineStage[] = [
  "Research",
  "Outreach",
  "Applied",
  "Interviewing",
  "Offer",
  "Rejected",
];

export function exportToCSV(companies: Company[], filename = "bryan-pipeline.csv"): void {
  const headers = [
    "Company",
    "Category",
    "Target Role",
    "Pipeline Stage",
    "Priority",
    "Key Contact Name",
    "Contact Title",
    "Contact LinkedIn",
    "Job Posting Link",
    "Remote OK",
    "Est. Salary",
    "Company Size",
    "Notes",
  ];

  const rows = companies.map((c) => [
    c.name,
    c.category,
    c.role,
    c.stage,
    c.priority,
    c.contactName,
    c.contactTitle,
    c.contactLinkedIn,
    c.jobLink,
    c.remoteOk ? "Yes" : "No",
    c.estSalary,
    c.companySize,
    c.notes,
  ]);

  // Escape CSV values (handle commas, quotes, newlines)
  const escapedRows = rows.map((row) =>
    row
      .map((cell) => {
        const str = String(cell);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(",")
  );

  const csv = [headers.join(","), ...escapedRows].join("\n");

  // Create blob and download
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
