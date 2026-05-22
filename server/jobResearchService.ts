import { getDb } from "./db";
import { buildLinkedInUrl, findCompanyLinkedIn } from "./linkedinService";
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
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getPriority(job: any): "High" | "Medium" | "Low" {
  const title = (job.title || "").toLowerCase();
  if (title.includes("vp") || title.includes("director") || title.includes("senior")) return "High";
  if (title.includes("manager") || title.includes("lead")) return "Medium";
  return "Low";
}

function formatSalary(job: any): string {
  const min = job.salary_min;
  const max = job.salary_max;
  if (min && max) return `$${Math.round(min / 1000)}k - $${Math.round(max / 1000)}k`;
  if (min) return `From $${Math.round(min / 1000)}k`;
  return "Competitive";
}

export async function researchNewJobs(count?: number, userId: number = 1): Promise<GeneratedJob[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const configs = await db.select().from(researchConfig).where(eq(researchConfig.userId, userId));
  const config = configs[0];

  const targetRoles = config?.targetRoles?.toString() || "Account Executive";
  const requestedCount = Math.min(count || 10, 10);

  const adzunaAppId = process.env.ADZUNA_APP_ID;
  const adzunaAppKey = process.env.ADZUNA_APP_KEY;

  if (!adzunaAppId || !adzunaAppKey) {
    throw new Error("ADZUNA_APP_ID and ADZUNA_APP_KEY are required");
  }

  const roles = targetRoles.split(",").map(r => r.trim()).slice(0, 3);
  const jobs: GeneratedJob[] = [];

  for (const role of roles) {
    if (jobs.length >= requestedCount) break;

    const query = encodeURIComponent(role);
    const url = `https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=${adzunaAppId}&app_key=${adzunaAppKey}&what=${query}&results_per_page=5&sort_by=date&max_days_old=30&content-type=application/json`;

    console.log(`[JobResearchService] Searching Adzuna for: ${role}`);

    try {
      const res = await fetch(url);
      const responseText = await res.text();
      console.log(`[JobResearchService] Adzuna status: ${res.status}, preview: ${responseText.slice(0, 100)}`);

      if (!res.ok) {
        console.error(`[JobResearchService] Adzuna error: ${res.status} - ${responseText}`);
        continue;
      }

      const data = JSON.parse(responseText) as any;
      const results = data?.results || [];

      console.log(`[JobResearchService] Found ${results.length} real jobs for: ${role}`);

      for (const job of results) {
        if (jobs.length >= requestedCount) break;

        const companyName = job.company?.display_name || "Unknown Company";
        
        // Try to find a real contact at this company via Hunter.io
        let contactName = "";
        let contactEmail = "";
        let contactTitle = "";
        let companyDomain = "";
        
        if (process.env.HUNTER_API_KEY) {
          try {
            const domain = extractDomain(companyName);
            companyDomain = domain;
            const hunterData = await getDomainInfo(domain);
            
            // Find the most senior sales/revenue contact
            const seniorTitles = ["vp", "vice president", "director", "head of", "chief", "svp", "evp"];
            const salesKeywords = ["sales", "revenue", "business development", "account", "growth", "commercial", "partnerships"];
            
            const contacts = hunterData?.emails || [];
            
            // Only use contact if they specifically match sales/revenue criteria
            const bestContact = contacts.find((c: any) => {
              const pos = (c.position || "").toLowerCase();
              const isSenior = seniorTitles.some(t => pos.includes(t));
              const isSales = salesKeywords.some(k => pos.includes(k));
              return isSenior && isSales;
            });
            
            // If no exact match, try just sales keywords at any level
            const fallbackContact = !bestContact ? contacts.find((c: any) => {
              const pos = (c.position || "").toLowerCase();
              return salesKeywords.some(k => pos.includes(k));
            }) : null;
            
            const selectedContact = bestContact || fallbackContact;
            
            if (selectedContact) {
              contactName = `${selectedContact.first_name || ""} ${selectedContact.last_name || ""}`.trim();
              contactEmail = selectedContact.email || "";
              contactTitle = selectedContact.position || "";
              console.log(`[JobResearchService] Found contact at ${companyName}: ${contactName} (${contactTitle})`);
            } else {
              console.log(`[JobResearchService] No sales contact found at ${companyName} - skipping`);
            }
          } catch (err) {
            // Hunter lookup failed silently - not critical
          }
        }

        // Derive careers page URL from job link domain
        let careersPage = "";
        try {
          const jobUrl = new URL(job.redirect_url || "");
          careersPage = `${jobUrl.protocol}//${jobUrl.hostname}/careers`;
        } catch {}

        console.log(`[JobResearchService] Job URL for ${companyName}: ${(job.redirect_url || "").slice(0, 100)}`);
        jobs.push({
          companyName,
          companyId: `${slugify(companyName)}-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
          jobTitle: job.title || role,
          category: job.category?.label || "B2B SaaS",
          contactName,
          contactEmail,
          linkedinUrl: await findCompanyLinkedIn(companyName),
          jobDescription: job.description?.slice(0, 500) || "",
          jobLink: job.redirect_url || "",
          salary: formatSalary(job),
          remote: (job.title || "").toLowerCase().includes("remote") || 
                  (job.description || "").toLowerCase().includes("remote"),
          priority: getPriority(job),
          source: "Adzuna",
        });
      }
    } catch (err) {
      console.error(`[JobResearchService] Error fetching from Adzuna for ${role}:`, err);
    }
  }

  console.log(`[JobResearchService] Total real jobs found: ${jobs.length}`);

  // If Adzuna returned nothing, fall back to AI-generated with real companies
  if (jobs.length === 0) {
    console.log("[JobResearchService] No Adzuna results, falling back to AI research");
    return fallbackAiResearch(targetRoles, requestedCount);
  }

  return jobs;
}

async function fallbackAiResearch(targetRoles: string, count: number): Promise<GeneratedJob[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Return only valid JSON arrays." },
        { role: "user", content: `Generate ${count} realistic job opportunities for: ${targetRoles}. Use only real companies: Salesforce, HubSpot, Gong, Outreach, Clari, Salesloft, ZoomInfo, Seismic, Highspot, 6sense, Demandbase, Gainsight, Drift, Chorus.ai. Return JSON array with: companyName, jobTitle, category, jobDescription (2 sentences), jobLink (real careers URL), salary, remote (bool), priority (High/Medium/Low). No markdown.` },
      ],
      max_tokens: 3000,
      temperature: 0.3,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI error: ${await res.text()}`);
  const data = await res.json() as any;
  let text = (data.choices?.[0]?.message?.content || "").trim();
  if (text.startsWith("```")) text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  if (!text.endsWith("]")) {
    const last = text.lastIndexOf("}");
    if (last > 0) text = text.slice(0, last + 1) + "]";
  }

  const parsed = JSON.parse(text);
  return (Array.isArray(parsed) ? parsed : []).map((j: any) => ({
    companyName: j.companyName || "Unknown",
    companyId: `${slugify(j.companyName || "co")}-${Date.now()}`,
    jobTitle: j.jobTitle || targetRoles.split(",")[0],
    category: j.category || "B2B SaaS",
    contactName: "", contactEmail: "", linkedinUrl: "",
    jobDescription: j.jobDescription || "",
    jobLink: j.jobLink || "",
    salary: j.salary || "Competitive",
    remote: j.remote === true,
    priority: ["High","Medium","Low"].includes(j.priority) ? j.priority : "Medium",
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
