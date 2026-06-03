import { getDb } from "./db";
import { findHiringManager, findJobPoster } from "./apolloService";
import { findCompanyLinkedIn } from "./linkedinService";
import { companies, researchConfig } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { fetchGreenhouseJobs } from "./greenhouseService";
import { fetchLeverJobs } from "./leverService";
import { fetchAshbyJobs } from "./ashbyService";
import { getVerifiedCompaniesForDiscovery, VerifiedCompany } from "./atsSlugMap";

export interface GeneratedJob {
  companyName: string;
  companyId: string;
  jobTitle: string;
  category: string;
  contactName: string;
  contactEmail: string;
  linkedinUrl: string;
  jobDescription: string;
  jobLink: string;
  salary: string;
  remote: boolean;
  priority: "High" | "Medium" | "Low";
  source: string;
  contactLinkedIn: string;
  fitScore?: number;
}

// ── Category taxonomy ─────────────────────────────────────────────────────────
const STANDARD_CATEGORIES: Record<string, string> = {
  "crm": "CRM", "customer relationship management": "CRM",
  "sales engagement": "Sales Engagement", "sales enablement": "Sales Enablement",
  "sales intelligence": "Sales Intelligence", "revenue intelligence": "Revenue Intelligence",
  "conversation intelligence": "Revenue Intelligence", "revenue operations": "Revenue Operations",
  "revops": "Revenue Operations", "marketing automation": "Marketing Automation",
  "account-based marketing": "Account-Based Marketing", "abm": "Account-Based Marketing",
  "customer success": "Customer Success", "customer experience": "Customer Experience",
  "customer support": "Customer Support", "hr tech": "HR Technology",
  "hr technology": "HR Technology", "data analytics": "Data & Analytics",
  "cybersecurity": "Cybersecurity", "fintech": "FinTech",
  "billing": "Billing & Payments", "edtech": "EdTech",
  "b2b saas": "B2B SaaS", "enterprise software": "Enterprise Software",
};

function standardizeCategory(raw: string): string {
  const lower = (raw || "").toLowerCase().trim();
  if (STANDARD_CATEGORIES[lower]) return STANDARD_CATEGORIES[lower];
  for (const [key, value] of Object.entries(STANDARD_CATEGORIES)) {
    if (lower.includes(key) || key.includes(lower)) return value;
  }
  return raw.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getPriority(title: string): "High" | "Medium" | "Low" {
  const t = title.toLowerCase();
  if (t.includes("vp") || t.includes("vice president") || t.includes("director") || t.includes("senior")) return "High";
  if (t.includes("manager") || t.includes("lead") || t.includes("head")) return "Medium";
  return "Low";
}

// ── Step 1: Extract candidate profile from resume ────────────────────────────
// Runs once per research session. Returns a compact profile string used to
// score every job for fit. No GPT call if resume is missing.
async function extractCandidateProfile(parsedResume: any): Promise<string> {
  if (!parsedResume) return "";

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "";

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a resume analyst. Return only a compact JSON object. No markdown." },
          {
            role: "user",
            content: `Analyze this resume and extract the candidate's professional profile.

Resume data: ${JSON.stringify(parsedResume).slice(0, 4000)}

Return JSON only:
{
  "name": "string",
  "currentTitle": "most recent job title",
  "seniorityLevel": "IC | Manager | Director | VP | C-Suite",
  "yearsExperience": number,
  "industries": ["list", "of", "industries"],
  "coreSkills": ["top 5 skills"],
  "companySizeFit": ["SMB", "Mid-Market", "Enterprise"] (which sizes based on their history),
  "targetTitles": ["3-5 realistic next-step titles for this person"],
  "notAFit": ["titles clearly too junior or senior to suggest"]
}`
          }
        ],
        max_tokens: 500,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return "";
    const data = await res.json() as any;
    const text = (data.choices?.[0]?.message?.content || "").trim()
      .replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    const profile = JSON.parse(text);
    console.log(`[JobResearch] Candidate profile: ${profile.currentTitle}, ${profile.seniorityLevel}, ${profile.yearsExperience}yr`);
    return JSON.stringify(profile);
  } catch (err) {
    console.warn("[JobResearch] Profile extraction failed:", err);
    return "";
  }
}

