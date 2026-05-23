/**
 * Apollo.io Contact Enrichment Service
 * Replaces Hunter.io - 20x more credits for same price
 * Apollo API: https://apolloio.github.io/apollo-api-docs/
 */

export interface ApolloContact {
  first_name: string;
  last_name: string;
  email: string;
  title: string;
  linkedin_url: string;
  seniority: string;
  departments: string[];
}

export async function searchContacts(
  companyName: string,
  domain: string
): Promise<ApolloContact | null> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    console.log("[Apollo] No API key configured, skipping contact lookup");
    return null;
  }

  try {
    const res = await fetch("https://api.apollo.io/v1/mixed_people/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({
        q_organization_name: companyName,
        person_titles: [
          "VP of Sales",
          "Vice President of Sales",
          "Director of Sales",
          "Head of Sales",
          "Chief Revenue Officer",
          "VP of Revenue",
          "Director of Business Development",
          "Sales Manager",
          "Regional Sales Director",
        ],
        page: 1,
        per_page: 5,
      }),
    });

    if (!res.ok) {
      console.error(`[Apollo] Search failed: ${res.status}`);
      return null;
    }

    const data = await res.json() as any;
    const people = data?.people || [];

    if (people.length === 0) {
      console.log(`[Apollo] No contacts found for ${companyName}`);
      return null;
    }

    // Pick the most senior person
    const seniorityOrder = ["c_suite", "vp", "director", "manager", "senior", "entry"];
    const sorted = people.sort((a: any, b: any) => {
      const aIdx = seniorityOrder.indexOf(a.seniority || "entry");
      const bIdx = seniorityOrder.indexOf(b.seniority || "entry");
      return aIdx - bIdx;
    });

    const best = sorted[0];
    console.log(`[Apollo] Found contact at ${companyName}: ${best.first_name} ${best.last_name} (${best.title})`);

    return {
      first_name: best.first_name || "",
      last_name: best.last_name || "",
      email: best.email || "",
      title: best.title || "",
      linkedin_url: best.linkedin_url || "",
      seniority: best.seniority || "",
      departments: best.departments || [],
    };
  } catch (err) {
    console.error(`[Apollo] Error searching contacts for ${companyName}:`, err);
    return null;
  }
}

export async function enrichByDomain(domain: string): Promise<ApolloContact | null> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.apollo.io/v1/mixed_people/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({
        q_organization_domains: [domain],
        person_titles: ["VP of Sales", "Director of Sales", "Chief Revenue Officer", "Head of Sales"],
        page: 1,
        per_page: 3,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json() as any;
    const people = data?.people || [];
    if (!people.length) return null;

    const best = people[0];
    return {
      first_name: best.first_name || "",
      last_name: best.last_name || "",
      email: best.email || "",
      title: best.title || "",
      linkedin_url: best.linkedin_url || "",
      seniority: best.seniority || "",
      departments: best.departments || [],
    };
  } catch {
    return null;
  }
}
