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

const SALES_TITLES = [
  "VP of Sales", "VP Sales", "Vice President of Sales",
  "Director of Sales", "Director of Business Development",
  "Head of Sales", "Head of Business Development",
  "Chief Revenue Officer", "CRO", "SVP Sales",
  "Sales Director", "VP Revenue",
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
        person_titles: SALES_TITLES,
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
    console.log(`[Apollo] Found: ${best.name} (${best.title}) at ${companyName}`);

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
