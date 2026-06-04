import { getDb } from "./db";
import { findHiringManager, findJobPoster } from "./apolloService";
import { findCompanyLinkedIn } from "./linkedinService";
import { companies, researchConfig } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { fetchGreenhouseJobs } from "./greenhouseService";
import { fetchLeverJobs } from "./leverService";
import { fetchAshbyJobs } from "./ashbyService";
import { getVerifiedCompaniesForDiscovery, VerifiedCompany } from "./atsSlugMap";
import { discoverCompaniesForCandidate } from "./companyDiscoveryService";

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
  "industries": ["list of industries from their history"],
  "coreSkills": ["top 5 skills"],
  "companySizeFit": ["SMB", "Mid-Market", "Enterprise"],
  "targetTitles": ["3-5 realistic next-step titles for this person"],
  "notAFit": ["titles clearly too junior or senior"],
  "companiesWorkedAt": ["list of past company names — used to find ecosystem peers"],
  "productsOrTechSold": ["CRM", "RevIntel", "HR Tech", "Security" etc — what space they know]
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
// INVERTED LOGIC: Block known non-US locations. Pass everything ambiguous.
// Companies use inconsistent formats — there is no standard.
// Instead of matching US patterns (endless), we identify clearly non-US and block those.

// Known non-US country/city/region indicators
const NON_US_INDICATORS = [
  // ── Europe ──────────────────────────────────────────────────────────────────
  // Countries
  "united kingdom","england","scotland","wales","northern ireland","britain","great britain",
  "germany","france","netherlands","ireland","spain","italy","sweden","switzerland",
  "belgium","austria","portugal","denmark","norway","finland","poland","czech republic",
  "czechia","slovakia","hungary","romania","bulgaria","croatia","serbia","slovenia",
  "greece","turkey","ukraine","russia","luxembourg","malta","cyprus","estonia",
  "latvia","lithuania","iceland","liechtenstein","andorra","monaco","san marino",
  // UK cities
  "london","manchester","birmingham","edinburgh","glasgow","bristol","leeds",
  "liverpool","sheffield","newcastle","nottingham","cardiff","belfast","oxford","cambridge",
  // German cities
  "berlin","munich","münchen","hamburg","frankfurt","cologne","köln","düsseldorf",
  "stuttgart","dortmund","essen","bremen","hanover","hannover","nuremberg","nürnberg",
  // French cities
  "paris","lyon","marseille","toulouse","nice","bordeaux","lille","strasbourg","nantes",
  // Other European cities
  "amsterdam","rotterdam","the hague","utrecht","eindhoven",    // Netherlands
  "dublin","cork","galway",                                      // Ireland
  "madrid","barcelona","seville","sevilla","valencia","bilbao",  // Spain
  "rome","milan","naples","napoli","turin","torino","florence","firenze", // Italy
  "stockholm","gothenburg","malmö","göteborg",                   // Sweden
  "zurich","zürich","geneva","bern","basel",                     // Switzerland
  "vienna","wien","graz","salzburg","linz",                      // Austria
  "brussels","bruxelles","antwerp","ghent","bruges",             // Belgium
  "lisbon","porto","lisboa",                                     // Portugal
  "copenhagen","aarhus","odense",                                // Denmark
  "oslo","bergen","stavanger",                                   // Norway
  "helsinki","tampere","espoo","oulu",                           // Finland
  "warsaw","kraków","wrocław","gdansk","poznan","krakow","gdańsk", // Poland
  "prague","brno","ostrava",                                     // Czech Republic
  "budapest","debrecen",                                         // Hungary
  "bucharest","cluj","timisoara",                                // Romania
  "sofia","plovdiv",                                             // Bulgaria
  "zagreb","split",                                              // Croatia
  "athens","thessaloniki",                                       // Greece
  "istanbul","ankara","izmir",                                   // Turkey
  "kyiv","kiev","kharkiv",                                       // Ukraine
  "moscow","saint petersburg","st. petersburg","novosibirsk",    // Russia
  "luxembourg city",
  "reykjavik",                                                   // Iceland
  "tallinn","riga","vilnius",                                    // Baltics

  // ── Asia Pacific ────────────────────────────────────────────────────────────
  // Countries
  "japan","china","india","singapore","australia","new zealand","south korea","korea",
  "hong kong","taiwan","indonesia","malaysia","philippines","thailand","vietnam",
  "bangladesh","pakistan","sri lanka","nepal","myanmar","cambodia","laos",
  // Japanese cities
  "tokyo","osaka","kyoto","nagoya","sapporo","fukuoka","kobe","yokohama","hiroshima",
  // Chinese cities
  "beijing","shanghai","shenzhen","guangzhou","chengdu","hangzhou","wuhan","tianjin",
  "chongqing","nanjing","xi'an","xian","suzhou","qingdao","dongguan","shenyang",
  // Indian cities
  "bangalore","bengaluru","hyderabad","pune","mumbai","delhi","new delhi","chennai",
  "kolkata","ahmedabad","jaipur","surat","lucknow","kanpur","nagpur","indore",
  "noida","gurgaon","gurugram","chandigarh","coimbatore","kochi","vizag",
  // Australian cities
  "sydney","melbourne","brisbane","perth","adelaide","canberra","gold coast","newcastle",
  // Other APAC cities
  "singapore",
  "seoul","busan","incheon",                                    // South Korea
  "taipei","kaohsiung","taichung",                              // Taiwan
  "hong kong",
  "kuala lumpur","penang","johor bahru","petaling jaya",        // Malaysia
  "jakarta","surabaya","bandung","medan",                       // Indonesia
  "manila","quezon city","cebu",                                // Philippines
  "bangkok","chiang mai",                                       // Thailand
  "ho chi minh","hanoi","haiphong","da nang",                   // Vietnam
  "auckland","wellington","christchurch",                       // New Zealand

  // ── Middle East & Africa ────────────────────────────────────────────────────
  // Countries
  "israel","uae","united arab emirates","saudi arabia","qatar","kuwait","bahrain",
  "jordan","lebanon","egypt","nigeria","kenya","south africa","ghana","ethiopia",
  "tanzania","morocco","algeria","tunisia","senegal","cameroon","uganda","zimbabwe",
  // Cities
  "tel aviv","jerusalem","haifa","raanana","herzliya","petah tikva","beer sheva",
  "dubai","abu dhabi","sharjah",                                // UAE
  "riyadh","jeddah","dammam",                                   // Saudi Arabia
  "doha",                                                       // Qatar
  "cairo","alexandria",                                         // Egypt
  "lagos","abuja","ibadan","kano",                              // Nigeria
  "nairobi","mombasa",                                          // Kenya
  "johannesburg","cape town","durban","pretoria",               // South Africa
  "accra","kumasi",                                             // Ghana
  "casablanca","rabat","marrakech",                             // Morocco
  "amman","beirut",

  // ── Americas (non-US) ───────────────────────────────────────────────────────
  // Countries
  "canada","brazil","mexico","argentina","colombia","chile","peru","venezuela",
  "ecuador","bolivia","uruguay","paraguay","panama","costa rica","guatemala",
  "honduras","el salvador","nicaragua","cuba","dominican republic","haiti",
  "trinidad","jamaica","bahamas",
  // Canadian cities
  "toronto","vancouver","montreal","calgary","ottawa","edmonton","winnipeg",
  "québec","quebec city","hamilton","kitchener","london ontario","halifax",
  "saskatoon","regina","victoria bc",
  // Brazilian cities
  "são paulo","sao paulo","rio de janeiro","brasilia","fortaleza","salvador",
  "belo horizonte","manaus","curitiba","recife","porto alegre","belém",
  // Mexican cities
  "mexico city","guadalajara","monterrey","cancun","tijuana","puebla","merida",
  // Other LatAm cities
  "buenos aires","bogota","bogotá","santiago","lima","caracas","quito",
  "montevideo","asuncion","panama city","san josé","costa rica",

  // ── Regions / Multi-country ─────────────────────────────────────────────────
  "emea","apac","latam","latin america","anz","dach","cee","mena","sea",
  "southeast asia","sub-saharan africa","middle east","nordic","nordics",
  "europe","asia","africa","oceania",
  "eu ","european union","eurozone",
  "worldwide","global","international", // these often mean non-US-specific

  // ── Country codes that appear in job locations ───────────────────────────────
  ", uk"," uk,",", gb",", de",", fr",", nl",", ie",", es",", it",", se",
  ", ch",", be",", at",", pt",", dk",", no",", fi",", pl",", cz",", hu",
  ", au",", nz",", sg",", jp",", cn",", in",", kr",", hk",", tw",
  ", ca",", mx",", br",", ar",", co",", cl",", il",", ae",", za",
];


