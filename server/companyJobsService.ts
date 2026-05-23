/**
 * Company Jobs Service
 * Fetches live job postings directly from company ATS systems
 * Supports Greenhouse, Lever, and Workday
 */

// Known company slugs for Greenhouse and Lever
const GREENHOUSE_SLUGS: Record<string, string> = {
  "hubspot": "hubspot",
  "salesforce": "salesforce",
  "gong": "gong",
  "salesloft": "salesloft",
  "outreach": "outreach",
  "seismic": "seismic",
  "highspot": "highspot",
  "clari": "clari",
  "zoominfo": "zoominfo",
  "6sense": "6sense",
  "demandbase": "demandbase",
  "gainsight": "gainsight",
  "drift": "drift",
  "chorus": "chorus",
  "mindtickle": "mindtickle",
  "churnzero": "churnzero",
  "totango": "totango",
  "apollo": "apolloio",
  "outplayhq": "outplay",
  "klue": "klue",
  "showpad": "showpad",
  "bigtincan": "bigtincan",
  "mediafly": "mediafly",
  "allego": "allegocorp",
  "brainshark": "brainshark",
  "revenue": "revenue",
  "cisco": "cisco",
  "oracle": "oracle",
  "sap": "sap",
  "workday": "workday",
  "zendesk": "zendesk",
  "freshworks": "freshworks",
  "pipedrive": "pipedrive",
  "monday": "mondaydotcom",
  "asana": "asana",
};

const LEVER_SLUGS: Record<string, string> = {
  "netflix": "netflix",
  "airbnb": "airbnb",
  "stripe": "stripe",
  "plaid": "plaid",
  "rippling": "rippling",
  "brex": "brex",
  "lattice": "lattice",
  "notion": "notion",
  "figma": "figma",
  "loom": "loom",
  "retool": "retool",
  "airtable": "airtable",
};

export interface CompanyJob {
  id: string;
  title: string;
  location: string;
  department: string;
  applyUrl: string;
  postedAt?: string;
  source: "greenhouse" | "lever" | "adzuna";
}

function normalizeCompanyName(name: string): string {
  return name.toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "")
    .replace(/inc$|llc$|corp$|ltd$|group$/, "");
}

export async function fetchCompanyJobs(companyName: string): Promise<CompanyJob[]> {
  const normalized = normalizeCompanyName(companyName);
  const jobs: CompanyJob[] = [];

  // Try Greenhouse first
  const ghSlug = GREENHOUSE_SLUGS[normalized] || normalized;
  try {
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${ghSlug}/jobs?content=true`, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (res.ok) {
      const data = await res.json() as any;
      const ghJobs = (data.jobs || []).slice(0, 10);
      console.log(`[CompanyJobs] Found ${ghJobs.length} jobs via Greenhouse for ${companyName}`);
      for (const job of ghJobs) {
        jobs.push({
          id: String(job.id),
          title: job.title || "",
          location: job.location?.name || "See posting",
          department: job.departments?.[0]?.name || "",
          applyUrl: job.absolute_url || `https://boards.greenhouse.io/${ghSlug}/jobs/${job.id}`,
          postedAt: job.updated_at,
          source: "greenhouse",
        });
      }
      if (jobs.length > 0) return jobs;
    }
  } catch (err) {
    console.warn(`[CompanyJobs] Greenhouse failed for ${companyName}:`, err);
  }

  // Try Lever
  const leverSlug = LEVER_SLUGS[normalized] || normalized;
  try {
    const res = await fetch(`https://api.lever.co/v0/postings/${leverSlug}?mode=json`, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (res.ok) {
      const data = await res.json() as any;
      const leverJobs = (Array.isArray(data) ? data : []).slice(0, 10);
      console.log(`[CompanyJobs] Found ${leverJobs.length} jobs via Lever for ${companyName}`);
      for (const job of leverJobs) {
        jobs.push({
          id: job.id || "",
          title: job.text || "",
          location: job.categories?.location || job.workplaceType || "See posting",
          department: job.categories?.department || job.categories?.team || "",
          applyUrl: job.hostedUrl || job.applyUrl || "",
          postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : undefined,
          source: "lever",
        });
      }
      if (jobs.length > 0) return jobs;
    }
  } catch (err) {
    console.warn(`[CompanyJobs] Lever failed for ${companyName}:`, err);
  }

  console.log(`[CompanyJobs] No direct ATS found for ${companyName}`);
  return [];
}
