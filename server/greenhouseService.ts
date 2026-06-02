/**
 * Greenhouse Job Board API Service
 *
 * Uses Greenhouse's public /v1/boards API — no auth, no scraping, no Firecrawl credits.
 * Returns structured job data with direct application URLs and post dates.
 *
 * API docs: https://developers.greenhouse.io/job-board.html
 */

export interface GreenhouseJob {
  title: string;
  description: string;
  url: string;
  salary: string;
  remote: boolean;
  postedAt: string; // ISO date string
  location: string;
}

/**
 * Extract the Greenhouse board slug from a boards.greenhouse.io URL.
 * Handles patterns:
 *   https://boards.greenhouse.io/hubspot
 *   https://boards.greenhouse.io/hubspot/jobs?q=account+executive
 *   https://boards.greenhouse.io/apolloio/jobs/12345
 */
export function extractGreenhouseSlug(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("greenhouse.io")) return null;
    // pathname: /hubspot  or  /hubspot/jobs  or  /hubspot/jobs/12345
    const parts = u.pathname.replace(/^\//, "").split("/");
    return parts[0] || null;
  } catch {
    return null;
  }
}

/**
 * Check if a URL is a Greenhouse board URL.
 */
export function isGreenhouseUrl(url: string): boolean {
  return url.includes("greenhouse.io");
}

/**
 * Fetch jobs from the Greenhouse Job Board API for a given board slug.
 * Optionally filter by keyword (matched against title).
 */
export async function fetchGreenhouseJobs(
  slug: string,
  keyword?: string
): Promise<GreenhouseJob[]> {
  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`;

  console.log(`[Greenhouse] Fetching jobs for board: ${slug}`);

  let res: Response;
  try {
    res = await fetch(apiUrl, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    console.warn(`[Greenhouse] Fetch error for ${slug}:`, err);
    return [];
  }

  if (!res.ok) {
    if (res.status === 404) {
      console.warn(`[Greenhouse] Board not found: ${slug} (404) — company may not use Greenhouse`);
    } else {
      console.warn(`[Greenhouse] API error for ${slug}: ${res.status}`);
    }
    return [];
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    console.warn(`[Greenhouse] Failed to parse JSON for ${slug}`);
    return [];
  }

  const jobs: any[] = data?.jobs || [];
  console.log(`[Greenhouse] Board ${slug}: ${jobs.length} total jobs`);

  if (jobs.length === 0) return [];

  // Filter by keyword if provided — match against title and departments
  const filtered = keyword
    ? jobs.filter((j: any) => {
        const title = (j.title || "").toLowerCase();
        const dept = (j.departments || []).map((d: any) => d.name || "").join(" ").toLowerCase();
        const kw = keyword.toLowerCase();
        // Match common AE/sales role variants
        const salesKeywords = ["account executive", "account manager", "sales", "business development",
          "ae ", " ae,", "bdr", "sdr", " vp ", "director", "revenue"];
        const kwWords = kw.split(/[,\s+]+/).filter(Boolean);
        const matchesKw = kwWords.some(w => title.includes(w) || dept.includes(w));
        const matchesSales = salesKeywords.some(s => title.includes(s) || dept.includes(s));
        return matchesKw || matchesSales;
      })
    : jobs;

  console.log(`[Greenhouse] Board ${slug}: ${filtered.length} jobs after keyword filter`);

  return filtered.map((j: any): GreenhouseJob => {
    // Greenhouse content field contains full HTML description
    const rawHtml = j.content || "";
    // Strip HTML tags for a plain-text description excerpt
    const plainText = rawHtml
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);

    const location = (j.location?.name || "").toLowerCase();
    const isRemote = location.includes("remote") || location.includes("anywhere");

    // Direct application URL
    const jobUrl = j.absolute_url || `https://boards.greenhouse.io/${slug}/jobs/${j.id}`;

    // Extract salary from metadata if present
    let salary = "";
    const metaSalary = (j.metadata || []).find(
      (m: any) => (m.name || "").toLowerCase().includes("salary") ||
                  (m.name || "").toLowerCase().includes("compensation")
    );
    if (metaSalary?.value) salary = String(metaSalary.value);

    return {
      title: j.title || "",
      description: plainText || `${j.title} role at ${slug}`,
      url: jobUrl,
      salary,
      remote: isRemote,
      postedAt: j.updated_at || j.created_at || new Date().toISOString(),
      location: j.location?.name || "",
    };
  });
}

/**
 * High-level: given a Greenhouse careers URL, extract slug and fetch matching jobs.
 * This is the main entry point called from jobResearchService.
 */
export async function scrapeGreenhouseUrl(
  careersUrl: string,
  targetRoles: string
): Promise<Array<{ title: string; description: string; url: string; salary: string; remote: boolean }>> {
  const slug = extractGreenhouseSlug(careersUrl);
  if (!slug) {
    console.warn(`[Greenhouse] Could not extract slug from URL: ${careersUrl}`);
    return [];
  }

  // Use the first target role as the keyword for filtering
  const keyword = targetRoles.split(",")[0].trim();
  const jobs = await fetchGreenhouseJobs(slug, keyword);

  return jobs.map(j => ({
    title: j.title,
    description: j.description,
    url: j.url,
    salary: j.salary,
    remote: j.remote,
  }));
}
