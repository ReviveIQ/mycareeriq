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
          content: `Generate a list of ${count} real companies that are actively hiring for these roles: ${targetRoles}

Focus on companies in these categories: ${targetCategories}

Requirements:
- Must be real, well-known companies with active hiring
- Mix of enterprise (Salesforce, HubSpot) and growth-stage (Gong, Outreach, Clari)
- US-based or US hiring
- Vary the companies each time — don't always return the same list

Return a JSON array where each object has:
- name: company name (string)
- domain: company website domain only, e.g. "salesforce.com" (string)  
- careersUrl: direct URL to their careers/jobs page, e.g. "https://salesforce.com/careers" (string)
- category: one of the target categories above (string)

Return ONLY the JSON array.`
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

// ── Step 2: Scrape career page via Apify ──────────────────────────────────────
async function scrapeCareerPage(
  careersUrl: string,
  targetRoles: string
): Promise<Array<{ title: string; description: string; url: string; salary?: string; remote?: boolean }>> {
  const apifyKey = process.env.APIFY_API_KEY;
  if (!apifyKey) {
    console.warn("[JobResearch] APIFY_API_KEY not set — skipping scrape");
    return [];
  }

  try {
    // Use Apify's Website Content Crawler actor
    const runRes = await fetch(
      "https://api.apify.com/v2/acts/apify~website-content-crawler/run-sync-get-dataset-items?token=" + apifyKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startUrls: [{ url: careersUrl }],
          maxCrawlPages: 5,
          crawlerType: "cheerio",
          maxCrawlDepth: 2,
          timeoutSecs: 40,
          maxSessionRotations: 0,
        }),
        signal: AbortSignal.timeout(45000),
      }
    );

    if (!runRes.ok) {
      console.warn(`[JobResearch] Apify scrape failed for ${careersUrl}: ${runRes.status}`);
      return [];
    }

    const pages = await runRes.json() as any[];
    if (!pages || pages.length === 0) return [];

    // Combine all page text
    const allText = pages.map((p: any) => p.text || p.markdown || "").join("\n\n").slice(0, 15000);

    if (!allText.trim()) return [];

    // Use GPT to extract matching job postings from the scraped text
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return [];

    const extractRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "Extract job postings from career page content. Return only valid JSON." },
          {
            role: "user",
            content: `From this career page content, extract job postings that match these roles: ${targetRoles}

Career page content:
${allText}

Return a JSON array of matching jobs. Each object must have:
- title: exact job title as listed (string)
- description: 2-3 sentence summary of the role (string)
- url: direct link to the job posting if found, otherwise empty string (string)
- salary: salary range if mentioned, otherwise empty string (string)
- remote: true if remote/hybrid is mentioned, false otherwise (boolean)

Only include roles that genuinely match the target roles. If no matches found, return empty array [].
Return ONLY the JSON array.`
          }
        ],
        max_tokens: 1500,
        temperature: 0.2,
      }),
    });

    if (!extractRes.ok) return [];
    const extractData = await extractRes.json() as any;
    let extractText = (extractData.choices?.[0]?.message?.content || "").trim()
      .replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");

    const jobs = JSON.parse(extractText);
    return Array.isArray(jobs) ? jobs : [];
  } catch (err) {
    console.warn(`[JobResearch] Scrape error for ${careersUrl}:`, err);
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
    console.warn("[JobResearch] Apify found 0 jobs — falling back to GPT research for all roles");
    return fallbackGptResearch(targetRoles, targetCategories, requestedCount);
  } else if (jobs.length < requestedCount) {
    console.log(`[JobResearch] Apify found ${jobs.length}/${requestedCount} — supplementing with GPT`);
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
        linkedinUrl: job.linkedinUrl,
        contactLinkedIn: job.contactLinkedIn,
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
