/**
 * Apollo.io Contact Service
 * Step 1: Search (free, no credits) - finds person ID
 * Step 2: Enrich (costs credits) - gets verified email
 */

export interface ApolloContact {
  first_name: string;
  last_name: string;
  email: string;
  title: string;
  linkedin_url: string;
  seniority: string;
}

export async function searchContacts(companyName: string, domain: string): Promise<ApolloContact | null> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    console.log("[Apollo] No API key configured");
    return null;
  }

  try {
    // Step 1: Search for people (no credits consumed)
    const searchRes = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        q_organization_domains_list: [domain],
        person_titles: [
          "VP of Sales",
          "Vice President of Sales",
          "Director of Sales",
          "Head of Sales",
          "Chief Revenue Officer",
          "VP of Revenue",
          "Director of Business Development",
          "Sales Manager",
        ],
        person_seniorities: ["vp", "director", "c_suite", "head", "manager"],
        per_page: 5,
        page: 1,
      }),
    });

    if (!searchRes.ok) {
      const err = await searchRes.text();
      console.error(`[Apollo] Search failed ${searchRes.status}: ${err.slice(0, 200)}`);
      return null;
    }

    const searchData = await searchRes.json() as any;
    const people = searchData?.people || [];

    if (people.length === 0) {
      console.log(`[Apollo] No contacts found for ${companyName}`);
      return null;
    }

    // Pick the best match - prefer has_email = true
    const withEmail = people.filter((p: any) => p.has_email);
    const best = withEmail[0] || people[0];

    console.log(`[Apollo] Found candidate at ${companyName}: ${best.first_name} ${best.last_name_obfuscated} (${best.title})`);

    // Step 2: Enrich to get full details including email (costs 1 credit)
    const enrichRes = await fetch("https://api.apollo.io/api/v1/people/match", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        id: best.id,
        reveal_personal_emails: false,
        reveal_phone_number: false,
      }),
    });

    if (!enrichRes.ok) {
      // Enrichment failed - return basic info without email
      console.warn(`[Apollo] Enrichment failed for ${best.first_name}, returning basic info`);
      return {
        first_name: best.first_name || "",
        last_name: best.last_name_obfuscated?.replace(/\*/g, "") || "",
        email: "",
        title: best.title || "",
        linkedin_url: "",
        seniority: best.seniority || "",
      };
    }

    const enrichData = await enrichRes.json() as any;
    const person = enrichData?.person || enrichData;

    console.log(`[Apollo] Enriched: ${person.first_name} ${person.last_name} <${person.email}>`);

    return {
      first_name: person.first_name || best.first_name || "",
      last_name: person.last_name || "",
      email: person.email || "",
      title: person.title || best.title || "",
      linkedin_url: person.linkedin_url || "",
      seniority: person.seniority || "",
    };
  } catch (err) {
    console.error(`[Apollo] Error for ${companyName}:`, err);
    return null;
  }
}
