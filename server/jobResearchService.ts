import { getDb } from "./db";
import { findHiringManager } from "./apolloService";
import { findCompanyLinkedIn } from "./linkedinService";
import { companies, researchConfig } from "../drizzle/schema";
import { eq } from "drizzle-orm";

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

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getPriority(title: string): "High" | "Medium" | "Low" {
  const t = title.toLowerCase();
  if (t.includes("vp") || t.includes("vice president") || t.includes("director") || t.includes("senior")) return "High";
  if (t.includes("manager") || t.includes("lead") || t.includes("head")) return "Medium";
  return "Low";
}

// ── Step 1: Discover target companies via GPT ─────────────────────────────────
async function discoverTargetCompanies(
  targetRoles: string,
  targetCategories: string,
  count: number = 20
): Promise<Array<{ name: string; domain: string; careersUrl: string; category: string }>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Return only valid JSON arrays. No markdown, no explanation." },
        {
          role: "user",
          content: `Generate a list of ${count} real B2B SaaS companies that are actively hiring for these roles right now: ${targetRoles}

Focus on categories: ${targetCategories}

For each company you MUST provide a filtered ATS URL that goes directly to matching job listings — not a generic /careers page.

Use these ATS URL patterns based on what each company uses:
- Greenhouse: https://boards.greenhouse.io/{company-slug}/jobs?q={role-keyword}
- Lever: https://jobs.lever.co/{company-slug}?department=Sales
- Workday: https://{company}.wd1.myworkdayjobs.com/External_Career_Site/jobs?q={role-keyword}
- Ashby: https://jobs.ashbyhq.com/{company-slug}
- Rippling/custom: https://{company}.com/careers?department=sales&q={role-keyword}

Role keywords to use in URLs: account-executive, account+executive, "account executive", sales, business-development

Real examples of CORRECT filtered URLs:
- HubSpot AE: https://www.hubspot.com/careers/jobs?q=account+executive&page=1
- Salesforce AE: https://salesforce.wd1.myworkdayjobs.com/External_Career_Site/jobs?q=Account+Executive
- Gong: https://jobs.lever.co/gong?department=Sales
- Outreach: https://jobs.lever.co/outreach?department=Sales
- Zendesk: https://jobs.lever.co/zendesk?department=Sales&commitment=Full-time
- Clari: https://jobs.lever.co/clari?department=Sales
- Seismic: https://boards.greenhouse.io/seismic/jobs?q=account+executive
- Salesloft: https://boards.greenhouse.io/salesloft?q=account
- Apollo.io: https://boards.greenhouse.io/apolloio?q=account
- Drift: https://boards.greenhouse.io/drift?q=sales

Rules:
- ONLY real companies you are confident use these specific ATS systems
- Vary the companies each run — do not repeat the same list every time
- US-based or US remote positions
- Mix enterprise (Salesforce, HubSpot) with growth-stage (Gong, Outreach, Clari, Seismic)
- If unsure of the exact ATS URL, use the Greenhouse or Lever pattern as a safe default

Return a JSON array only — no markdown, no explanation:
[
  {
    "name": "HubSpot",
    "domain": "hubspot.com",
    "careersUrl": "https://www.hubspot.com/careers/jobs?q=account+executive&page=1",
    "category": "Sales Enablement",
    "ats": "hubspot-custom"
  }
]`
        }
      ],
      max_tokens: 2000,
      temperature: 0.8,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI company discovery failed: ${res.status}`);
  const data = await res.json() as any;
  let text = (data.choices?.[0]?.message?.content || "").trim()
    .replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error("[JobResearch] Failed to parse company list");
    return [];
  }
}

// ── Step 2: Scrape career page via Firecrawl ─────────────────────────────────
async function scrapeCareerPage(
  careersUrl: string,
  targetRoles: string
): Promise<Array<{ title: string; description: string; url: string; salary?: string; remote?: boolean }>> {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  if (!firecrawlKey) {
    console.warn("[JobResearch] FIRECRAWL_API_KEY not set — skipping scrape");
    return [];
  }

  try {
    console.log(`[JobResearch] Firecrawl scraping: ${careersUrl}`);

    // Use Firecrawl to scrape the career page — handles JS-rendered pages
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
        waitFor: 2000,
        actions: [
          { type: "wait", milliseconds: 2000 }
        ],
      }),
      signal: AbortSignal.timeout(35000),
    });

    if (!scrapeRes.ok) {
      const errText = await scrapeRes.text();
      console.warn(`[JobResearch] Firecrawl failed for ${careersUrl}: ${scrapeRes.status} — ${errText.slice(0,200)}`);
      return [];
    }

    const scrapeData = await scrapeRes.json() as any;
    const pageContent = scrapeData?.data?.markdown || scrapeData?.markdown || "";

    if (!pageContent.trim()) {
      console.warn(`[JobResearch] Firecrawl returned empty content for ${careersUrl}`);
      return [];
    }

    console.log(`[JobResearch] Firecrawl got ${pageContent.length} chars from ${careersUrl}`);

    // Use GPT to extract matching job postings from scraped content
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return [];

    const extractRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are extracting job listings from a career page. Be inclusive — if there is any doubt whether a role matches, include it. Return only valid JSON arrays." },
          {
            role: "user",
            content: `Extract job postings from this career page that match: ${targetRoles}

