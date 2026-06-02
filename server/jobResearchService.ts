import { getDb } from "./db";
import { findHiringManager } from "./apolloService";
import { findCompanyLinkedIn } from "./linkedinService";
import { companies, researchConfig } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { isGreenhouseUrl, scrapeGreenhouseUrl, fetchGreenhouseJobs } from "./greenhouseService";
import { isLeverUrl, scrapeLeverUrl, fetchLeverJobs } from "./leverService";
import {
  lookupVerifiedCompany,
  getVerifiedCompaniesForDiscovery,
  greenhouseBoardUrl,
  leverBoardUrl,
} from "./atsSlugMap";

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
}

// Standard B2B SaaS category taxonomy — maps to industry-standard classifications
const STANDARD_CATEGORIES: Record<string, string> = {
  // CRM & Sales
  "crm": "CRM",
  "customer relationship management": "CRM",
  "sales crm": "CRM",

  // Sales Engagement & Enablement
  "sales engagement": "Sales Engagement",
  "sales enablement": "Sales Enablement",
  "sales intelligence": "Sales Intelligence",
  "sales technology": "Sales Technology",
  "sales automation": "Sales Engagement",
  "revenue intelligence": "Revenue Intelligence",
  "conversation intelligence": "Revenue Intelligence",
  "revenue operations": "Revenue Operations",
  "revops": "Revenue Operations",

  // Marketing
  "marketing automation": "Marketing Automation",
  "marketing technology": "Marketing Technology",
  "martech": "Marketing Technology",
  "demand generation": "Marketing Automation",
  "account-based marketing": "Account-Based Marketing",
  "abm": "Account-Based Marketing",

  // Customer Success
  "customer success": "Customer Success",
  "customer experience": "Customer Experience",
  "customer support": "Customer Support",
  "help desk": "Customer Support",

  // HR & Workforce
  "hr tech": "HR Technology",
  "hr technology": "HR Technology",
  "human resources": "HR Technology",
  "workforce management": "HR Technology",
  "talent management": "HR Technology",
  "recruiting": "HR Technology",

  // Data & Analytics
  "data analytics": "Data & Analytics",
  "business intelligence": "Business Intelligence",
  "bi": "Business Intelligence",

  // Security
  "cybersecurity": "Cybersecurity",
  "security": "Cybersecurity",
  "identity": "Identity & Access",

  // Finance & Billing
  "fintech": "FinTech",
  "billing": "Billing & Payments",
  "payments": "Billing & Payments",
  "subscription management": "Billing & Payments",
  "financial technology": "FinTech",

  // EdTech
  "edtech": "EdTech",
  "education technology": "EdTech",
  "learning management": "EdTech",
  "lms": "EdTech",

  // Collaboration & Productivity
  "collaboration": "Collaboration",
  "productivity": "Productivity",
  "project management": "Project Management",

  // DevOps & Engineering
  "devops": "DevOps",
  "developer tools": "Developer Tools",

  // Vertical SaaS
  "healthcare": "Healthcare Tech",
  "legal tech": "Legal Tech",
  "real estate tech": "Real Estate Tech",
  "proptech": "Real Estate Tech",

  // General
  "b2b saas": "B2B SaaS",
  "enterprise software": "Enterprise Software",
  "cloud": "Cloud Infrastructure",
  "infrastructure": "Cloud Infrastructure",
  "platform": "Platform",
};