// ── Step 2: Fetch ALL jobs from a company ATS board ──────────────────────────
// Returns raw jobs with real job IDs and absolute URLs. No filtering here —
// fit scoring handles that in Step 3.
interface RawJob {
  title: string;
  description: string;
  url: string;        // real job URL with actual job ID from ATS
  salary: string;
  remote: boolean;
  jobId: string;      // ATS-native job ID (e.g. "8044511")
  location: string;   // raw location string — used for country filtering
}

async function fetchAllJobsFromCompany(
  company: VerifiedCompany,
  targetRoles: string
): Promise<RawJob[]> {
  const keyword = targetRoles.split(",")[0].trim();

  try {
    if (company.ats === "greenhouse") {
      const jobs = await fetchGreenhouseJobs(company.slug, keyword);
      return jobs.map(j => {
        const idMatch = j.url.match(/\/jobs\/(\d+)/);
        return {
          title: j.title,
          description: j.description,
          url: j.url,
          salary: j.salary,
          remote: j.remote,
          jobId: idMatch?.[1] || String(j.url.split("/").pop() || ""),
          location: j.location || "",
        };
      });
    }

    if (company.ats === "lever") {
      const jobs = await fetchLeverJobs(company.slug, keyword);
      return jobs.map(j => {
        const idMatch = j.url.match(/lever\.co\/[^/]+\/([a-f0-9-]{36})/);
        return {
          title: j.title,
          description: j.description,
          url: j.url,
          salary: j.salary,
          remote: j.remote,
          jobId: idMatch?.[1] || "",
          location: j.location || "",
        };
      });
    }

    if (company.ats === "ashby") {
      const jobs = await fetchAshbyJobs(company.slug, keyword);
      return jobs.map(j => ({
        title: j.title,
        description: j.description,
        url: j.url,
        salary: j.salary,
        remote: j.remote,
        jobId: j.jobId,
        location: j.location || "",
      }));
    }
  } catch (err) {
    console.warn(`[JobResearch] Failed to fetch from ${company.name}:`, err);
  }

  return [];
}

// ── Step 3: Fit-score all jobs against candidate profile ─────────────────────
// Single GPT call scores all candidates' jobs across all companies at once.
// Returns only jobs with score >= 7, capped at 1 per company (best fit wins).
interface ScoredJob extends RawJob {
  companyName: string;
  companySlug: string;
  companyDomain: string;
  category: string;
  ats: string;
  fitScore: number;
  fitReason: string;
}

type RawJobWithCompany = RawJob & {
  companyName: string;
  companySlug: string;
  companyDomain: string;
  category: string;
  ats: string;
};

async function scoreJobsForFit(
  rawJobs: RawJobWithCompany[],
  candidateProfile: string,
  targetRoles: string
): Promise<ScoredJob[]> {
  if (rawJobs.length === 0) return [];

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return rawJobs.map(j => ({ ...j, fitScore: 7, fitReason: "unscored" }));
  }

  // Build compact job list for scoring (title + company + first 150 chars of description)
  const jobList = rawJobs.map((j, i) => ({
    idx: i,
    company: j.companyName,
    title: j.title,
    desc: j.description.slice(0, 150),
    remote: j.remote,
  }));

  console.log(`[JobResearch] Fit-scoring ${rawJobs.length} jobs against candidate profile...`);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a job-fit evaluator. Return only valid JSON. No markdown." },
          {
            role: "user",
            content: `Score each job for fit against this candidate profile.

Candidate profile:
${candidateProfile || `Searching for: ${targetRoles}`}

Jobs to score:
${JSON.stringify(jobList)}

Scoring rules:
- 9-10: Near-perfect match — title, seniority, and industry all align
- 7-8: Good fit — title matches, minor seniority or industry gap
- 5-6: Possible stretch — title adjacent, significant seniority gap, or wrong industry
- 1-4: Poor fit — wrong function, too junior, too senior, or clearly mismatched

Additional rules:
- If candidateProfile.companySizeFit includes "SMB", include SMB-stage company roles
- If candidateProfile.companySizeFit includes "Enterprise", favor larger co roles
- Mark as 3 or below if the title is in notAFit list
- Penalize roles that require an industry the candidate has NO experience in
- Favor roles that match at least 2 of candidate's coreSkills

Return a JSON array:
[
  { "idx": 0, "score": 8, "reason": "AE role matches 7yr SaaS sales background" },
  { "idx": 1, "score": 4, "reason": "SDR role is too junior for VP-level background" }
]

Return ONLY the JSON array. One entry per job. Keep reasons under 10 words.`
          }
        ],
        max_tokens: 1500,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      console.warn(`[JobResearch] Fit scoring GPT call failed: ${res.status}`);
      return rawJobs.map(j => ({ ...j, fitScore: 7, fitReason: "unscored" }));
    }

    const data = await res.json() as any;
    const text = (data.choices?.[0]?.message?.content || "").trim()
      .replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");

    const scores: Array<{ idx: number; score: number; reason: string }> = JSON.parse(text);
    const scoreMap = new Map(scores.map(s => [s.idx, s]));

    const scored: ScoredJob[] = rawJobs.map((j, i) => ({
      ...j,
      fitScore: scoreMap.get(i)?.score ?? 5,
      fitReason: scoreMap.get(i)?.reason ?? "",
    }));

    // Log score distribution
    const high = scored.filter(j => j.fitScore >= 7).length;
    const low = scored.filter(j => j.fitScore < 7).length;
    console.log(`[JobResearch] Fit scores: ${high} qualifying (≥7), ${low} filtered out (<7)`);

    return scored;
  } catch (err) {
    console.warn("[JobResearch] Fit scoring failed, passing all through:", err);
    return rawJobs.map(j => ({ ...j, fitScore: 7, fitReason: "unscored" }));
  }
}