Page content:
${pageContent.slice(0, 12000)}

Instructions:
- Be INCLUSIVE — if a job title is related to the target roles, include it
- Account Executive, AE, Enterprise AE, Commercial AE, Strategic AE → all match "Account Executive"
- Business Development, BD Manager, BDR, SDR in BD roles → match "Business Development"
- VP Sales, Director of Sales, Sales Manager → match senior sales roles
- When in doubt, include the role

Return a JSON array. Each object must have:
- title: exact job title from the page (string)
- description: 2-3 sentences about the role (string)
- url: application link if visible, otherwise "" (string)
- salary: salary if mentioned, otherwise "" (string)
- remote: true if remote/hybrid mentioned, false otherwise (boolean)

If the page shows NO job listings (just a careers marketing page), return [].
If it shows job titles, extract ALL that are related to the target roles.
Return ONLY the JSON array.`
          }
        ],
        max_tokens: 2000,
        temperature: 0.1,
      }),
    });

    if (!extractRes.ok) return [];
    const extractData = await extractRes.json() as any;
    let extractText = (extractData.choices?.[0]?.message?.content || "").trim()
      .replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");

    try {
      const jobs = JSON.parse(extractText);
      return Array.isArray(jobs) ? jobs : [];
    } catch {
      console.warn(`[JobResearch] Failed to parse job extraction response`);
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

  const targetRoles = config?.targetRoles?.toString() || "Account Executive, Business Development Manager";
  const targetCategories = config?.targetCategories?.toString() || "B2B SaaS, Enterprise Software";
  const requestedCount = Math.min(count || config?.rolesPerDay || 10, 30);

  console.log(`[JobResearch] Starting research — ${requestedCount} jobs for: ${targetRoles}`);

  // Step 1 — Discover companies
  const companyCount = Math.min(Math.ceil(requestedCount / 2), 15);
  const targetCompanies = await discoverTargetCompanies(targetRoles, targetCategories, companyCount);
  console.log(`[JobResearch] Discovered ${targetCompanies.length} target companies`);

  const jobs: GeneratedJob[] = [];

  // Step 2 — Scrape each company's career page
  for (const company of targetCompanies) {
    if (jobs.length >= requestedCount) break;

    console.log(`[JobResearch] Scraping ${company.name} — ${company.careersUrl}`);

    const scrapedJobs = await scrapeCareerPage(company.careersUrl, targetRoles);
    console.log(`[JobResearch] Scrape result: ${scrapedJobs.length} matching jobs at ${company.name} (${company.careersUrl})`);

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
      jobs.push({
        companyName: company.name,
        companyId: `${slugify(company.name)}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        jobTitle: job.title,
        category: company.category,
        contactName: contact.contactName,
        contactEmail: contact.contactEmail,
        linkedinUrl,
        contactLinkedIn: contact.contactLinkedIn,
        jobDescription: job.description,
        jobLink: job.url || company.careersUrl,
        salary: job.salary || "Competitive",
        remote: job.remote || false,
        priority: getPriority(job.title),
        source: "Apify",
      });
    }
  }

  // If Apify found fewer than expected, supplement with GPT research
  if (jobs.length === 0) {
    console.warn("[JobResearch] Firecrawl found 0 matching jobs — falling back to GPT research for all roles");
    return fallbackGptResearch(targetRoles, targetCategories, requestedCount);
  } else if (jobs.length < requestedCount) {
    console.log(`[JobResearch] Firecrawl found ${jobs.length}/${requestedCount} — supplementing with GPT`);
    const remaining = requestedCount - jobs.length;
    const supplement = await fallbackGptResearch(targetRoles, targetCategories, remaining);
    jobs.push(...supplement);
  }

  console.log(`[JobResearch] Total jobs found via Apify: ${jobs.length}`);
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
          content: `Generate ${count} realistic job opportunities for: ${targetRoles} in ${targetCategories}.
Use only real companies. Return JSON array with: companyName, jobTitle, category, jobDescription (2 sentences), jobLink (real careers URL), salary, remote (bool), priority (High/Medium/Low). No markdown.`
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
      category: j.category || targetCategories.split(",")[0].trim(),
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
    } catch (err) {
      console.warn(`[JobResearch] Failed to add ${job.companyName}:`, err);
    }
  }

  console.log(`[JobResearch] Added ${addedCount} jobs to pipeline`);
  return addedCount;
}
