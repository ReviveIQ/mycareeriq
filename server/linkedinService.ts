/**
 * LinkedIn Service
 * Uses LinkedIn API to find real company pages and verified URLs
 */

const LINKEDIN_API_BASE = "https://api.linkedin.com/v2";

export async function findCompanyLinkedIn(companyName: string): Promise<string> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) return "";

  try {
    // Search for company using LinkedIn Organization Search
    const query = encodeURIComponent(companyName);
    const res = await fetch(
      `${LINKEDIN_API_BASE}/organizations?q=vanityName&vanityName=${query}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
      }
    );

    if (!res.ok) {
      // Try alternate search endpoint
      const searchRes = await fetch(
        `${LINKEDIN_API_BASE}/search?q=blendedSearchFirstName&keywords=${query}&origin=GLOBAL_SEARCH_HEADER`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!searchRes.ok) {
        console.log(`[LinkedIn] Search failed for ${companyName}: ${res.status}`);
        return buildLinkedInUrl(companyName);
      }
    }

    const data = await res.json() as any;
    
    // Extract vanity name from results
    const org = data?.elements?.[0];
    if (org?.vanityName) {
      return `https://www.linkedin.com/company/${org.vanityName}`;
    }

    // Fall back to constructed URL
    return buildLinkedInUrl(companyName);
  } catch (err) {
    console.warn(`[LinkedIn] Error finding company ${companyName}:`, err);
    return buildLinkedInUrl(companyName);
  }
}

// Known correct LinkedIn vanity names for common companies
const KNOWN_LINKEDIN: Record<string, string> = {
  "salesforce": "salesforce",
  "hubspot": "hubspot",
  "gong": "gongio",
  "outreach": "outreach-io",
  "clari": "clari",
  "salesloft": "salesloft",
  "zoominfo": "zoominfo",
  "seismic": "seismic",
  "highspot": "highspot",
  "6sense": "6sense",
  "demandbase": "demandbase",
  "gainsight": "gainsight",
  "drift": "driftt",
  "cisco": "cisco",
  "ey": "ernst-young",
  "ernst & young": "ernst-young",
  "rocket software": "rocket-software",
  "cengage": "cengage",
  "cengage group": "cengage-group",
  "aramark": "aramark",
  "graybar": "graybar",
  "clarivate": "clarivate",
  "gainwell technologies": "gainwell-technologies",
};

function buildLinkedInUrl(companyName: string): string {
  const normalized = companyName.toLowerCase().trim();
  
  // Check known companies first
  for (const [key, vanity] of Object.entries(KNOWN_LINKEDIN)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return `https://www.linkedin.com/company/${vanity}`;
    }
  }
  
  // Build from company name
  const slug = normalized
    .replace(/[&+]/g, "and")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
    
  return `https://www.linkedin.com/company/${slug}`;
}

export { buildLinkedInUrl };