// ── Step 4: Enrich contact via Apollo ────────────────────────────────────────
// Primary: find the recruiter/TA who posted the role (best outreach target)
// Fallback: find a sales leader if no recruiter found
async function enrichContact(companyName: string, domain: string, jobTitle?: string): Promise<{
  contactName: string;
  contactEmail: string;
  contactLinkedIn: string;
  contactTitle: string;
}> {
  if (!process.env.APOLLO_API_KEY) return { contactName: "", contactEmail: "", contactLinkedIn: "", contactTitle: "" };

  // Try recruiter/TA first — they own the requisition
  const jobPoster = await findJobPoster(companyName, domain, jobTitle);
  if (jobPoster) {
    return {
      contactName: jobPoster.name,
      contactEmail: jobPoster.email,
      contactLinkedIn: jobPoster.linkedinUrl,
      contactTitle: jobPoster.title,
    };
  }

  // Fall back to sales leader if no recruiter found
  const leader = await findHiringManager(companyName, domain);
  if (leader) {
    return {
      contactName: leader.name,
      contactEmail: leader.email,
      contactLinkedIn: leader.linkedinUrl,
      contactTitle: leader.title,
    };
  }

  return { contactName: "", contactEmail: "", contactLinkedIn: "", contactTitle: "" };
}

// ── Location filter ───────────────────────────────────────────────────────────
// targetCountries format: "US:FL,CA,TX|UK|REMOTE"
// - Pipe-separated country blocks
// - Each block: "COUNTRYCODE" or "COUNTRYCODE:ST1,ST2,ST3"
// - State codes match ", FL" / "(FL)" / "Florida" patterns in location strings
// - Remote is always additive — included if REMOTE in list

const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

const COUNTRY_KEYWORDS: Record<string, string[]> = {
  US: ["united states", "usa", "u.s.", "u.s.a", "us remote", "remote, us", "remote - us", "remote - united states"],
  UK: ["united kingdom", "london", "manchester", "birmingham", "edinburgh", "bristol", "leeds", ", uk", "uk remote", "england", "scotland", "wales"],
  CA: ["canada", "toronto", "vancouver", "montreal", "calgary", "ottawa", "remote, canada"],
  AU: ["australia", "sydney", "melbourne", "brisbane", "perth", "remote, australia"],
  DE: ["germany", "berlin", "munich", "hamburg", "frankfurt"],
  FR: ["france", "paris", "lyon", "marseille"],
  NL: ["netherlands", "amsterdam", "rotterdam"],
  REMOTE: ["remote", "anywhere", "worldwide", "global", "work from anywhere"],
};

/**
 * Parse the targetCountries string into a structured filter object.
 * Format examples:
 *   "US"              → { US: [], UK: [] } — all US locations
 *   "US:FL,CA,TX"     → { US: ["FL","CA","TX"] } — US, specific states
 *   "US:FL,CA|REMOTE" → { US: ["FL","CA"], REMOTE: [] }
 *   "UK|US:NY,CA"     → { UK: [], US: ["NY","CA"] }
 */