function standardizeCategory(raw: string): string {
  const lower = (raw || "").toLowerCase().trim();
  // Direct match
  if (STANDARD_CATEGORIES[lower]) return STANDARD_CATEGORIES[lower];
  // Partial match
  for (const [key, value] of Object.entries(STANDARD_CATEGORIES)) {
    if (lower.includes(key) || key.includes(lower)) return value;
  }
  // Title case the raw value as fallback
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

// ── Step 1: Discover target companies ────────────────────────────────────────
// Primary source: verified ATS slug map (guaranteed correct slugs)
// Secondary: GPT suggestions only for companies NOT in the map
async function discoverTargetCompanies(
  targetRoles: string,
  targetCategories: string,
  count: number = 20
): Promise<Array<{ name: string; domain: string; careersUrl: string; category: string; ats: string }>> {

  // Pull from verified map first — these are guaranteed to work
  const verified = getVerifiedCompaniesForDiscovery(count);
  const keyword = targetRoles.split(",")[0].trim();

  const results = verified.map(co => ({
    name: co.name,
    domain: co.domain,
    category: co.category,
    ats: co.ats,
    careersUrl: co.ats === "greenhouse"
      ? greenhouseBoardUrl(co.slug, keyword)
      : leverBoardUrl(co.slug),
    _slug: co.slug, // internal — used by ATS router
  }));

  console.log(`[JobResearch] Using ${results.length} verified companies from slug map`);
  return results;
}

// ── Step 2: Route to correct scraper based on ATS type ───────────────────────
async function scrapeCareerPage(
  careersUrl: string,
  targetRoles: string,
  verifiedSlug?: string,     // when provided, skip URL parsing — use slug directly
  verifiedAts?: string
): Promise<Array<{ title: string; description: string; url: string; salary?: string; remote?: boolean }>> {

  const keyword = targetRoles.split(",")[0].trim();

  // ── If we have a verified slug, use it directly — don't trust the URL ──────
  if (verifiedSlug && verifiedAts === "greenhouse") {
    console.log(`[JobResearch] Greenhouse API (verified slug: ${verifiedSlug})`);
    const jobs = await fetchGreenhouseJobs(verifiedSlug, keyword);
    console.log(`[JobResearch] Greenhouse API returned ${jobs.length} jobs`);
    return jobs.map(j => ({ title: j.title, description: j.description, url: j.url, salary: j.salary, remote: j.remote }));
  }

  if (verifiedSlug && verifiedAts === "lever") {
    console.log(`[JobResearch] Lever API (verified slug: ${verifiedSlug})`);
    const jobs = await fetchLeverJobs(verifiedSlug, keyword);
    console.log(`[JobResearch] Lever API returned ${jobs.length} jobs`);
    return jobs.map(j => ({ title: j.title, description: j.description, url: j.url, salary: j.salary, remote: j.remote }));
  }

  // ── Fallback: detect ATS from URL ────────────────────────────────────────
  if (isGreenhouseUrl(careersUrl)) {
    console.log(`[JobResearch] Routing to Greenhouse API: ${careersUrl}`);
    const jobs = await scrapeGreenhouseUrl(careersUrl, targetRoles);
    console.log(`[JobResearch] Greenhouse API returned ${jobs.length} jobs`);
    return jobs;
  }

  if (isLeverUrl(careersUrl)) {
    console.log(`[JobResearch] Routing to Lever API: ${careersUrl}`);
    const jobs = await scrapeLeverUrl(careersUrl, targetRoles);
    console.log(`[JobResearch] Lever API returned ${jobs.length} jobs`);
    return jobs;
  }

  // ── Last resort: Firecrawl for custom career pages ───────────────────────
  console.log(`[JobResearch] No ATS detected — using Firecrawl: ${careersUrl}`);
  return scrapeWithFirecrawl(careersUrl, targetRoles);
}


// ── Firecrawl scraper (used only for non-Greenhouse, non-Lever pages) ────────
async function scrapeWithFirecrawl(
  careersUrl: string,
  targetRoles: string
): Promise<Array<{ title: string; description: string; url: string; salary?: string; remote?: boolean }>> {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) {
    console.warn("[JobResearch] FIRECRAWL_API_KEY not set — skipping Firecrawl scrape");
    return [];
  }

  try {
    console.log(`[JobResearch] Firecrawl scraping: ${careersUrl}`);

    const scrapeRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${firecrawlKey}`,
      },
      body: JSON.stringify({
        url: careersUrl,
        formats: ["markdown"],
        onlyMainContent: true,
        timeout: 30000,
        waitFor: 3000,
        actions: [
          { type: "wait", milliseconds: 3000 }
        ],
      }),
      signal: AbortSignal.timeout(40000),
    });

    if (!scrapeRes.ok) {
      const errText = await scrapeRes.text();
      console.warn(`[JobResearch] Firecrawl HTTP ${scrapeRes.status} for ${careersUrl} — ${errText.slice(0, 300)}`);
      return [];
    }

    const scrapeData = await scrapeRes.json() as any;

    // ── FIX: Firecrawl v1 wraps content in scrapeData.data, not scrapeData directly
    const pageContent: string =
      scrapeData?.data?.markdown ||   // v1 response shape
      scrapeData?.markdown ||          // legacy shape
      scrapeData?.data?.content ||     // alternate v1 field
      scrapeData?.content ||           // alternate legacy
      "";

    if (!pageContent.trim()) {
      // Log the full response shape so we can diagnose future failures
      console.warn(`[JobResearch] Firecrawl returned empty content for ${careersUrl}`);
      console.warn(`[JobResearch] Firecrawl raw response keys: ${Object.keys(scrapeData || {}).join(", ")}`);
      if (scrapeData?.data) {
        console.warn(`[JobResearch] Firecrawl data keys: ${Object.keys(scrapeData.data || {}).join(", ")}`);
      }
      console.warn(`[JobResearch] Firecrawl success flag: ${scrapeData?.success}`);
      console.warn(`[JobResearch] Firecrawl status: ${scrapeData?.data?.statusCode || scrapeData?.statusCode}`);
      return [];
    }

    console.log(`[JobResearch] Firecrawl got ${pageContent.length} chars from ${careersUrl}`);
    console.log(`[JobResearch] Content preview (first 500): ${pageContent.slice(0, 500).replace(/\n/g, " ")}`);

    // Check if page content looks like a real job listing page
    const lcContent = pageContent.toLowerCase();
    const hasJobSignals =
      lcContent.includes("apply") ||
      lcContent.includes("job") ||
      lcContent.includes("position") ||
      lcContent.includes("opening") ||
      lcContent.includes("hiring") ||
      lcContent.includes("role");

    if (!hasJobSignals) {
      console.warn(`[JobResearch] Firecrawl content for ${careersUrl} doesn't look like a jobs page — skipping GPT extraction`);
      console.warn(`[JobResearch] Page content sample: ${pageContent.slice(0, 200).replace(/\n/g, " ")}`);
      return [];
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return [];

    const extractRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are extracting job listings from a scraped career page. Be inclusive — if there is any doubt whether a role matches, include it. Return only valid JSON arrays. No markdown, no explanation.",
          },
          {
            role: "user",
            content: `Extract job postings from this career page content that match: ${targetRoles}

Page URL: ${careersUrl}
Page content:
${pageContent.slice(0, 12000)}

Matching rules — be INCLUSIVE:
- Account Executive, AE, Enterprise AE, Commercial AE, Strategic AE → match
- Business Development, BD Manager, BDR → match
- VP Sales, Director of Sales, Sales Manager → match
- Customer Success Manager, CSM → match if target roles include CSM
- When in doubt, include the role

URL extraction rules — CRITICAL:
- For Lever pages: job URLs are like https://jobs.lever.co/company/uuid — extract the FULL URL
- For Greenhouse pages: job URLs are like https://boards.greenhouse.io/company/jobs/12345 — extract FULL URL
- Look for hyperlinks on job titles, "Apply Now", "View Job" buttons — the href IS the direct URL
- If you see a relative URL like /jobs/12345, make it absolute using the page's base domain
- If no direct URL is found, use the careers page URL as fallback

Return a JSON array where each item has:
- title (string): exact job title
- description (string): 2-3 sentence summary of the role
- url (string): FULL direct application URL starting with https://
- salary (string): salary range if visible, otherwise ""
- remote (boolean): true if remote or hybrid is mentioned

If the page has NO matching job listings, return an empty array: []
Return ONLY the JSON array.`,
          },
        ],
        max_tokens: 2000,
        temperature: 0.1,
      }),
    });

    if (!extractRes.ok) {
      console.warn(`[JobResearch] GPT extraction request failed: ${extractRes.status}`);
      return [];
    }

    const extractData = await extractRes.json() as any;
    let extractText = (extractData.choices?.[0]?.message?.content || "").trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "");

    try {
      console.log(`[JobResearch] GPT extraction raw response: ${extractText.slice(0, 300)}`);
      const jobs = JSON.parse(extractText);
      const count = Array.isArray(jobs) ? jobs.length : 0;
      console.log(`[JobResearch] GPT extracted ${count} jobs from Firecrawl content`);
      return Array.isArray(jobs) ? jobs : [];
    } catch {
      console.warn(`[JobResearch] Failed to parse GPT extraction response: ${extractText.slice(0, 200)}`);
      return [];
    }
  } catch (err) {
    console.warn(`[JobResearch] Firecrawl scrape error for ${careersUrl}:`, err);
    return [];
  }
}

