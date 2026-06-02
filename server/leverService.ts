/**
 * Lever Public Postings API Service
 *
 * Lever exposes all job postings as public JSON — no auth, no scraping.
 * Endpoint: https://api.lever.co/v0/postings/{company}?mode=json
 *
 * API docs: https://hire.lever.co/developer/postings
 */

export interface LeverJob {
  title: string;
  description: string;
  url: string;
  salary: string;
  remote: boolean;
  team: string;
  location: string;
}

/**
 * Extract the Lever company slug from a jobs.lever.co URL.
 * Handles:
 *   https://jobs.lever.co/gong
 *   https://jobs.lever.co/gong?department=Sales
 *   https://jobs.lever.co/gong/uuid-string  (direct job link)
 */
export function extractLeverSlug(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("lever.co")) return null;
    const parts = u.pathname.replace(/^\//, "").split("/");
    return parts[0] || null;
  } catch {
    return null;
  }
}

/**
 * Check if a URL is a Lever job posting URL.
 */
export function isLeverUrl(url: string): boolean {
  return url.includes("lever.co");
}

/**
 * Fetch jobs from the Lever public postings API.
 * Lever returns all postings; we filter client-side by team/department and keyword.
 */
export async function fetchLeverJobs(
  slug: string,
  keyword?: string
): Promise<LeverJob[]> {
  const apiUrl = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;

  console.log(`[Lever] Fetching jobs for company: ${slug}`);

  let res: Response;
  try {
    res = await fetch(apiUrl, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    console.warn(`[Lever] Fetch error for ${slug}:`, err);
    return [];
  }

  if (!res.ok) {
    if (res.status === 404) {
      console.warn(`[Lever] Company not found: ${slug} (404)`);
    } else {
      console.warn(`[Lever] API error for ${slug}: ${res.status}`);
    }
    return [];
  }

  let data: any[];
  try {
    data = await res.json();
  } catch {
    console.warn(`[Lever] Failed to parse JSON for ${slug}`);
    return [];
  }

  if (!Array.isArray(data)) {
    console.warn(`[Lever] Unexpected response shape for ${slug}`);
    return [];
  }

  console.log(`[Lever] Company ${slug}: ${data.length} total postings`);

  // Filter by team/department and keyword
  const salesKeywords = [
    "account executive", "account manager", "sales", "business development",
    "ae", "bdr", "sdr", "vp of sales", "director of sales", "revenue",
    "enterprise", "commercial", "strategic accounts",
  ];

  const filtered = keyword
    ? data.filter((j: any) => {
        const title = (j.text || "").toLowerCase();
        const team = (j.categories?.team || "").toLowerCase();
        const dept = (j.categories?.department || "").toLowerCase();
        const combinedText = `${title} ${team} ${dept}`;

        // Match against provided keyword words
        const kwWords = keyword.toLowerCase().split(/[,\s+]+/).filter(w => w.length > 2);
        const matchesKw = kwWords.some(w => combinedText.includes(w));
        const matchesSales = salesKeywords.some(s => combinedText.includes(s));
        return matchesKw || matchesSales;
      })
    : data;

  console.log(`[Lever] Company ${slug}: ${filtered.length} matching postings`);

  return filtered.map((j: any): LeverJob => {
    // Extract plain text from Lever's descriptionPlain or strip HTML from description
    const plainDesc = (j.descriptionPlain || j.description || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);

    const locationName = (j.categories?.location || j.workplaceType || "").toLowerCase();
    const isRemote = locationName.includes("remote") || j.workplaceType === "remote";

    return {
      title: j.text || "",
      description: plainDesc || `${j.text} role at ${slug}`,
      url: j.hostedUrl || j.applyUrl || `https://jobs.lever.co/${slug}/${j.id}`,
      salary: "", // Lever doesn't expose salary in public API
      remote: isRemote,
      team: j.categories?.team || "",
      location: j.categories?.location || "",
    };
  });
}

/**
 * High-level: given a Lever careers URL, extract slug and fetch matching jobs.
 * This is the main entry point called from jobResearchService.
 */
export async function scrapeLeverUrl(
  careersUrl: string,
  targetRoles: string
): Promise<Array<{ title: string; description: string; url: string; salary: string; remote: boolean }>> {
  const slug = extractLeverSlug(careersUrl);
  if (!slug) {
    console.warn(`[Lever] Could not extract slug from URL: ${careersUrl}`);
    return [];
  }

  const keyword = targetRoles.split(",")[0].trim();
  const jobs = await fetchLeverJobs(slug, keyword);

  return jobs.map(j => ({
    title: j.title,
    description: j.description,
    url: j.url,
    salary: j.salary,
    remote: j.remote,
  }));
}
