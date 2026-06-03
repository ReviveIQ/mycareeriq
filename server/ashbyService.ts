/**
 * Ashby Job Board API Service
 *
 * Uses Ashby's public posting API — no auth required.
 * Endpoint: https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true
 *
 * API docs: https://developers.ashbyhq.com/docs/public-job-posting-api
 *
 * Ashby is widely used by growth-stage SaaS companies (Rippling, Vanta, Drata, etc.)
 * that don't appear on Greenhouse or Lever boards.
 */

export interface AshbyJob {
  title: string;
  description: string;
  url: string;
  applyUrl: string;
  salary: string;
  remote: boolean;
  location: string;
  department: string;
  team: string;
  jobId: string;         // UUID from Ashby
  publishedAt: string;
}

/**
 * Extract the Ashby slug from a jobs.ashbyhq.com URL.
 * Handles:
 *   https://jobs.ashbyhq.com/rippling
 *   https://jobs.ashbyhq.com/rippling/abc-123  (individual job)
 */
export function extractAshbySlug(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("ashbyhq.com")) return null;
    const parts = u.pathname.replace(/^\//, "").split("/");
    return parts[0] || null;
  } catch {
    return null;
  }
}

/**
 * Check if a URL is an Ashby job board URL.
 */
export function isAshbyUrl(url: string): boolean {
  return url.includes("ashbyhq.com");
}

/**
 * Fetch all jobs from an Ashby board for a given slug.
 * Optionally filter by keyword matched against title and department.
 */
export async function fetchAshbyJobs(
  slug: string,
  keyword?: string
): Promise<AshbyJob[]> {
  const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`;

  console.log(`[Ashby] Fetching jobs for board: ${slug}`);

  let res: Response;
  try {
    res = await fetch(apiUrl, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    console.warn(`[Ashby] Fetch error for ${slug}:`, err);
    return [];
  }

  if (!res.ok) {
    if (res.status === 404) {
      console.warn(`[Ashby] Board not found: ${slug} (404)`);
    } else {
      console.warn(`[Ashby] API error for ${slug}: ${res.status}`);
    }
    return [];
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    console.warn(`[Ashby] Failed to parse JSON for ${slug}`);
    return [];
  }

  const jobs: any[] = data?.jobs || [];
  console.log(`[Ashby] Board ${slug}: ${jobs.length} total jobs`);

  if (jobs.length === 0) return [];

  // Sales-relevant keywords for filtering
  const salesKeywords = [
    "account executive", "account manager", "sales", "business development",
    "ae", "bdr", "sdr", "vp of sales", "director of sales", "revenue",
    "enterprise", "commercial", "strategic accounts", "customer success",
    "partnerships", "growth",
  ];

  const filtered = keyword
    ? jobs.filter((j: any) => {
        const title = (j.title || "").toLowerCase();
        const dept = (j.departmentName || j.department?.name || "").toLowerCase();
        const team = (j.teamName || j.team?.name || "").toLowerCase();
        const combinedText = `${title} ${dept} ${team}`;

        const kwWords = keyword.toLowerCase().split(/[,\s+]+/).filter(w => w.length > 2);
        const matchesKw = kwWords.some(w => combinedText.includes(w));
        const matchesSales = salesKeywords.some(s => combinedText.includes(s));
        return matchesKw || matchesSales;
      })
    : jobs;

  console.log(`[Ashby] Board ${slug}: ${filtered.length} matching jobs`);

  return filtered.map((j: any): AshbyJob => {
    // Strip HTML from description
    const plainDesc = (j.descriptionPlain || j.descriptionHtml || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);

    // Ashby remote detection
    const isRemote = j.isRemote === true ||
      (j.workplaceType || "").toLowerCase() === "remote" ||
      (j.location || "").toLowerCase().includes("remote");

    // Salary from compensation tier
    const salary = j.compensation?.compensationTierSummary || "";

    // Direct job URL — Ashby provides both a job page URL and an apply URL
    const jobUrl = j.jobUrl || j.applyUrl || `https://jobs.ashbyhq.com/${slug}/${j.id}`;

    return {
      title: j.title || "",
      description: plainDesc || `${j.title} role at ${slug}`,
      url: jobUrl,
      applyUrl: j.applyUrl || jobUrl,
      salary,
      remote: isRemote,
      location: j.location || j.locationName || "",
      department: j.departmentName || j.department?.name || "",
      team: j.teamName || j.team?.name || "",
      jobId: j.id || "",
      publishedAt: j.publishedAt || new Date().toISOString(),
    };
  });
}

/**
 * High-level entry point called from jobResearchService.
 */
export async function scrapeAshbyUrl(
  careersUrl: string,
  targetRoles: string
): Promise<Array<{ title: string; description: string; url: string; salary: string; remote: boolean; jobId: string }>> {
  const slug = extractAshbySlug(careersUrl);
  if (!slug) {
    console.warn(`[Ashby] Could not extract slug from URL: ${careersUrl}`);
    return [];
  }

  const keyword = targetRoles.split(",")[0].trim();
  const jobs = await fetchAshbyJobs(slug, keyword);

  return jobs.map(j => ({
    title: j.title,
    description: j.description,
    url: j.url,
    salary: j.salary,
    remote: j.remote,
    jobId: j.jobId,
  }));
}
