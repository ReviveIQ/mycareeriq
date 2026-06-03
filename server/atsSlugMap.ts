/**
 * Verified ATS Slug Map
 *
 * Hardcoded ground truth for company → ATS + slug.
 * Verified against live board endpoints.
 *
 * To verify a new company:
 *   Greenhouse: curl https://boards-api.greenhouse.io/v1/boards/{slug}/jobs → 200
 *   Lever:      curl https://api.lever.co/v0/postings/{slug}?mode=json      → JSON array
 *   Ashby:      curl https://api.ashbyhq.com/posting-api/job-board/{slug}   → { jobs: [...] }
 */

export type AtsType = "greenhouse" | "lever" | "ashby" | "skip";

export interface VerifiedCompany {
  name: string;
  domain: string;
  ats: AtsType;
  slug: string;
  category: string;
}

// ── Greenhouse (boards-api.greenhouse.io) ─────────────────────────────────────
export const VERIFIED_GREENHOUSE: VerifiedCompany[] = [
  // Confirmed working in production (Railway logs)
  { name: "Salesloft", domain: "salesloft.com", ats: "greenhouse", slug: "salesloft", category: "Sales Engagement" },
  { name: "ZoomInfo", domain: "zoominfo.com", ats: "greenhouse", slug: "zoominfo", category: "Sales Intelligence" },

  // CRM & Sales
  { name: "HubSpot", domain: "hubspot.com", ats: "greenhouse", slug: "hubspot", category: "CRM" },
  { name: "Apollo.io", domain: "apollo.io", ats: "greenhouse", slug: "apolloio", category: "Sales Intelligence" },
  { name: "Outreach", domain: "outreach.io", ats: "greenhouse", slug: "outreach", category: "Sales Engagement" },
  { name: "Gong", domain: "gong.io", ats: "greenhouse", slug: "gong", category: "Revenue Intelligence" },
  { name: "Clari", domain: "clari.com", ats: "greenhouse", slug: "clari", category: "Revenue Intelligence" },
  { name: "Demandbase", domain: "demandbase.com", ats: "greenhouse", slug: "demandbase", category: "Account-Based Marketing" },
  { name: "LeanData", domain: "leandata.com", ats: "greenhouse", slug: "leandata", category: "Revenue Operations" },
  { name: "Bombora", domain: "bombora.com", ats: "greenhouse", slug: "bombora", category: "Sales Intelligence" },
  { name: "Chili Piper", domain: "chilipiper.com", ats: "greenhouse", slug: "chili-piper", category: "Revenue Operations" },

  // Sales Enablement
  { name: "Seismic", domain: "seismic.com", ats: "greenhouse", slug: "seismicsoftware", category: "Sales Enablement" },
  { name: "Highspot", domain: "highspot.com", ats: "greenhouse", slug: "highspot", category: "Sales Enablement" },
  { name: "Mindtickle", domain: "mindtickle.com", ats: "greenhouse", slug: "mindtickle", category: "Sales Enablement" },
  { name: "Showpad", domain: "showpad.com", ats: "greenhouse", slug: "showpad", category: "Sales Enablement" },
  { name: "Allego", domain: "allego.com", ats: "greenhouse", slug: "allego", category: "Sales Enablement" },
  { name: "WorkRamp", domain: "workramp.com", ats: "greenhouse", slug: "workramp2", category: "Sales Enablement" },
  { name: "Spekit", domain: "spekit.com", ats: "greenhouse", slug: "spekit", category: "Sales Enablement" },

  // Marketing & Growth
  { name: "Klaviyo", domain: "klaviyo.com", ats: "greenhouse", slug: "klaviyo", category: "Marketing Automation" },
  { name: "Braze", domain: "braze.com", ats: "greenhouse", slug: "braze", category: "Marketing Automation" },
  { name: "Drift", domain: "drift.com", ats: "greenhouse", slug: "drift", category: "Marketing Automation" },

  // Customer Success & Support
  { name: "Gainsight", domain: "gainsight.com", ats: "greenhouse", slug: "gainsight", category: "Customer Success" },
  { name: "Medallia", domain: "medallia.com", ats: "greenhouse", slug: "medallia", category: "Customer Experience" },
  { name: "Qualtrics", domain: "qualtrics.com", ats: "greenhouse", slug: "qualtrics", category: "Customer Experience" },
  { name: "Kustomer", domain: "kustomer.com", ats: "greenhouse", slug: "kustomer", category: "Customer Support" },
  { name: "Intercom", domain: "intercom.com", ats: "greenhouse", slug: "intercom", category: "Customer Support" },
  { name: "Zendesk", domain: "zendesk.com", ats: "greenhouse", slug: "zendesk", category: "Customer Support" },

  // Data & Analytics
  { name: "Mixpanel", domain: "mixpanel.com", ats: "greenhouse", slug: "mixpanel", category: "Data & Analytics" },
  { name: "G2", domain: "g2.com", ats: "greenhouse", slug: "g2crowd", category: "B2B SaaS" },

  // Collaboration & Productivity
  { name: "Loom", domain: "loom.com", ats: "greenhouse", slug: "loom", category: "Collaboration" },
  { name: "Lattice", domain: "lattice.com", ats: "greenhouse", slug: "lattice", category: "HR Technology" },
  { name: "Figma", domain: "figma.com", ats: "greenhouse", slug: "figma", category: "Collaboration" },
  { name: "Notion", domain: "notion.so", ats: "greenhouse", slug: "notion", category: "Productivity" },

  // HR Tech
  { name: "Paychex", domain: "paychex.com", ats: "greenhouse", slug: "paychex", category: "HR Technology" },
  { name: "Deel", domain: "letsdeel.com", ats: "greenhouse", slug: "deel", category: "HR Technology" },
  { name: "Remote", domain: "remote.com", ats: "greenhouse", slug: "remotecom", category: "HR Technology" },

  // Legal & Compliance
  { name: "Ironclad", domain: "ironcladapp.com", ats: "greenhouse", slug: "ironclad", category: "Legal Tech" },

  // Procurement & Finance
  { name: "Vendr", domain: "vendr.com", ats: "greenhouse", slug: "vendr", category: "B2B SaaS" },
  { name: "Zip", domain: "ziphq.com", ats: "greenhouse", slug: "zip", category: "B2B SaaS" },

  // Developer Tools
  { name: "Merge", domain: "merge.dev", ats: "greenhouse", slug: "merge", category: "Developer Tools" },
  { name: "Chorus.ai", domain: "chorus.ai", ats: "greenhouse", slug: "chorus", category: "Revenue Intelligence" },
  { name: "Secureframe", domain: "secureframe.com", ats: "greenhouse", slug: "secureframe", category: "Cybersecurity" },
];

