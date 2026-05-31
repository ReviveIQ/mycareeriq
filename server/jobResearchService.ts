import { getDb } from "./db";
import { buildLinkedInUrl, findCompanyLinkedIn, buildContactLinkedIn } from "./linkedinService";
import { getDomainInfo, extractDomain } from "./hunterService";
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
  if (t.includes("vp") || t.includes("director") || t.includes("senior")) return "High";
  if (t.includes("manager") || t.includes("lead")) return "Medium";
  return "Low";
}

export async function researchNewJobs(count?: number, userId: number = 1): Promise<GeneratedJob[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const configs = await db.select().from(researchConfig).where(eq(researchConfig.userId, userId));
  const config = configs[0];

  const targetRoles = config?.targetRoles?.toString() || "Account Executive, Sales Manager";
  const targetCategories = config?.targetCategories?.toString() || "B2B SaaS";
  const requestedCount = Math.min(count || config?.rolesPerDay || 10, 30);

  console.log(`[JobResearchService] Researching ${requestedCount} jobs for: ${targetRoles}`);

  const jobs = await aiResearchJobs(targetRoles, targetCategories, requestedCount);

  // Enrich contacts via Hunter.io if available
  if (process.env.HUNTER_API_KEY) {
    for (const job of jobs) {
      if (job.contactName) continue; // already has contact
      try {
        const domain = extractDomain(job.companyName);
        const hunterData = await getDomainInfo(domain);
        const contacts = hunterData?.emails || [];

        const salesKeywords = ["sales", "revenue", "business development", "account", "growth", "commercial"];
        const seniorTitles = ["vp", "vice president", "director", "head of", "chief", "svp"];

        const best = contacts.find((c: any) => {
          const pos = (c.position || "").toLowerCase();
          return seniorTitles.some(t => pos.includes(t)) && salesKeywords.some(k => pos.includes(k));
        }) || contacts.find((c: any) => {
          const pos = (c.position || "").toLowerCase();
          return salesKeywords.some(k => pos.includes(k));
        });

        if (best) {
          job.contactName = `${best.first_name || ""} ${best.last_name || ""}`.trim();
          job.contactEmail = best.email || "";
          job.contactLinkedIn = best.linkedin_url || buildContactLinkedIn(best.first_name || "", best.last_name || "");
          console.log(`[JobResearchService] Found contact at ${job.companyName}: ${job.contactName}`);
        }
      } catch { /* Hunter lookup non-critical */ }
    }
  }

  // Enrich LinkedIn company URLs
  for (const job of jobs) {
    if (!job.linkedinUrl) {
      try {
        job.linkedinUrl = await findCompanyLinkedIn(job.companyName);
      } catch { /* non-critical */ }
    }
  }

  console.log(`[JobResearchService] Total jobs researched: ${jobs.length}`);
  return jobs;
}

async function aiResearchJobs(targetRoles: string, targetCategories: string, count: number): Promise<GeneratedJob[]> {
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
          content: `Generate ${count} realistic job opportunities for the following search:

Target Roles: ${targetRoles}
Target Categories: ${targetCategories}
Location: United States only
Preference: Remote-friendly roles

Use only real, well-known companies in these categories. Do not invent obscure companies.

Return a JSON array where each object has exactly these fields:
- companyName: string (real company name)
- jobTitle: string (realistic title matching the role)
- category: string (industry category)
- jobDescription: string (2-3 sentences describing the role)
- jobLink: string (real careers page URL, e.g. https://company.com/careers)
- salary: string (e.g. "$120k - $160k" or "Competitive")
- remote: boolean
- priority: "High" | "Medium" | "Low" (based on seniority of role)

Return ONLY the JSON array. No other text.`
        }
      ],
      max_tokens: 4000,
      temperature: 0.4,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI error: ${await res.text()}`);
  const data = await res.json() as any;
  let text = (data.choices?.[0]?.message?.content || "").trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");

  // Repair truncated JSON
  if (!text.endsWith("]")) {
    const last = text.lastIndexOf("}");
    if (last > 0) text = text.slice(0, last + 1) + "]";
  }

  let parsed: any[];
  try {
    parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) parsed = [];
  } catch {
    console.error("[JobResearchService] Failed to parse AI jobs response");
    parsed = [];
  }

  return parsed.map((j: any) => ({
    companyName: j.companyName || "Unknown",
    companyId: `${slugify(j.companyName || "co")}-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
    jobTitle: j.jobTitle || targetRoles.split(",")[0].trim(),
    category: j.category || targetCategories.split(",")[0].trim(),
    contactName: "",
    contactEmail: "",
    linkedinUrl: "",
    contactLinkedIn: "",
    jobDescription: j.jobDescription || "",
    jobLink: j.jobLink || "",
    salary: j.salary || "Competitive",
    remote: j.remote === true,
    priority: ["High","Medium","Low"].includes(j.priority) ? j.priority : getPriority(j.jobTitle || ""),
    source: "AI Research",
  }));
}

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
      console.warn(`[JobResearchService] Failed to add ${job.companyName}:`, err);
    }
  }

  console.log(`[JobResearchService] Added ${addedCount} jobs to pipeline`);
  return addedCount;
}