// US state codes for state-level filtering
const US_STATE_CODES = new Set([
  "al","ak","az","ar","ca","co","ct","de","fl","ga","hi","id","il","in","ia",
  "ks","ky","la","me","md","ma","mi","mn","ms","mo","mt","ne","nv","nh","nj",
  "nm","ny","nc","nd","oh","ok","or","pa","ri","sc","sd","tn","tx","ut","vt",
  "va","wa","wv","wi","wy","dc",
]);

const US_STATE_FULL_NAMES: Record<string, string> = {
  fl: "florida", ca: "california", tx: "texas", ny: "new york", ga: "georgia",
  nc: "north carolina", va: "virginia", pa: "pennsylvania", oh: "ohio",
  il: "illinois", wa: "washington", co: "colorado", az: "arizona",
  ma: "massachusetts", tn: "tennessee", md: "maryland", mn: "minnesota",
  wi: "wisconsin", mo: "missouri", or: "oregon", nv: "nevada",
  sc: "south carolina", al: "alabama", la: "louisiana", ky: "kentucky",
  ok: "oklahoma", ct: "connecticut", ut: "utah", ia: "iowa",
  ms: "mississippi", ar: "arkansas", ks: "kansas", nj: "new jersey",
  ne: "nebraska", nm: "new mexico", id: "idaho", hi: "hawaii",
  nh: "new hampshire", me: "maine", ri: "rhode island", mt: "montana",
  de: "delaware", sd: "south dakota", nd: "north dakota", ak: "alaska",
  vt: "vermont", wy: "wyoming", dc: "district of columbia",
};

