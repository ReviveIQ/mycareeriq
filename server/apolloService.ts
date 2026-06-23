/**
 * Apollo.io Contact Enrichment Service
 * 
 * CORRECT FLOW (per Apollo docs 2026):
 * 1. Search: POST /api/v1/mixed_people/api_search (query params, NOT body)
 *    - Does NOT return emails or last names (obfuscated on Basic plan)
 *    - Returns person IDs and basic info
 * 2. Enrich: POST /api/v1/people/match with person ID
 *    - Returns full profile including email (costs 1 credit)
 * 
 * WRONG endpoint: /v1/mixed_people/search → returns 403 on Basic plans
 * CORRECT endpoint: /api/v1/mixed_people/api_search
 */

const APOLLO_BASE = "https://api.apollo.io";

export interface ApolloContact {
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  linkedinUrl: string;
  confidence: number;
}

// Recruiters/TA — best contacts for outreach about specific open roles
const RECRUITER_TITLES = [
  "Recruiter", "Technical Recruiter", "Senior Recruiter",
  "Talent Acquisition", "Talent Acquisition Manager", "Talent Acquisition Partner",
  "Head of Talent", "Head of Recruiting", "Director of Talent Acquisition",
  "VP of People", "VP of Talent", "Recruiting Manager",
  "Senior Talent Acquisition", "Lead Recruiter",
];

// Senior leaders — fallback when no recruiter found
const LEADER_TITLES = [
  "VP of Sales", "VP Sales", "Vice President of Sales",
  "Director of Sales", "Director of Business Development",
  "Head of Sales", "Chief Revenue Officer", "CRO",
  "VP of Human Resources", "VP of People Operations",
  "Director of Human Resources", "HR Director",
];

async function searchPeople(
  domain: string,
  titles: string[],
  companyName: string
): Promise<any[]> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return [];

  try {
    // Build query string — Apollo api_search uses query params not body
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("per_page", "5");
    params.append("q_organization_domains_list[]", domain);
    titles.forEach(t => params.append("person_titles[]", t));

    const url = `${APOLLO_BASE}/api/v1/mixed_people/api_search?${params.toString()}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": apiKey,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[Apollo] Search failed for ${companyName} (${domain}): HTTP ${res.status} — ${errText.slice(0, 200)}`);
      return [];
    }

    const data = await res.json() as any;
    if (data?.error) {
      console.warn(`[Apollo] API error for ${companyName}:`, data.error);
      return [];
    }

    const people = data?.people || [];
    console.log(`[Apollo] Search ${companyName} (${domain}): ${people.length} results`);
    return people;
  } catch (err: any) {
    console.warn(`[Apollo] Search error for ${companyName}:`, err.message);
    return [];
  }
}

async function enrichPerson(personId: string, companyName: string): Promise<any | null> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(`${APOLLO_BASE}/api/v1/people/match?id=${personId}&reveal_personal_emails=false`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": apiKey,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[Apollo] Enrich failed for person ${personId} at ${companyName}: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json() as any;
    return data?.person || null;
  } catch (err: any) {
    console.warn(`[Apollo] Enrich error for ${companyName}:`, err.message);
    return null;
  }
}

function rankPeople(people: any[], preferRecruiter: boolean): any {
  return people.sort((a: any, b: any) => {
    const score = (t: string) => {
      const tl = (t || "").toLowerCase();
      if (preferRecruiter) {
        if (tl.includes("head of") || tl.includes("director") || tl.includes("vp")) return 10;
        if (tl.includes("senior") || tl.includes("lead") || tl.includes("manager")) return 7;
        if (tl.includes("partner")) return 5;
        if (tl.includes("recruit") || tl.includes("talent")) return 3;
      } else {
        if (tl.includes("cro") || tl.includes("chief revenue")) return 10;
        if (tl.includes("vp") || tl.includes("vice president")) return 8;
        if (tl.includes("director")) return 5;
        if (tl.includes("head of")) return 4;
      }
      return 1;
    };
    return score(b.title) - score(a.title);
  })[0];
}

export async function findJobPoster(
  companyName: string,
  domain: string,
  jobTitle?: string
): Promise<ApolloContact | null> {
  const people = await searchPeople(domain, RECRUITER_TITLES, companyName);
  if (!people.length) {
    console.log(`[Apollo] No recruiter found at ${companyName} — will try leader fallback`);
    return null;
  }

  const best = rankPeople(people, true);
  if (!best) return null;

  // Enrich to get email — costs 1 credit
  const enriched = await enrichPerson(best.id, companyName);
  const person = enriched || best;
  const email = person?.email || person?.personal_emails?.[0] || "";
  const name = [person.first_name, person.last_name].filter(Boolean).join(" ") || person.name || "";

  console.log(`[Apollo] Found recruiter: ${name} (${person.title}) at ${companyName}${jobTitle ? ` for ${jobTitle}` : ""}`);

  return {
    name,
    firstName: person.first_name || "",
    lastName: person.last_name || "",
    email,
    title: person.title || "",
    linkedinUrl: person.linkedin_url || "",
    confidence: email ? 85 : 45,
  };
}

export async function findHiringManager(
  companyName: string,
  domain: string
): Promise<ApolloContact | null> {
  const people = await searchPeople(domain, LEADER_TITLES, companyName);
  if (!people.length) return null;

  const best = rankPeople(people, false);
  if (!best) return null;

  // Enrich to get email
  const enriched = await enrichPerson(best.id, companyName);
  const person = enriched || best;
  const email = person?.email || person?.personal_emails?.[0] || "";
  const name = [person.first_name, person.last_name].filter(Boolean).join(" ") || person.name || "";

  console.log(`[Apollo] Found leader: ${name} (${person.title}) at ${companyName}`);

  return {
    name,
    firstName: person.first_name || "",
    lastName: person.last_name || "",
    email,
    title: person.title || "",
    linkedinUrl: person.linkedin_url || "",
    confidence: email ? 90 : 50,
  };
}
