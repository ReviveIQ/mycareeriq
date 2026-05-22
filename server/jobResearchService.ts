import { getDb } from "./db";
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
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function stripJsonFences(raw: string): string {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  return text.trim();
}

export async function researchNewJobs(count?: number, userId: number = 1): Promise<GeneratedJob[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const configs = await db.select().from(researchConfig).where(eq(researchConfig.userId, userId));
  const config = configs[0];

  const targetRoles = config?.targetRoles?.toString() || "Account Executive";
  const targetCategories = config?.targetCategories?.toString() || "B2B SaaS";
  const requestedCount = Math.min(count || 10, 10);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  console.log(`[JobResearchService] Researching ${requestedCount} real jobs via OpenAI web search`);

  const prompt = `Search for ${requestedCount} REAL, currently open job postings for these roles: ${targetRoles}
In these industries: ${targetCategories}

For each real job you find, return:
- companyName: the actual company name
- jobTitle: the actual job title from the posting  
- category: the industry
- jobDescription: 2-3 sentences from the actual job description
- jobLink: the real URL to apply (LinkedIn, company careers page, Indeed, etc)
- salary: compensation range if listed, otherwise "Competitive"
- remote: true or false
- priority: "High" for Fortune 500 or fast-growing SaaS, "Medium" for mid-market, "Low" for others
- hiringCompanyLinkedIn: company LinkedIn URL

Focus on companies that are well-known in B2B SaaS, Revenue Intelligence, Sales Enablement.
Only include jobs posted in the last 30 days.

Return ONLY a valid JSON array of ${requestedCount} jobs. No markdown, no explanation.`;

  const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-search-preview",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 4000,
    }),
  });

  if (!chatRes.ok) {
    const err = await chatRes.text();
    console.error("[JobResearchService] OpenAI error:", err);
    
    // Fallback to gpt-4o without web search if search-preview not available
    return researchJobsWithGpt4o(targetRoles, targetCategories, requestedCount, apiKey);
  }

  const chatData = await chatRes.json() as any;
  const rawText = chatData.choices?.[0]?.message?.content || "";

  if (!rawText) {
    return researchJobsWithGpt4o(targetRoles, targetCategories, requestedCount, apiKey);
  }

  try {
    const parsed = JSON.parse(stripJsonFences(rawText));
    const jobs = Array.isArray(parsed) ? parsed : [];
    
    console.log(`[JobResearchService] Found ${jobs.length} jobs via web search`);
    
    return jobs.map((job: any) => ({
      companyName: job.companyName || "Unknown Company",
      companyId: slugify(job.companyName || "company"),
      jobTitle: job.jobTitle || targetRoles.split(",")[0],
      category: job.category || targetCategories.split(",")[0],
      contactName: "",
      contactEmail: "",
      linkedinUrl: job.hiringCompanyLinkedIn || "",
      jobDescription: job.jobDescription || "",
      jobLink: job.jobLink || "",
      salary: job.salary || "Competitive",
      remote: job.remote === true,
      priority: ["High", "Medium", "Low"].includes(job.priority) ? job.priority : "Medium",
      source: "OpenAI Web Search",
    }));
  } catch {
    return researchJobsWithGpt4o(targetRoles, targetCategories, requestedCount, apiKey);
  }
}

// Fallback: use gpt-4o without web search for well-known companies
async function researchJobsWithGpt4o(
  targetRoles: string,
  targetCategories: string,
  count: number,
  apiKey: string
): Promise<GeneratedJob[]> {
  console.log("[JobResearchService] Falling back to gpt-4o research");

  const prompt = `Generate ${count} realistic job opportunities for someone targeting these roles: ${targetRoles}
In these industries: ${targetCategories}

Use ONLY real, well-known companies that actively hire for these roles (e.g. Salesforce, HubSpot, Gong, Outreach, Clari, Salesloft, ZoomInfo, Seismic, Highspot, Mindtickle, Chorus.ai, Revenue.io, Drift, 6sense, Demandbase, Gainsight, ChurnZero, Totango).

For each job return:
- companyName: real company name
- jobTitle: realistic title matching target roles
- category: industry
- jobDescription: 2-3 sentences describing the role
- jobLink: real careers page URL (e.g. https://salesforce.com/careers)
- salary: realistic range (e.g. "$120,000 - $160,000 + commission")
- remote: true or false
- priority: "High", "Medium", or "Low"
- hiringCompanyLinkedIn: real LinkedIn company URL

Return ONLY a valid JSON array. No markdown, no preamble.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a job market research assistant. Return only valid JSON arrays." },
        { role: "user", content: prompt },
      ],
      max_tokens: 4000,
      temperature: 0.3,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI error: ${await res.text()}`);

  const data = await res.json() as any;
  const rawText = data.choices?.[0]?.message?.content || "";

  // Repair truncated JSON
  let jsonStr = rawText.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  if (!jsonStr.endsWith("]")) {
    const last = jsonStr.lastIndexOf("}");
    if (last > 0) jsonStr = jsonStr.slice(0, last + 1) + "]";
  }

  const parsed = JSON.parse(jsonStr);
  const jobs = Array.isArray(parsed) ? parsed : [];

  console.log(`[JobResearchService] Generated ${jobs.length} jobs via gpt-4o`);

  return jobs.map((job: any) => ({
    companyName: job.companyName || "Unknown Company",
    companyId: `${slugify(job.companyName || "company")}-${Date.now()}`,
    jobTitle: job.jobTitle || targetRoles.split(",")[0],
    category: job.category || targetCategories.split(",")[0],
    contactName: "",
    contactEmail: "",
    linkedinUrl: job.hiringCompanyLinkedIn || "",
    jobDescription: job.jobDescription || "",
    jobLink: job.jobLink || "",
    salary: job.salary || "Competitive",
    remote: job.remote === true,
    priority: ["High", "Medium", "Low"].includes(job.priority) ? job.priority : "Medium",
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
        companyId: `${job.companyId}-${Math.random().toString(36).slice(2, 6)}`,
        companyName: job.companyName,
        category: job.category,
        jobTitle: job.jobTitle,
        jobDescription: job.jobDescription,
        jobLink: job.jobLink,
        contactName: job.contactName,
        contactEmail: job.contactEmail,
        linkedinUrl: job.linkedinUrl,
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