// ── Lever (api.lever.co) ──────────────────────────────────────────────────────
// NOTE: Many companies GPT suggested as Lever have moved or never used it.
// Only add entries confirmed via live API call.
export const VERIFIED_LEVER: VerifiedCompany[] = [
  // Add confirmed Lever companies here after live verification
];

// ── Ashby (api.ashbyhq.com) ───────────────────────────────────────────────────
// Growth-stage SaaS companies that don't appear on Greenhouse/Lever boards.
// These were failing as Greenhouse (404s in Railway logs) — now correctly on Ashby.
export const VERIFIED_ASHBY: VerifiedCompany[] = [
  // Previously failing as Greenhouse — now on Ashby
  { name: "Rippling", domain: "rippling.com", ats: "ashby", slug: "rippling", category: "HR Technology" },
  { name: "Vanta", domain: "vanta.com", ats: "ashby", slug: "vanta", category: "Cybersecurity" },
  { name: "Drata", domain: "drata.com", ats: "ashby", slug: "drata", category: "Cybersecurity" },

  // Growth-stage SaaS on Ashby
  { name: "Ramp", domain: "ramp.com", ats: "ashby", slug: "ramp", category: "FinTech" },
  { name: "Brex", domain: "brex.com", ats: "ashby", slug: "brex", category: "FinTech" },
  { name: "Retool", domain: "retool.com", ats: "ashby", slug: "retool", category: "Developer Tools" },
  { name: "Linear", domain: "linear.app", ats: "ashby", slug: "linear", category: "Productivity" },
  { name: "Vercel", domain: "vercel.com", ats: "ashby", slug: "vercel", category: "Developer Tools" },
  { name: "Lasso", domain: "lassoapp.com", ats: "ashby", slug: "lasso", category: "Revenue Operations" },
  { name: "Unify", domain: "unifygtm.com", ats: "ashby", slug: "unify", category: "Revenue Operations" },
  { name: "Warmly", domain: "warmly.ai", ats: "ashby", slug: "warmly", category: "Revenue Intelligence" },
  { name: "Common Room", domain: "commonroom.io", ats: "ashby", slug: "commonroom", category: "Revenue Intelligence" },
  { name: "Lusha", domain: "lusha.com", ats: "ashby", slug: "lusha", category: "Sales Intelligence" },
  { name: "Qualified", domain: "qualified.com", ats: "ashby", slug: "qualified", category: "Revenue Intelligence" },
  { name: "Mutiny", domain: "mutinyhq.com", ats: "ashby", slug: "mutiny", category: "Marketing Automation" },
  { name: "Pocus", domain: "pocus.com", ats: "ashby", slug: "pocus", category: "Revenue Operations" },
  { name: "Goldcast", domain: "goldcast.io", ats: "ashby", slug: "goldcast", category: "Marketing Automation" },
  { name: "Clearbit", domain: "clearbit.com", ats: "ashby", slug: "clearbit", category: "Sales Intelligence" },
  { name: "Crossbeam", domain: "crossbeam.com", ats: "ashby", slug: "crossbeam", category: "Revenue Operations" },
  { name: "Workato", domain: "workato.com", ats: "ashby", slug: "workato", category: "B2B SaaS" },
  { name: "Fivetran", domain: "fivetran.com", ats: "ashby", slug: "fivetran", category: "Data & Analytics" },
  { name: "dbt Labs", domain: "getdbt.com", ats: "ashby", slug: "dbtlabs", category: "Data & Analytics" },
  { name: "Hex", domain: "hex.tech", ats: "ashby", slug: "hex", category: "Data & Analytics" },
  { name: "Airbyte", domain: "airbyte.com", ats: "ashby", slug: "airbyte", category: "Data & Analytics" },
  { name: "Census", domain: "getcensus.com", ats: "ashby", slug: "census", category: "Revenue Operations" },
  { name: "Hightouch", domain: "hightouch.com", ats: "ashby", slug: "hightouch", category: "Revenue Operations" },
  { name: "Persona", domain: "withpersona.com", ats: "ashby", slug: "persona", category: "B2B SaaS" },
  { name: "Navattic", domain: "navattic.com", ats: "ashby", slug: "navattic", category: "Sales Enablement" },
  { name: "Tourial", domain: "tourial.com", ats: "ashby", slug: "tourial", category: "Sales Enablement" },
];

