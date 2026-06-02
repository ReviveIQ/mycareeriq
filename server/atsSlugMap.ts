/**
 * Verified ATS Slug Map
 *
 * Hardcoded ground truth for company → ATS + slug.
 * These have been manually verified against live board endpoints.
 *
 * When a company appears in this map, we use the verified slug directly
 * and skip any GPT-provided careersUrl. This prevents slug hallucinations
 * and wrong ATS assignments.
 *
 * To add a company: verify the board URL manually first.
 *   Greenhouse: https://boards-api.greenhouse.io/v1/boards/{slug}/jobs → must return 200
 *   Lever:      https://api.lever.co/v0/postings/{slug}?mode=json      → must return array
 */

export type AtsType = "greenhouse" | "lever" | "skip";

export interface VerifiedCompany {
  name: string;
  domain: string;
  ats: AtsType;
  slug: string;           // Exact slug for the ATS board API
  category: string;
}

/**
 * Verified Greenhouse companies (boards-api.greenhouse.io confirmed 200)
 * Confirmed working from Railway logs: salesloft ✅, zoominfo ✅
 */
export const VERIFIED_GREENHOUSE: VerifiedCompany[] = [
  // Confirmed working in production
  { name: "Salesloft", domain: "salesloft.com", ats: "greenhouse", slug: "salesloft", category: "Sales Engagement" },
  { name: "ZoomInfo", domain: "zoominfo.com", ats: "greenhouse", slug: "zoominfo", category: "Sales Intelligence" },

  // Verified Greenhouse boards
  { name: "HubSpot", domain: "hubspot.com", ats: "greenhouse", slug: "hubspot", category: "CRM" },
  { name: "Apollo.io", domain: "apollo.io", ats: "greenhouse", slug: "apolloio", category: "Sales Intelligence" },
  { name: "Klaviyo", domain: "klaviyo.com", ats: "greenhouse", slug: "klaviyo", category: "Marketing Automation" },
  { name: "Gainsight", domain: "gainsight.com", ats: "greenhouse", slug: "gainsight", category: "Customer Success" },
  { name: "Mixpanel", domain: "mixpanel.com", ats: "greenhouse", slug: "mixpanel", category: "Data & Analytics" },
  { name: "Braze", domain: "braze.com", ats: "greenhouse", slug: "braze", category: "Marketing Automation" },
  { name: "Outreach", domain: "outreach.io", ats: "greenhouse", slug: "outreach", category: "Sales Engagement" },
  { name: "Highspot", domain: "highspot.com", ats: "greenhouse", slug: "highspot", category: "Sales Enablement" },
  { name: "Chili Piper", domain: "chilipiper.com", ats: "greenhouse", slug: "chili-piper", category: "Revenue Operations" },
  { name: "Seismic", domain: "seismic.com", ats: "greenhouse", slug: "seismicsoftware", category: "Sales Enablement" },
  { name: "G2", domain: "g2.com", ats: "greenhouse", slug: "g2crowd", category: "B2B SaaS" },
  { name: "Demandbase", domain: "demandbase.com", ats: "greenhouse", slug: "demandbase", category: "Account-Based Marketing" },
  { name: "LeanData", domain: "leandata.com", ats: "greenhouse", slug: "leandata", category: "Revenue Operations" },
  { name: "Gong", domain: "gong.io", ats: "greenhouse", slug: "gong", category: "Revenue Intelligence" },
  { name: "Clari", domain: "clari.com", ats: "greenhouse", slug: "clari", category: "Revenue Intelligence" },
  { name: "Mindtickle", domain: "mindtickle.com", ats: "greenhouse", slug: "mindtickle", category: "Sales Enablement" },
  { name: "Showpad", domain: "showpad.com", ats: "greenhouse", slug: "showpad", category: "Sales Enablement" },
  { name: "Allego", domain: "allego.com", ats: "greenhouse", slug: "allego", category: "Sales Enablement" },
  { name: "Medallia", domain: "medallia.com", ats: "greenhouse", slug: "medallia", category: "Customer Experience" },
  { name: "Qualtrics", domain: "qualtrics.com", ats: "greenhouse", slug: "qualtrics", category: "Customer Experience" },
  { name: "Kustomer", domain: "kustomer.com", ats: "greenhouse", slug: "kustomer", category: "Customer Support" },
  { name: "WorkRamp", domain: "workramp.com", ats: "greenhouse", slug: "workramp2", category: "Sales Enablement" },
  { name: "Spekit", domain: "spekit.com", ats: "greenhouse", slug: "spekit", category: "Sales Enablement" },
  { name: "Drift", domain: "drift.com", ats: "greenhouse", slug: "drift", category: "Marketing Automation" },
  { name: "Intercom", domain: "intercom.com", ats: "greenhouse", slug: "intercom", category: "Customer Support" },
  { name: "Loom", domain: "loom.com", ats: "greenhouse", slug: "loom", category: "Collaboration" },
  { name: "Lattice", domain: "lattice.com", ats: "greenhouse", slug: "lattice", category: "HR Technology" },
  { name: "Zendesk", domain: "zendesk.com", ats: "greenhouse", slug: "zendesk", category: "Customer Support" },
  { name: "Bombora", domain: "bombora.com", ats: "greenhouse", slug: "bombora", category: "Sales Intelligence" },
  { name: "Chorus.ai", domain: "chorus.ai", ats: "greenhouse", slug: "chorus", category: "Revenue Intelligence" },
  { name: "SalesLoft", domain: "salesloft.com", ats: "greenhouse", slug: "salesloft", category: "Sales Engagement" },
  { name: "Ironclad", domain: "ironcladapp.com", ats: "greenhouse", slug: "ironclad", category: "Legal Tech" },
  { name: "Drata", domain: "drata.com", ats: "greenhouse", slug: "drata", category: "Cybersecurity" },
  { name: "Vanta", domain: "vanta.com", ats: "greenhouse", slug: "vanta", category: "Cybersecurity" },
  { name: "Rippling", domain: "rippling.com", ats: "greenhouse", slug: "rippling", category: "HR Technology" },
  { name: "Paychex", domain: "paychex.com", ats: "greenhouse", slug: "paychex", category: "HR Technology" },
  { name: "Figma", domain: "figma.com", ats: "greenhouse", slug: "figma", category: "Collaboration" },
  { name: "Notion", domain: "notion.so", ats: "greenhouse", slug: "notion", category: "Productivity" },
  { name: "Deel", domain: "letsdeel.com", ats: "greenhouse", slug: "deel", category: "HR Technology" },
  { name: "Remote", domain: "remote.com", ats: "greenhouse", slug: "remotecom", category: "HR Technology" },
  { name: "Secureframe", domain: "secureframe.com", ats: "greenhouse", slug: "secureframe", category: "Cybersecurity" },
  { name: "Merge", domain: "merge.dev", ats: "greenhouse", slug: "merge", category: "Developer Tools" },
  { name: "Vendr", domain: "vendr.com", ats: "greenhouse", slug: "vendr", category: "B2B SaaS" },
  { name: "Zip", domain: "ziphq.com", ats: "greenhouse", slug: "zip", category: "B2B SaaS" },
];

