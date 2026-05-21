import { AXIOS_TIMEOUT_MS } from "@shared/const";

/**
 * Hunter.io API response for email search
 */
export interface HunterEmailResult {
  email: string;
  score: number; // 0-100 confidence score
  sources: Array<{
    domain: string;
    uri: string;
    extracted_on: string;
  }>;
  first_name?: string;
  last_name?: string;
  position?: string;
  company?: string;
  linkedin_url?: string;
  phone_number?: string;
  type: "personal" | "generic" | "role-based" | "catchall";
}

export interface HunterSearchResponse {
  data: {
    emails: HunterEmailResult[];
    domain: string;
    organization: string;
    country?: string;
    type?: string;
    disposable?: boolean;
    webmail?: boolean;
    accept_all?: boolean;
    pattern?: string;
    from_cache?: boolean;
  };
  meta: {
    results: number;
    limit: number;
    offset: number;
    params: Record<string, any>;
  };
}

/**
 * Search for email addresses using Hunter.io API
 * @param firstName First name of the person
 * @param lastName Last name of the person
 * @param domain Company domain (e.g., "gong.io")
 * @returns Array of email results with confidence scores
 */
export async function searchEmailsWithHunter(
  firstName: string,
  lastName: string,
  domain: string
): Promise<HunterEmailResult[]> {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) {
    throw new Error("HUNTER_API_KEY not configured");
  }

  try {
    const params = new URLSearchParams({
      domain,
      first_name: firstName,
      last_name: lastName,
      limit: "10",
    });

    const response = await fetch(`https://api.hunter.io/v2/email-finder?${params}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(AXIOS_TIMEOUT_MS),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Hunter.io API key is invalid");
      }
      if (response.status === 429) {
        throw new Error("Hunter.io rate limit exceeded");
      }
      throw new Error(`Hunter.io API error: ${response.status}`);
    }

    const data = (await response.json()) as HunterSearchResponse;

    if (!data.data || !data.data.emails) {
      return [];
    }

    // Sort by confidence score (highest first)
    return data.data.emails.sort((a, b) => b.score - a.score);
  } catch (error) {
    console.error("[HunterService] Email search error:", error);
    throw error;
  }
}

/**
 * Get domain information from Hunter.io
 * @param domain Company domain (e.g., "gong.io")
 * @returns Domain information including company name and type
 */
export async function getDomainInfo(domain: string) {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) {
    throw new Error("HUNTER_API_KEY not configured");
  }

  try {
    const params = new URLSearchParams({
      domain,
    });

    const response = await fetch(`https://api.hunter.io/v2/domain-search?${params}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(AXIOS_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Hunter.io domain search error: ${response.status}`);
    }

    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error("[HunterService] Domain search error:", error);
    throw error;
  }
}

/**
 * Verify if an email is valid using Hunter.io
 * @param email Email address to verify
 * @returns Verification result
 */
export async function verifyEmail(email: string) {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) {
    throw new Error("HUNTER_API_KEY not configured");
  }

  try {
    const params = new URLSearchParams({
      email,
    });

    const response = await fetch(`https://api.hunter.io/v2/email-verifier?${params}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(AXIOS_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Hunter.io email verification error: ${response.status}`);
    }

    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error("[HunterService] Email verification error:", error);
    throw error;
  }
}

/**
 * Extract domain from company name or URL
 * @param companyName Company name or domain
 * @returns Domain (e.g., "gong.io")
 */
export function extractDomain(companyName: string): string {
  // If it looks like a domain, return it
  if (companyName.includes(".")) {
    return companyName.toLowerCase();
  }

  // Otherwise, try to convert company name to domain
  // This is a simple heuristic and may not always work
  const normalized = companyName
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[&/]/g, "");

  // Common domain extensions
  const extensions = ["io", "com", "co", "ai", "app"];

  for (const ext of extensions) {
    // Try the most common extension first
    if (ext === "io" || ext === "com") {
      return `${normalized}.${ext}`;
    }
  }

  return `${normalized}.com`;
}
