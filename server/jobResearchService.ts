import { invokeLLM } from "./_core/llm";
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
  source: "AIResearch";
  hiringManagerName?: string;
  hiringManagerTitle?: string;
  hiringManagerLinkedInUrl?: string;
}

export async function researchNewJobs(count?: number, userId: number = 1): Promise<GeneratedJob[]> {
  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Fetch user's research configuration
    const configs = await db.select().from(researchConfig).where(eq(researchConfig.userId, userId));
    const config = configs[0];

    const targetRoles = config?.targetRoles?.toString() || "Account Executive, Enterprise Account Executive, Sales Manager";
    const targetCategories = config?.targetCategories?.toString() || "B2B SaaS, Revenue Intelligence, Sales Enablement";
    const requestedCount = count || config?.rolesPerDay || 10;

    console.log(`[JobResearchService] Researching ${requestedCount} opportunities via OpenAI for roles: ${targetRoles}`);

    const prompt = `You are a B2B sales intelligence researcher with deep knowledge of the tech industry hiring landscape.

Research and generate ${requestedCount} realistic job opportunities for someone targeting these roles: ${targetRoles}
In these industries: ${targetCategories}

For each opportunity return a JSON object with these exact fields:
- companyName: real, well-known company name that hires for these roles
- jobTitle: realistic job title matching the target roles
- category: one of the target industries
- contactName: realistic full name of a VP or Director level hiring manager
- contactTitle: their realistic title (e.g. "VP of Sales", "Director of Revenue")
- linkedinUrl: realistic LinkedIn profile URL format (https://linkedin.com/in/firstname-lastname)
- jobDescription: 2-3 sentences describing the role responsibilities and requirements
- salary: realistic compensation range (e.g. "$120,000 - $160,000 + commission")
- remote: true or false (mix of both)
- priority: "High" for fast-growing companies, "Medium" for established, "Low" for others
- estimatedCompanySize: "Startup", "Mid-Market", or "Enterprise"
- jobLink: realistic careers page URL for the company

Return ONLY a valid JSON array. No markdown, no explanation, no preamble. Start with [ and end with ].`;

    const invokeResult = await invokeLLM({
      system: "You are a precise job market research assistant. Always return valid JSON arrays only.",
      prompt,
      max_tokens: 4000,
    });

    // Extract text content from InvokeResult
    const rawContent = invokeResult.choices?.[0]?.message?.content;
    const responseText = typeof rawContent === "string" 
      ? rawContent 
      : Array.isArray(rawContent) 
        ? (rawContent as any[]).map((p: any) => p?.text || "").join("") 
        : "";
    let jsonStr = responseText.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    }

    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) {
      throw new Error("OpenAI did not return an array");
    }

    // Map to GeneratedJob format
    const jobs: GeneratedJob[] = parsed.map((item: any) => ({
      companyName: item.companyName || "Unknown Company",
      companyId: (item.companyName || "unknown").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
      jobTitle: item.jobTitle || targetRoles.split(",")[0].trim(),
      category: item.category || targetCategories.split(",")[0].trim(),
      contactName: item.contactName || "Hiring Manager",
      contactEmail: "",
      linkedinUrl: item.linkedinUrl || "",
      jobDescription: item.jobDescription || "",
      jobLink: item.jobLink || `https://${(item.companyName || "company").toLowerCase().replace(/\s+/g, "")}.com/careers`,
      salary: item.salary || "Competitive",
      remote: item.remote === true,
      priority: ["High", "Medium", "Low"].includes(item.priority) ? item.priority : "Medium",
      source: "AIResearch",
      hiringManagerName: item.contactName,
      hiringManagerTitle: item.contactTitle,
      hiringManagerLinkedInUrl: item.linkedinUrl,
    }));

    console.log(`[JobResearchService] Successfully researched ${jobs.length} opportunities`);
    return jobs;

  } catch (error) {
    console.error("[JobResearchService] Error researching jobs:", error);
    throw error;
  }
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
        notes: job.hiringManagerName ? `Hiring Manager: ${job.hiringManagerName} (${job.hiringManagerTitle})` : "",
      });
      addedCount++;
    } catch (err) {
      console.warn(`[JobResearchService] Failed to add job for ${job.companyName}:`, err);
    }
  }

  console.log(`[JobResearchService] Added ${addedCount} jobs to pipeline`);
  return addedCount;
}
// Build: Fri May 22 00:51:37 UTC 2026
