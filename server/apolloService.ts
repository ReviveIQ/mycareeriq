/**
 * Apollo.io Contact Enrichment Service
 * Uses the People Search API to find real hiring managers by title + company
 */

export interface ApolloContact {
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  linkedinUrl: string;
  confidence: number;
}

// Senior sales leaders — used for general pipeline enrichment
const SALES_LEADER_TITLES = [
  "VP of Sales", "VP Sales", "Vice President of Sales",
  "Director of Sales", "Director of Business Development",
  "Head of Sales", "Head of Business Development",
  "Chief Revenue Officer", "CRO", "SVP Sales",
  "Sales Director", "VP Revenue",
];

// Recruiters and TA — the people who actually set up job postings
// These are the best contacts for outreach about a specific open role
const RECRUITER_TITLES = [
  "Recruiter", "Technical Recruiter", "Senior Recruiter",
  "Talent Acquisition", "Talent Acquisition Manager", "Talent Acquisition Partner",
  "Head of Talent", "Head of Recruiting", "Director of Talent Acquisition",
  "VP of People", "VP of Talent", "Recruiting Manager",
  "Senior Talent Acquisition", "Lead Recruiter",
];

export async function findHiringManager(
  companyName: string,
  domain: string
): Promise<ApolloContact | null> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) { console.warn("[Apollo] APOLLO_API_KEY not set"); return null; }

  try {
    const res = await fetch("https://api.apollo.io/v1/mixed_people/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "X-Api-Key": apiKey },
      body: JSON.stringify({
        q_organization_domains: [domain],
        person_titles: SALES_LEADER_TITLES,
        page: 1,
        per_page: 5,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) { console.warn(`[Apollo] Search failed for ${companyName}: ${res.status}`); return null; }

    const data = await res.json() as any;
    const people = data?.people || [];
    if (people.length === 0) return null;

    const ranked = people.sort((a: any, b: any) => {
      const score = (t: string) => {
        const tl = (t || "").toLowerCase();
        if (tl.includes("cro") || tl.includes("chief revenue")) return 10;
        if (tl.includes("vp") || tl.includes("vice president")) return 8;
        if (tl.includes("svp") || tl.includes("evp")) return 7;
        if (tl.includes("director")) return 5;
        if (tl.includes("head of")) return 4;
        return 1;
      };
      return score(b.title) - score(a.title);
    });

    const best = ranked[0];
    const email = best?.email || best?.personal_emails?.[0] || "";
    console.log(`[Apollo] Found sales leader: ${best.name} (${best.title}) at ${companyName}`);

    return {
      name: best.name || "",
      firstName: best.first_name || "",
      lastName: best.last_name || "",
      email,
      title: best.title || "",
      linkedinUrl: best.linkedin_url || "",
      confidence: email ? 90 : 50,
    };
  } catch (err) {
    console.warn(`[Apollo] Error for ${companyName}:`, err);
    return null;
  }
}

/**
 * Find the recruiter or TA person most likely to have posted a specific job.
 * These are better outreach targets than sales leaders for job-specific messages
 * because they own the requisition and are actively working the role.
 *
 * Strategy: search for TA/recruiter titles at the company, rank by seniority.
 * The outreach message ("can you point me to the hiring manager?") lands better
 * with a recruiter than a cold VP who didn't post the role.
 */
export async function findJobPoster(
  companyName: string,
  domain: string,
  jobTitle?: string
): Promise<ApolloContact | null> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.apollo.io/v1/mixed_people/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "X-Api-Key": apiKey },
      body: JSON.stringify({
        q_organization_domains: [domain],
        person_titles: RECRUITER_TITLES,
        page: 1,
        per_page: 5,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[Apollo] Recruiter search failed for ${companyName}: ${res.status}`);
      return null;
    }

    const data = await res.json() as any;
    const people = data?.people || [];
    if (people.length === 0) {
      console.log(`[Apollo] No recruiter found at ${companyName} — will use sales leader instead`);
      return null;
    }

    // Rank: prefer Senior/Lead/Manager over generic Recruiter
    const ranked = people.sort((a: any, b: any) => {
      const score = (t: string) => {
        const tl = (t || "").toLowerCase();
        if (tl.includes("head of") || tl.includes("director") || tl.includes("vp")) return 10;
        if (tl.includes("senior") || tl.includes("lead") || tl.includes("manager")) return 7;
        if (tl.includes("partner")) return 5;
        return 3;
      };
      return score(b.title) - score(a.title);
    });

    const best = ranked[0];
    const email = best?.email || best?.personal_emails?.[0] || "";
    console.log(`[Apollo] Found job poster: ${best.name} (${best.title}) at ${companyName}${jobTitle ? ` for ${jobTitle}` : ""}`);

    return {
      name: best.name || "",
      firstName: best.first_name || "",
      lastName: best.last_name || "",
      email,
      title: best.title || "",
      linkedinUrl: best.linkedin_url || "",
      confidence: email ? 85 : 45,
    };
  } catch (err) {
    console.warn(`[Apollo] findJobPoster error for ${companyName}:`, err);
    return null;
  }
}