// ── Lookup infrastructure ─────────────────────────────────────────────────────
const VERIFIED_MAP = new Map<string, VerifiedCompany>();
for (const co of [...VERIFIED_GREENHOUSE, ...VERIFIED_LEVER, ...VERIFIED_ASHBY]) {
  VERIFIED_MAP.set(co.name.toLowerCase(), co);
  const stem = co.domain.split(".")[0].toLowerCase();
  if (!VERIFIED_MAP.has(stem)) VERIFIED_MAP.set(stem, co);
}

export function lookupVerifiedCompany(nameOrDomain: string): VerifiedCompany | null {
  const key = nameOrDomain.toLowerCase().trim();
  if (VERIFIED_MAP.has(key)) return VERIFIED_MAP.get(key)!;
  for (const [mapKey, entry] of Array.from(VERIFIED_MAP.entries())) {
    if (key.includes(mapKey) || mapKey.includes(key)) return entry;
  }
  return null;
}

export function greenhouseBoardUrl(slug: string, keyword?: string): string {
  const base = `https://boards.greenhouse.io/${slug}`;
  return keyword ? `${base}/jobs?q=${encodeURIComponent(keyword)}` : `${base}/jobs`;
}

export function leverBoardUrl(slug: string): string {
  return `https://jobs.lever.co/${slug}?department=Sales`;
}

export function ashbyBoardUrl(slug: string): string {
  return `https://jobs.ashbyhq.com/${slug}`;
}

/**
 * Get a shuffled subset of verified companies for discovery.
 * Draws from all three ATS pools for variety.
 */
export function getVerifiedCompaniesForDiscovery(count: number): VerifiedCompany[] {
  const pool = [...VERIFIED_GREENHOUSE, ...VERIFIED_LEVER, ...VERIFIED_ASHBY];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
