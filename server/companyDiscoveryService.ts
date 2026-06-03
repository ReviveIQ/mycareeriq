/**
 * Resume-Driven Company Discovery
 *
 * Instead of a static company list, this module:
 * 1. Reads the candidate's profile from their resume
 * 2. Asks GPT to suggest target companies based on their background
 * 3. Validates each suggested company against live ATS APIs
 * 4. Returns only companies with confirmed active job boards
 *
 * This ensures every user gets a company pool matched to THEIR resume,
 * not a generic B2B SaaS list.
 */

import { VerifiedCompany } from "./atsSlugMap";

interface CandidateProfile {
  currentTitle?: string;
  seniorityLevel?: string;
  yearsExperience?: number;
  industries?: string[];
  coreSkills?: string[];
  companySizeFit?: string[];
  targetTitles?: string[];
  companiesWorkedAt?: string[];  // past employers — good signal for ecosystem
  productsOrTechSold?: string[]; // CRM, RevIntel, security, HR tech etc.
}

/**
 * Validate a Greenhouse board slug exists and has jobs.
 * Returns true only on HTTP 200.
 */
async function validateGreenhouseSlug(slug: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs`,
      { signal: AbortSignal.timeout(8000) }
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Validate an Ashby board slug exists.
 */
async function validateAshbySlug(slug: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Convert a company name to likely ATS slugs to try.
 * Companies often use their name, domain stem, or a variation.
 */
function generateSlugVariants(name: string, domain: string): string[] {
  const domainStem = domain.split(".")[0].toLowerCase();
  const nameLower = name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "");
  const nameHyphen = name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "-");
  const nameNoSpace = name.toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  // Deduplicated list of variants to try
  return Array.from(new Set([
    domainStem,
    nameLower,
    nameHyphen,
    nameNoSpace,
    `${domainStem}inc`,
    `${nameNoSpace}hq`,
  ])).filter(s => s.length >= 2);
}

/**
 * Validate a company against Greenhouse and Ashby, trying slug variants.
 * Returns the first confirmed {ats, slug} pair, or null if none work.
 */
async function validateCompanyATS(
  name: string,
  domain: string
): Promise<{ ats: "greenhouse" | "ashby"; slug: string } | null> {
  const variants = generateSlugVariants(name, domain);

  // Try Greenhouse first (larger network)
  for (const slug of variants) {
    if (await validateGreenhouseSlug(slug)) {
      console.log(`[CompanyDiscovery] ✓ Greenhouse validated: ${name} → ${slug}`);
      return { ats: "greenhouse", slug };
    }
  }

  // Try Ashby
  for (const slug of variants) {
    if (await validateAshbySlug(slug)) {
      console.log(`[CompanyDiscovery] ✓ Ashby validated: ${name} → ${slug}`);
      return { ats: "ashby", slug };
    }
  }

  console.log(`[CompanyDiscovery] ✗ No ATS found for: ${name}`);
  return null;
}

/**
 * Ask GPT to suggest target companies based on the candidate's profile.
 * Returns a list of companies with name, domain, and suggested ATS slug.
 */
async function discoverCompaniesFromProfile(
  profile: CandidateProfile,
  targetRoles: string,
  targetCategories: string,
  count: number
): Promise<Array<{ name: string; domain: string; category: string; suggestedSlug: string }>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return [];

  const profileSummary = [
    profile.currentTitle && `Current role: ${profile.currentTitle}`,
    profile.seniorityLevel && `Seniority: ${profile.seniorityLevel}`,
    profile.yearsExperience && `Experience: ${profile.yearsExperience} years`,
    profile.industries?.length && `Industries: ${profile.industries.join(", ")}`,
    profile.coreSkills?.length && `Core skills: ${profile.coreSkills.join(", ")}`,
    profile.companySizeFit?.length && `Company size: ${profile.companySizeFit.join(", ")}`,
    profile.companiesWorkedAt?.length && `Past employers: ${profile.companiesWorkedAt.join(", ")}`,
    profile.productsOrTechSold?.length && `Sold/worked with: ${profile.productsOrTechSold.join(", ")}`,
  ].filter(Boolean).join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a career advisor identifying target companies for a job candidate. Return only valid JSON. No markdown.",
        },
        {
          role: "user",
          content: `Based on this candidate's profile, suggest ${count} B2B SaaS companies that would be strong matches for their background and actively hire for their target roles.

Candidate Profile:
${profileSummary}

Target Roles: ${targetRoles}
Target Categories: ${targetCategories}

Rules:
- Match companies to the candidate's SPECIFIC background and industry expertise
- If they've sold security software, suggest security companies
- If they've sold HR tech, suggest HR tech companies  
- If they're enterprise-level, suggest enterprise-stage companies
- Include companies competitors to their past employers (they understand the space)
- Mix company sizes: some scale-ups (200-500 employees), some growth (500-2000), some enterprise (2000+)
- ONLY suggest companies that use Greenhouse or Ashby ATS (most B2B SaaS companies do)
- Include US companies known for remote or distributed sales teams
- Vary the list — don't suggest the same companies every time

For each company provide:
- The most likely Greenhouse/Ashby board slug (usually lowercase company name or domain stem)
- Example: HubSpot → "hubspot", Gong → "gong", Rippling → "rippling"

Return JSON array:
[
  {
    "name": "Gong",
    "domain": "gong.io",
    "category": "Revenue Intelligence",
    "suggestedSlug": "gong",
    "reasoning": "Candidate sold RevIntel tools, direct competitor ecosystem"
  }
]

Return ONLY the JSON array.`,
        },
      ],
      max_tokens: 2000,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    console.warn(`[CompanyDiscovery] GPT company suggestion failed: ${res.status}`);
    return [];
  }

  const data = await res.json() as any;
  const text = (data.choices?.[0]?.message?.content || "").trim()
    .replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");

  try {
    const parsed = JSON.parse(text);
    console.log(`[CompanyDiscovery] GPT suggested ${parsed.length} companies based on resume profile`);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn("[CompanyDiscovery] Failed to parse GPT company suggestions");
    return [];
  }
}

/**
 * Main export: discover and validate companies for a specific candidate.
 *
 * Process:
 * 1. GPT suggests companies based on resume profile
 * 2. Each suggestion is validated against live ATS APIs
 * 3. Only confirmed companies are returned
 * 4. Falls back to static verified map if discovery yields too few results
 */
export async function discoverCompaniesForCandidate(
  profile: CandidateProfile,
  targetRoles: string,
  targetCategories: string,
  requestedCount: number,
  fallbackCompanies: VerifiedCompany[]
): Promise<VerifiedCompany[]> {
  console.log(`[CompanyDiscovery] Discovering companies for: ${profile.currentTitle || "unknown"}`);

  // Ask GPT for company suggestions based on this specific resume
  const suggestions = await discoverCompaniesFromProfile(
    profile,
    targetRoles,
    targetCategories,
    requestedCount * 2  // Request 2x to account for validation failures
  );

  if (suggestions.length === 0) {
    console.warn("[CompanyDiscovery] No suggestions from GPT — using static fallback");
    return fallbackCompanies.slice(0, requestedCount);
  }

  // Validate each suggestion against live ATS APIs
  // Run validations in batches of 5 to avoid overwhelming the APIs
  const validated: VerifiedCompany[] = [];
  const batchSize = 5;

  for (let i = 0; i < suggestions.length && validated.length < requestedCount; i += batchSize) {
    const batch = suggestions.slice(i, i + batchSize);

    const results = await Promise.all(
      batch.map(async (suggestion) => {
        // Try the suggested slug first
        const suggestedSlugWorks =
          await validateGreenhouseSlug(suggestion.suggestedSlug) ||
          await validateAshbySlug(suggestion.suggestedSlug);

        if (suggestedSlugWorks) {
          const ats = await validateGreenhouseSlug(suggestion.suggestedSlug)
            ? "greenhouse" as const
            : "ashby" as const;
          return {
            name: suggestion.name,
            domain: suggestion.domain,
            ats,
            slug: suggestion.suggestedSlug,
            category: suggestion.category,
          } as VerifiedCompany;
        }

        // Try slug variants if suggested slug failed
        const found = await validateCompanyATS(suggestion.name, suggestion.domain);
        if (found) {
          return {
            name: suggestion.name,
            domain: suggestion.domain,
            ats: found.ats,
            slug: found.slug,
            category: suggestion.category,
          } as VerifiedCompany;
        }

        return null;
      })
    );

    for (const result of results) {
      if (result && validated.length < requestedCount) {
        validated.push(result);
      }
    }

    console.log(`[CompanyDiscovery] Validated ${validated.length}/${requestedCount} companies so far`);
  }

  // Supplement with static fallback if we didn't get enough validated companies
  if (validated.length < requestedCount) {
    const needed = requestedCount - validated.length;
    const validatedNames = new Set(validated.map(c => c.name.toLowerCase()));
    const supplement = fallbackCompanies
      .filter(c => !validatedNames.has(c.name.toLowerCase()))
      .slice(0, needed);

    console.log(`[CompanyDiscovery] Supplementing with ${supplement.length} static fallback companies`);
    validated.push(...supplement);
  }

  console.log(`[CompanyDiscovery] Final company pool: ${validated.length} companies`);
  return validated;
}