function parseCountryFilter(raw: string): Record<string, string[]> {
  if (!raw?.trim()) return {};
  const result: Record<string, string[]> = {};
  const blocks = raw.split("|").map((b: string) => b.trim()).filter(Boolean);
  for (const block of blocks) {
    const [country, statesRaw] = block.split(":");
    const code = country.trim().toUpperCase();
    result[code] = statesRaw
      ? statesRaw.split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean)
      : [];
  }
  return result;
}

/**
 * Determine if a single location string represents a US location.
 * INVERTED: assume US unless a clear non-US indicator is present.
 */
function isUSLocation(loc: string): boolean {
  if (!loc.trim()) return true; // blank = pass
  const locLower = loc.toLowerCase();

  // Check for known non-US indicators
  for (const indicator of NON_US_INDICATORS) {
    if (locLower.includes(indicator)) return false;
  }

  // If we got here, no non-US indicator found → treat as US
  return true;
}

/**
 * Check state-level filter within a US location.
 * Remote/flexible roles always pass regardless of state filter.
 */
function matchesUSState(loc: string, states: string[]): boolean {
  if (states.length === 0) return true;

  // Remote roles are accessible from any state
  if (
    loc.includes("remote") || loc.includes("anywhere") ||
    loc.includes("north america") || loc.includes("united states") ||
    loc.includes("usa") || loc.includes("u.s.")
  ) return true;

  for (const state of states) { // state is already lowercase
    // ", fl" pattern
    if (loc.includes(`, ${state}`)) return true;
    // "(fl)" pattern
    if (loc.includes(`(${state}`)) return true;
    // Full state name
    const fullName = US_STATE_FULL_NAMES[state];
    if (fullName && loc.includes(fullName)) return true;
  }
  return false;
}

