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
  hiringManagerName?: string;
  hiringManagerTitle?: string;
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getPriority(job: any): "High" | "Medium" | "Low" {
  const title = (job.job_title || "").toLowerCase();
  const isRemote = job.job_is_remote;
  if (title.includes("senior") || title.includes("vp") || title.includes("director") || isRemote) return "High";
  if (title.includes("manager") || title.includes("lead")) return "Medium";
  return "Low";
}

export async function researchNewJobs(count?: number, userId: number = 1): Promise<GeneratedJob[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const configs = await db.select().from(researchConfig).where(eq(researchConfig.userId, userId));
  const config = configs[0];

  const targetRoles = config?.targetRoles?.toString() || "Account Executive";
  const requestedCount = Math.min(count || 10, 10);
  const rapidApiKey = process.env.RAPIDAPI_KEY || process.env.JSEARCH_API_KEY;

  if (!rapidApiKey) throw new Error("RAPIDAPI_KEY is not configured");

  // Build search queries from target roles
  const roles = targetRoles.split(",").map(r => r.trim()).slice(0, 3);
  const jobs: GeneratedJob[] = [];

  for (const role of roles) {
    if (jobs.length >= requestedCount) break;

    const query = encodeURIComponent(`${role} B2B SaaS`);
    const url = `https://jsearch.p.rapidapi.com/search?query=${query}&num_pages=1&country=us&date_posted=month`;

    console.log(`[JobResearchService] Searching JSearch for: ${role}`);

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "x-rapidapi-host": "jsearch.p.rapidapi.com",
          "x-rapidapi-key": rapidApiKey,
        },
      });

      const responseText = await res.text();
      console.log(`[JobResearchService] JSearch status: ${res.status}, response: ${responseText.slice(0, 200)}`);

      if (!res.ok) {
        console.error(`[JobResearchService] JSearch error: ${res.status} - ${responseText}`);
        continue;
      }

      const data = JSON.parse(responseText) as any;
      const results = Array.isArray(data?.data) ? data.data : 
                      Array.isArray(data?.jobs) ? data.jobs :
                      Array.isArray(data) ? data : [];

      console.log(`[JobResearchService] Found ${results.length} real jobs for: ${role}`);

      for (const job of results) {
        if (jobs.length >= requestedCount) break;

        const companyName = job.employer_name || "Unknown Company";
        jobs.push({
          companyName,
          companyId: slugify(companyName),
          jobTitle: job.job_title || role,
          category: "B2B SaaS",
          contactName: "",
          contactEmail: "",
          linkedinUrl: job.employer_linkedin || "",
          jobDescription: job.job_description?.slice(0, 500) || "",
          jobLink: job.job_apply_link || job.job_google_link || "",
          salary: job.job_min_salary && job.job_max_salary
            ? `$${Math.round(job.job_min_salary / 1000)}k - $${Math.round(job.job_max_salary / 1000)}k`
            : job.job_salary_period ? `${job.job_salary_currency || "$"}${job.job_min_salary || ""}/${job.job_salary_period}` : "Competitive",
          remote: job.job_is_remote || false,
          priority: getPriority(job),
          source: "JSearch",
          hiringManagerName: "",
          hiringManagerTitle: "",
        });
      }
    } catch (err) {
      console.error(`[JobResearchService] Error fetching jobs for ${role}:`, err);
    }
  }

  console.log(`[JobResearchService] Total real jobs found: ${jobs.length}`);
  return jobs;
}

export async function addJobsToPipeline(jobs: GeneratedJob[], userId: number = 1): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let addedCount = 0;

  for (const job of jobs) {
    try {
      await db.insert(companies).values({
        userId,
        companyId: `${job.companyId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
        notes: job.source === "JSearch" ? "Live job posting via JSearch" : "",
      });
      addedCount++;
    } catch (err) {
      console.warn(`[JobResearchService] Failed to add job for ${job.companyName}:`, err);
    }
  }

  console.log(`[JobResearchService] Added ${addedCount} real jobs to pipeline`);
  return addedCount;
}