function parseCountryFilter(raw: string): Record<string, string[]> {
  if (!raw?.trim()) return {};
  const result: Record<string, string[]> = {};
  const blocks = raw.split("|").map(b => b.trim()).filter(Boolean);
  for (const block of blocks) {
    const [country, statesRaw] = block.split(":");
    const code = country.trim().toUpperCase();
    const states = statesRaw
      ? statesRaw.split(",").map(s => s.trim().toUpperCase()).filter(Boolean)
      : [];
    result[code] = states;
  }
  return result;
}

function matchesCountryFilter(location: string, targetCountries: string): boolean {
  const filter = parseCountryFilter(targetCountries);
  if (Object.keys(filter).length === 0) return true; // no filter = accept all

  const loc = location.toLowerCase().trim();
  if (!loc) return true; // empty location = permissive

  // Always allow remote if REMOTE is in filter
  if (filter["REMOTE"] !== undefined) {
    const remoteKeywords = COUNTRY_KEYWORDS["REMOTE"] || [];
    if (remoteKeywords.some(k => loc.includes(k))) return true;
  }

  for (const [country, states] of Object.entries(filter)) {
    if (country === "REMOTE") continue;

    // Check if location matches country
    const countryKeywords = COUNTRY_KEYWORDS[country] || [];

    // For US: state code is the primary signal — ", FL" or "(FL)" or "Florida"
    if (country === "US") {
      const isUS = countryKeywords.some(k => loc.includes(k)) ||
        // Matches "City, ST" pattern — check for any 2-letter state code after comma+space
        /,\s*[a-z]{2}(\s|$|\()/.test(loc) ||
        loc.includes("remote");

      if (!isUS) continue;

      // If no state filter, any US location passes
      if (states.length === 0) return true;

      // Check state codes: ", FL" or "(FL)" or full name "Florida"
      for (const state of states) {
        const stateName = (US_STATE_NAMES[state] || "").toLowerCase();
        // ", FL" — city, state format
        if (loc.includes(`, ${state.toLowerCase()}`)) return true;
        // "(FL)" or "FL)" — parenthetical
        if (loc.includes(`(${state.toLowerCase()}`)) return true;
        // Full state name
        if (stateName && loc.includes(stateName)) return true;
        // "remote, fl" or "fl remote"
        if (loc.includes(`remote, ${state.toLowerCase()}`) ||
            loc.includes(`${state.toLowerCase()} remote`)) return true;
      }
      // US matched but no state matched
      continue;
    }

    // Non-US countries — keyword match
    if (countryKeywords.some(k => loc.includes(k))) return true;
  }

  return false;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function researchNewJobs(count?: number, userId: number = 1): Promise<GeneratedJob[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const configs = await db.select().from(researchConfig).where(eq(researchConfig.userId, userId));
  const config = configs[0];

  const targetRoles = config?.targetRoles?.toString() || "";
  const targetCategories = config?.targetCategories?.toString() || "";
  const targetCountries = ((config as any)?.targetCountries || "US").toString().trim();
  const workArrangement = ((config as any)?.workArrangement || "").toString().trim().toLowerCase();
  const arrangementFilter = workArrangement
    ? workArrangement.split(",").map((a: string) => a.trim()).filter(Boolean)
    : []; // empty = accept all

  if (!targetRoles.trim()) {
    console.log("[JobResearch] No target roles configured — upload a resume in Settings.");
    return [];
  }

  const requestedCount = Math.min(count || config?.rolesPerDay || 10, 30);
  console.log(`[JobResearch] Starting research — ${requestedCount} jobs for: ${targetRoles} | Location filter: ${targetCountries || "none"}`);

  // Load candidate profile from parsed resume for fit scoring
  const parsedResume = (config as any)?.lastDocumentParsed || null;
  const candidateProfile = await extractCandidateProfile(parsedResume);

  // Track which companies are already in pipeline (skip entirely if already there)
  const existingRows = await db.select({ companyName: companies.companyName })
    .from(companies)
    .where(eq(companies.userId, userId));
  const existingCompanies = new Set(existingRows.map(r => r.companyName.toLowerCase()));
  console.log(`[JobResearch] ${existingCompanies.size} companies already in pipeline — will skip`);

  // ── Phase 1: Fetch all raw jobs from verified ATS companies ─────────────────
  // Pull more companies than needed — fit scoring will filter down
  const poolSize = Math.min(requestedCount * 3, 30); // fetch 3x, keep best
  const verifiedCompanies = getVerifiedCompaniesForDiscovery(poolSize);

  // Skip companies already in pipeline
  const toFetch = verifiedCompanies.filter(
    co => !existingCompanies.has(co.name.toLowerCase())
  );
  console.log(`[JobResearch] Fetching from ${toFetch.length} companies (${poolSize - toFetch.length} skipped, already in pipeline)`);

  // Collect all raw jobs tagged with their source company
  const allRawJobs: RawJobWithCompany[] = [];

  for (const company of toFetch) {
    const raw = await fetchAllJobsFromCompany(company, targetRoles);
    if (raw.length > 0) {
      console.log(`[JobResearch] ${company.name} (${company.ats}): ${raw.length} jobs fetched`);
    }
    for (const job of raw) {
      // Apply country/state filter
      const jobLocation = (job as any).location || "";
      if (!matchesCountryFilter(jobLocation, targetCountries)) {
        console.log(`[JobResearch] Filtered: ${company.name} "${job.title}" — "${jobLocation}" not in [${targetCountries}]`);
        continue;
      }

      // Apply work arrangement filter
      if (arrangementFilter.length > 0) {
        const loc = jobLocation.toLowerCase();
        const isRemote = job.remote || loc.includes("remote") || loc.includes("anywhere");
        const isHybrid = loc.includes("hybrid");
        const isOnsite = !isRemote && !isHybrid;

        const matches =
          (arrangementFilter.includes("remote") && isRemote) ||
          (arrangementFilter.includes("hybrid") && isHybrid) ||
          (arrangementFilter.includes("onsite") && isOnsite);

        if (!matches) {
          console.log(`[JobResearch] Filtered: ${company.name} "${job.title}" — arrangement "${jobLocation}" not in [${workArrangement}]`);
          continue;
        }
      }
      allRawJobs.push({
        ...job,
        companyName: company.name,
        companySlug: company.slug,
        companyDomain: company.domain,
        category: company.category,
        ats: company.ats,
      });
    }
  }

  console.log(`[JobResearch] Total raw jobs across all companies: ${allRawJobs.length}`);

  if (allRawJobs.length === 0) {
    console.warn("[JobResearch] No jobs fetched from ATS APIs. Check location filter settings and try again.");
    return [];
  }

  // ── Phase 2: Score all jobs for fit in one GPT call ─────────────────────────
  const scored = await scoreJobsForFit(allRawJobs, candidateProfile, targetRoles);

  // Filter to qualifying jobs (score >= 7), then keep best 1 per company
  const qualifying = scored
    .filter(j => j.fitScore >= 7)
    .sort((a, b) => b.fitScore - a.fitScore);

  // Best 1 per company
  const seenCompanies = new Set<string>();
  const selected: typeof qualifying = [];
  for (const job of qualifying) {
    if (selected.length >= requestedCount) break;
    const key = job.companyName.toLowerCase();
    if (seenCompanies.has(key)) continue;
    seenCompanies.add(key);
    selected.push(job);
  }

  console.log(`[JobResearch] ${qualifying.length} qualifying jobs → ${selected.length} selected (1 per company, best fit)`);

  // ── Phase 3: Enrich contacts for selected companies ──────────────────────────
  // Enrich in parallel, capped to avoid rate limits
  const enrichedContacts = new Map<string, { contactName: string; contactEmail: string; contactLinkedIn: string; contactTitle: string }>();
  await Promise.all(
    selected.map(async job => {
      const key = job.companyName.toLowerCase();
      if (!enrichedContacts.has(key)) {
        const co = toFetch.find(c => c.name.toLowerCase() === key);
        if (co) {
          const contact = await enrichContact(co.name, co.domain, job.title);
          enrichedContacts.set(key, contact);
        }
      }
    })
  );

  // ── Phase 4: Build final GeneratedJob list ───────────────────────────────────
  const results: GeneratedJob[] = [];

  for (const job of selected) {
    const contact = enrichedContacts.get(job.companyName.toLowerCase()) ||
      { contactName: "", contactEmail: "", contactLinkedIn: "", contactTitle: "" };

    let linkedinUrl = "";
    try { linkedinUrl = await findCompanyLinkedIn(job.companyName); } catch { /* non-critical */ }

    const sourceLabel = job.ats === "greenhouse" ? "Greenhouse API"
      : job.ats === "lever" ? "Lever API"
      : job.ats === "ashby" ? "Ashby API"
      : "Firecrawl";

    const contactNote = contact.contactTitle ? ` | Contact: ${contact.contactTitle}` : "";
    const fitNote = job.fitScore ? ` | Fit: ${job.fitScore}/10` : "";

    results.push({
      companyName: job.companyName,
      companyId: `${slugify(job.companyName)}-${job.jobId || Date.now()}`,
      jobTitle: job.title,
      category: standardizeCategory(job.category),
      contactName: contact.contactName,
      contactEmail: contact.contactEmail,
      linkedinUrl,
      contactLinkedIn: contact.contactLinkedIn,
      jobDescription: job.description,
      jobLink: job.url,
      salary: job.salary || "Competitive",
      remote: job.remote || false,
      priority: getPriority(job.title),
      source: sourceLabel,
      fitScore: job.fitScore,
    });
  }

  // Never fall back to GPT-generated job listings.
  // GPT invents plausible-sounding but fake job URLs that 404 when clicked.
  // Better to return fewer real results than fake ones.
  // If ATS APIs returned 0, it usually means:
  //   1. Location filter is too narrow (try adding more states or Remote)
  //   2. All companies in the current pool have been seen before
  //   3. Ashby/Greenhouse returned no matching titles this run
  if (results.length === 0) {
    console.warn("[JobResearch] 0 qualifying jobs from ATS APIs — returning empty. Check location filter and run again.");
  } else {
    console.log(`[JobResearch] Final: ${results.length} real ATS jobs added to pipeline`);
  }

  return results;
}

// ── Fallback: GPT-generated listings (when ATS returns nothing) ───────────────
async function fallbackGptResearch(targetRoles: string, targetCategories: string, count: number): Promise<GeneratedJob[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Return only valid JSON arrays." },
        {
          role: "user",
          content: `Generate ${count} realistic job postings for: ${targetRoles} in ${targetCategories}.

Mix company sizes: include SMB (50-200 employees), Mid-Market (200-2000), and Enterprise (2000+).
Use only real B2B SaaS companies on Greenhouse or Lever ATS.
jobLink must be a real Greenhouse or Lever board URL — no made-up IDs.

Return JSON array: companyName, jobTitle, category, jobDescription (2 sentences), jobLink, salary, remote (bool), priority (High/Medium/Low). No markdown.`
        }
      ],
      max_tokens: 2000,
      temperature: 0.4,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI fallback failed: ${res.status}`);
  const data = await res.json() as any;
  let text = (data.choices?.[0]?.message?.content || "").trim()
    .replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");

  if (!text.endsWith("]")) {
    const last = text.lastIndexOf("}");
    if (last > 0) text = text.slice(0, last + 1) + "]";
  }

  try {
    const parsed = JSON.parse(text);
    return (Array.isArray(parsed) ? parsed : []).map((j: any) => ({
      companyName: j.companyName || "Unknown",
      companyId: `${slugify(j.companyName || "co")}-${Date.now()}`,
      jobTitle: j.jobTitle || targetRoles.split(",")[0].trim(),
      category: standardizeCategory(j.category || targetCategories.split(",")[0].trim()),
      contactName: "", contactEmail: "", linkedinUrl: "", contactLinkedIn: "",
      jobDescription: j.jobDescription || "",
      jobLink: j.jobLink || "",
      salary: j.salary || "Competitive",
      remote: j.remote === true,
      priority: ["High", "Medium", "Low"].includes(j.priority) ? j.priority : getPriority(j.jobTitle || ""),
      source: "GPT Research",
    }));
  } catch {
    return [];
  }
}

// ── Add jobs to pipeline DB ───────────────────────────────────────────────────
export async function addJobsToPipeline(jobs: GeneratedJob[], userId: number = 1): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let addedCount = 0;
  for (const job of jobs) {
    try {
      await db.insert(companies).values({
        userId,
        companyId: job.companyId,
        companyName: job.companyName,
        category: job.category,
        jobTitle: job.jobTitle,
        jobDescription: job.jobDescription,
        jobLink: job.jobLink,
        contactName: job.contactName,
        contactEmail: job.contactEmail,
        linkedinUrl: job.contactLinkedIn || job.linkedinUrl,
        remote: job.remote,
        salary: job.salary,
        companySize: "",
        priority: job.priority,
        stage: "Research",
        notes: `Source: ${job.source}${job.fitScore ? ` | Fit: ${job.fitScore}/10` : ""}`,
      });
      addedCount++;
    } catch (err: any) {
      console.error(`[JobResearch] INSERT FAILED for ${job.companyName}:`, err?.message || String(err));
    }
  }

  console.log(`[JobResearch] Added ${addedCount} jobs to pipeline`);
  return addedCount;
}