function matchesCountryFilter(location: string, targetCountries: string): boolean {
  const filter = parseCountryFilter(targetCountries);
  if (Object.keys(filter).length === 0) return true;

  // Split semicolon/pipe-separated multi-location — if ANY part passes, whole location passes
  const parts = location.split(/[;|]/).map((p: string) => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    return parts.some(part => matchesCountryFilter(part, targetCountries));
  }

  const loc = location.toLowerCase().trim();
  if (!loc) return true;

  for (const [country, states] of Object.entries(filter)) {

    if (country === "REMOTE") {
      if (loc.includes("remote") || loc.includes("anywhere") || loc.includes("worldwide")) return true;
      continue;
    }

    if (country === "US") {
      if (isUSLocation(loc) && matchesUSState(loc, states)) return true;
      continue;
    }

    // Non-US countries
    const countryKeywords: Record<string, string[]> = {
      UK: ["united kingdom","england","scotland","wales","london","manchester","birmingham",", uk"],
      CA: ["canada","toronto","vancouver","montreal","calgary"],
      AU: ["australia","sydney","melbourne","brisbane","perth"],
      DE: ["germany","berlin","munich","hamburg","frankfurt"],
      FR: ["france","paris","lyon"],
      NL: ["netherlands","amsterdam"],
    };
    const keywords = countryKeywords[country] || [];
    if (keywords.some((k: string) => loc.includes(k))) return true;
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

  // Track which specific job postings are already in pipeline (by companyId = company+jobId)
  // This is JOB-level deduplication — NOT company-level.
  // A company can be in the pipeline AND still have new job postings worth fetching.
  const existingJobRows = await db.select({ companyId: companies.companyId })
    .from(companies)
    .where(eq(companies.userId, userId));
  const existingJobIds = new Set(existingJobRows.map(r => r.companyId));
  console.log(`[JobResearch] ${existingJobIds.size} job postings already in pipeline — will skip duplicates`);

  // ── Phase 1: Build company pool ───────────────────────────────────────────────
  // Always research all companies — job-level dedup handles duplicates at insert time.
  // Rotate the static pool so each run sees different companies.
  const poolSize = Math.min(requestedCount * 3, 30);

  // Parse candidate profile for company discovery
  let profileForDiscovery: any = {};
  try {
    if (candidateProfile) profileForDiscovery = JSON.parse(candidateProfile);
  } catch { /* use empty profile */ }

  // Get static fallback companies — shuffled so each run sees a different subset
  const staticFallback = getVerifiedCompaniesForDiscovery(poolSize);

  // Always run GPT discovery to find companies not in the static map
  console.log(`[JobResearch] Running resume-driven company discovery`);
  let allCompanies;
  try {
    allCompanies = await discoverCompaniesForCandidate(
      profileForDiscovery,
      targetRoles,
      targetCategories,
      poolSize,
      staticFallback
    );
  } catch (err: any) {
    console.warn(`[JobResearch] Discovery failed (${err.message}) — using static pool`);
    allCompanies = staticFallback;
  }

  const toFetch = allCompanies;
  console.log(`[JobResearch] Fetching from ${toFetch.length} companies`);

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

  // Load existing job IDs to prevent duplicates at insert time
  const existingRows = await db.select({ companyId: companies.companyId })
    .from(companies)
    .where(eq(companies.userId, userId));
  const existingIds = new Set(existingRows.map(r => r.companyId));

  let addedCount = 0;
  for (const job of jobs) {
    // Skip if this exact job posting is already in the pipeline
    if (existingIds.has(job.companyId)) {
      console.log(`[JobResearch] Skipping duplicate job: ${job.companyName} (${job.companyId})`);
      continue;
    }
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
      existingIds.add(job.companyId); // track newly added IDs within this run
      addedCount++;
    } catch (err: any) {
      console.error(`[JobResearch] INSERT FAILED for ${job.companyName}:`, err?.message || String(err));
    }
  }

  console.log(`[JobResearch] Added ${addedCount} new job postings to pipeline`);
  return addedCount;
}