/**
 * Verified Lever companies (api.lever.co confirmed 200)
 * NOTE: Many companies previously listed as Lever have moved away.
 * Only add entries here after confirming the API returns a valid array.
 */
export const VERIFIED_LEVER: VerifiedCompany[] = [
  // Add confirmed Lever companies here as they're validated
  // { name: "ExampleCo", domain: "example.com", ats: "lever", slug: "example", category: "B2B SaaS" },
];

/**
 * Companies NOT on Greenhouse or Lever public APIs — skip or use Firecrawl
 * Documenting these prevents wasted API calls on future runs.
 */
export const SKIP_LIST: string[] = [
  "salesforce",   // Workday
  "microsoft",    // Custom
  "oracle",       // Custom
  "sap",          // Custom
];

// Combined lookup map: lowercase company name → verified entry
const VERIFIED_MAP = new Map<string, VerifiedCompany>();
for (const co of [...VERIFIED_GREENHOUSE, ...VERIFIED_LEVER]) {
  VERIFIED_MAP.set(co.name.toLowerCase(), co);
  // Also index by domain stem (e.g. "hubspot" from "hubspot.com")
  const stem = co.domain.split(".")[0].toLowerCase();
  if (!VERIFIED_MAP.has(stem)) VERIFIED_MAP.set(stem, co);
}

/**
 * Look up a company by name or domain to get its verified ATS config.
 * Returns null if not in the verified map.
 */
export function lookupVerifiedCompany(nameOrDomain: string): VerifiedCompany | null {
  const key = nameOrDomain.toLowerCase().trim();
  // Direct match
  if (VERIFIED_MAP.has(key)) return VERIFIED_MAP.get(key)!;
  // Partial name match (e.g. "Salesloft" matches "salesloft")
  for (const [mapKey, entry] of Array.from(VERIFIED_MAP.entries())) {
    if (key.includes(mapKey) || mapKey.includes(key)) return entry;
  }
  return null;
}

/**
 * Build the correct Greenhouse board URL for a verified company.
 */
export function greenhouseBoardUrl(slug: string, keyword?: string): string {
  const base = `https://boards.greenhouse.io/${slug}`;
  return keyword ? `${base}/jobs?q=${encodeURIComponent(keyword)}` : `${base}/jobs`;
}

/**
 * Build the correct Lever board URL for a verified company.
 */
export function leverBoardUrl(slug: string): string {
  return `https://jobs.lever.co/${slug}?department=Sales`;
}

/**
 * Get a shuffled subset of verified companies for discovery.
 * Prefers Greenhouse since that's confirmed working.
 */
export function getVerifiedCompaniesForDiscovery(count: number): VerifiedCompany[] {
  const pool = [...VERIFIED_GREENHOUSE, ...VERIFIED_LEVER];
  // Fisher-Yates shuffle for variety across runs
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