// ── Step 3: Enrich with Apollo.io contact ────────────────────────────────────
async function enrichContact(companyName: string, domain: string): Promise<{
  contactName: string;
  contactEmail: string;
  contactLinkedIn: string;
}> {
  if (!process.env.APOLLO_API_KEY) return { contactName: "", contactEmail: "", contactLinkedIn: "" };

  const contact = await findHiringManager(companyName, domain);
  if (!contact) return { contactName: "", contactEmail: "", contactLinkedIn: "" };

  return {
    contactName: contact.name,
    contactEmail: contact.email,
    contactLinkedIn: contact.linkedinUrl,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function researchNewJobs(count?: number, userId: number = 1): Promise<GeneratedJob[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const configs = await db.select().from(researchConfig).where(eq(researchConfig.userId, userId));
  const config = configs[0];

  const targetRoles = config?.targetRoles?.toString() || "";
  const targetCategories = config?.targetCategories?.toString() || "";

  // Don't run research if no roles configured — user needs to upload resume first
  if (!targetRoles.trim()) {
    console.log("[JobResearch] No target roles configured — skipping research. Upload a resume in Settings.");
    return [];
  }
  const requestedCount = Math.min(count || config?.rolesPerDay || 10, 30);

  console.log(`[JobResearch] Starting research — ${requestedCount} jobs for: ${targetRoles}`);

  // Get existing companies in pipeline to avoid duplicates
  const existingRows = await db.select({ companyName: companies.companyName })
    .from(companies)
    .where(eq(companies.userId, userId));

  // Count how many roles each company already has in pipeline
  const companyRoleCounts: Record<string, number> = {};
  for (const row of existingRows) {
    const name = (row.companyName || "").toLowerCase();
    companyRoleCounts[name] = (companyRoleCounts[name] || 0) + 1;
  }
  const MAX_ROLES_PER_COMPANY = 2;

  console.log(`[JobResearch] ${Object.keys(companyRoleCounts).length} companies already in pipeline`);

  // Step 1 — Discover companies
  const companyCount = Math.min(Math.ceil(requestedCount / 2), 15);
  const targetCompanies = await discoverTargetCompanies(targetRoles, targetCategories, companyCount);
  console.log(`[JobResearch] Discovered ${targetCompanies.length} target companies`);

  const jobs: GeneratedJob[] = [];

  // Step 2 — Fetch jobs from each company via the appropriate ATS API or Firecrawl
  for (const company of targetCompanies) {
    if (jobs.length >= requestedCount) break;

    const co = company as any;
    const ats = co.ats || "other";
    const verifiedSlug: string | undefined = co._slug;

    console.log(`[JobResearch] Fetching ${company.name} via ${ats.toUpperCase()} (slug: ${verifiedSlug || "url-detect"})`);

    // Pass verified slug so we bypass URL parsing and use the exact correct slug
    const scrapedJobs = await scrapeCareerPage(company.careersUrl, targetRoles, verifiedSlug, ats);
    console.log(`[JobResearch] ${ats.toUpperCase()} result: ${scrapedJobs.length} matching jobs at ${company.name}`);


    // Step 3 — Enrich contact once per company
    let contact = { contactName: "", contactEmail: "", contactLinkedIn: "" };
    if (scrapedJobs.length > 0) {
      contact = await enrichContact(company.name, company.domain);
    }

    // Step 4 — Build LinkedIn URL
    let linkedinUrl = "";
    try { linkedinUrl = await findCompanyLinkedIn(company.name); } catch { /* non-critical */ }

    for (const job of scrapedJobs) {
      if (jobs.length >= requestedCount) break;

      // Skip if this company already has max roles in pipeline
      const existingCount = companyRoleCounts[(company.name || "").toLowerCase()] || 0;
      const addedThisRun = jobs.filter(j => j.companyName.toLowerCase() === company.name.toLowerCase()).length;
      if (existingCount + addedThisRun >= MAX_ROLES_PER_COMPANY) {
        console.log(`[JobResearch] Skipping ${company.name} — already has ${existingCount + addedThisRun} roles`);
        break;
      }

      // Source label reflects actual ATS used
      const sourceLabel = ats === "greenhouse" ? "Greenhouse API"
        : ats === "lever" ? "Lever API"
        : "Firecrawl";

      jobs.push({
        companyName: company.name,
        companyId: `${slugify(company.name)}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        jobTitle: job.title,
        category: standardizeCategory(company.category),
        contactName: contact.contactName,
        contactEmail: contact.contactEmail,
        linkedinUrl,
        contactLinkedIn: contact.contactLinkedIn,
        jobDescription: job.description,
        jobLink: job.url || company.careersUrl,
        salary: job.salary || "Competitive",
        remote: job.remote || false,
        priority: getPriority(job.title),
        source: sourceLabel,
      });
    }
  }

  // Supplement with GPT fallback if needed
  if (jobs.length === 0) {
    console.warn("[JobResearch] ATS APIs + Firecrawl found 0 matching jobs — falling back to GPT research");
    return fallbackGptResearch(targetRoles, targetCategories, requestedCount);
  } else if (jobs.length < requestedCount) {
    console.log(`[JobResearch] ATS APIs found ${jobs.length}/${requestedCount} — supplementing with GPT`);
    const remaining = requestedCount - jobs.length;
    const supplement = await fallbackGptResearch(targetRoles, targetCategories, remaining);
    jobs.push(...supplement);
  }

  console.log(`[JobResearch] Total jobs found: ${jobs.length}`);
  return jobs;
}

// ── Fallback: GPT-generated listings (used only when Apify finds nothing) ────
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

Use only real B2B SaaS companies. For jobLink use a FILTERED ATS URL that goes directly to job listings — NOT a generic /careers page:
- Lever: https://jobs.lever.co/{company-slug}?department=Sales
- Greenhouse: https://boards.greenhouse.io/{company-slug}/jobs?q=account+executive
Prefer Lever and Greenhouse companies. Avoid Workday.

Return JSON array with: companyName, jobTitle, category, jobDescription (2 sentences), jobLink (filtered ATS URL), salary, remote (bool), priority (High/Medium/Low). No markdown.`
        }
      ],
      max_tokens: 3000,
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
      priority: ["High","Medium","Low"].includes(j.priority) ? j.priority : getPriority(j.jobTitle || ""),
      source: "GPT Research",
    }));
  } catch {
    return [];
  }
}

// ── Add jobs to pipeline DB ────────────────────────────────────────────────────
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
        notes: `Source: ${job.source}`,
      });
      addedCount++;
    } catch (err: any) {
      console.error(`[JobResearch] INSERT FAILED for ${job.companyName}:`, err?.message || String(err));
    }
  }

  console.log(`[JobResearch] Added ${addedCount} jobs to pipeline`);
  return addedCount;
}
