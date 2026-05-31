/**
 * Apollo.io Contact Enrichment Service
 * Finds real hiring manager contacts by name + title + company
 * Much more targeted than Hunter.io domain-based lookup
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
  "VP of Sales",
  "VP Sales",
  "Vice President of Sales",
  "Director of Sales",
  "Head of Sales",
  "Chief Revenue Officer",
  "CRO",
  "SVP Sales",
  "Director of Business Development",
  "VP Business Development",
  "Head of Business Development",
  "Director of Account Management",
  "VP Revenue",
];

export async function findHiringManager(
  companyName: string,
  domain: string
): Promise<ApolloContact | null> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    console.warn("[Apollo] APOLLO_API_KEY not configured");
    return null;
  }

  try {
    // Search for senior sales/BD leaders at the company
    const res = await fetch("https://api.apollo.io/v1/mixed_people/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({
        q_organization_domains: [domain],
        person_titles: SALES_TITLES,
        page: 1,
        per_page: 5,
      }),
    });

    if (!res.ok) {
      console.warn(`[Apollo] Search failed for ${companyName}: ${res.status}`);
      return null;
    }

    const data = await res.json() as any;
    const people = data?.people || [];

    if (people.length === 0) {
      console.log(`[Apollo] No contacts found for ${companyName}`);
      return null;
    }

    // Pick the most senior person
    const seniorityOrder = ["cro", "cco", "svp", "evp", "vp", "vice president", "director", "head of"];
    const sorted = people.sort((a: any, b: any) => {
      const aTitle = (a.title || "").toLowerCase();
      const bTitle = (b.title || "").toLowerCase();
      const aScore = seniorityOrder.findIndex(t => aTitle.includes(t));
      const bScore = seniorityOrder.findIndex(t => bTitle.includes(t));
      return (aScore === -1 ? 99 : aScore) - (bScore === -1 ? 99 : bScore);
    });

    const best = sorted[0];
    if (!best) return null;

    // Reveal email if not already present (Apollo hides emails by default)
    let email = best.email || "";
    if (!email && best.id) {
      email = await revealEmail(best.id, apiKey);
    }

    console.log(`[Apollo] Found contact at ${companyName}: ${best.name} (${best.title})`);

    return {
      name: best.name || "",
      firstName: best.first_name || "",
      lastName: best.last_name || "",
      email,
      title: best.title || "",
      linkedinUrl: best.linkedin_url || "",
      confidence: best.email_status === "verified" ? 95 : 70,
    };
  } catch (err) {
    console.warn(`[Apollo] Error finding contact for ${companyName}:`, err);
    return null;
  }
}

async function revealEmail(personId: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch("https://api.apollo.io/v1/people/match", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({ id: personId, reveal_personal_emails: false }),
    });
    if (!res.ok) return "";
    const data = await res.json() as any;
    return data?.person?.email || "";
  } catch {
    return "";
  }
}
