import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import { applications, companies, researchConfig } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { scrapeCompanyCareerPage, scrapeMultipleCompanies } from "./apifyCareerPageScraper";
import { enrichJobWithHiringManager } from "./linkedinHiringManagerFinder";

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
  source: "CareerPage";
  hiringManagerName?: string;
  hiringManagerTitle?: string;
  hiringManagerLinkedInUrl?: string;
}

export async function researchNewJobs(count?: number, userId: number = 1): Promise<GeneratedJob[]> {
  try {
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    // Fetch user's research configuration
    const configs = await db.select().from(researchConfig).where(eq(researchConfig.userId, userId));
    const config = configs[0];

    // Use config values or defaults
    const targetRoles = config?.targetRoles?.toString() || "Enterprise Account Manager, Account Executive, Sales Manager";
    const targetCategories = config?.targetCategories?.toString() || "SaaS, Revenue Intelligence, Sales Enablement";
    const targetCompaniesStr = config?.targetCompanies?.toString() || "";

    // Parse target companies from config
    const companyList = targetCompaniesStr
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (companyList.length === 0) {
      console.warn(
        "[JobResearchService] No target companies configured, skipping research"
      );
      return [];
    }

    console.log(
      `[JobResearchService] Researching ${companyList.length} companies for jobs posted in last 24 hours`
    );

    // Scrape company career pages for jobs posted in last 24 hours
    const scrapedJobs = await scrapeMultipleCompanies(
      companyList.map((name) => ({
        name,
        website: `https://${name.toLowerCase().replace(/\s+/g, "")}.com`,
      }))
    );

    // Enrich jobs with hiring manager information from LinkedIn
    const enrichedJobs: GeneratedJob[] = [];
    for (const job of scrapedJobs) {
      try {
        const hiringManagerInfo = await enrichJobWithHiringManager(
          job.companyName,
          job.jobTitle,
          targetCategories
        );

        enrichedJobs.push({
          companyName: job.companyName,
          companyId: job.companyName.toLowerCase().replace(/\s+/g, "-"),
          jobTitle: job.jobTitle,
          category: targetCategories,
          contactName: hiringManagerInfo.hiringManagerName || "Not Available",
          contactEmail: hiringManagerInfo.hiringManagerEmail || "",
          linkedinUrl: hiringManagerInfo.hiringManagerLinkedInUrl || "",
          jobDescription: job.jobDescription,
          jobLink: job.jobLink,
          salary: job.salary || "Not specified",
          remote: job.remote,
          priority: job.remote ? "High" : "Medium",
          source: "CareerPage",
          hiringManagerName: hiringManagerInfo.hiringManagerName,
          hiringManagerTitle: hiringManagerInfo.hiringManagerTitle,
          hiringManagerLinkedInUrl: hiringManagerInfo.hiringManagerLinkedInUrl,
        });
      } catch (error) {
        console.warn(
          `[JobResearchService] Failed to enrich job for ${job.jobTitle}:`,
          error
        );
        // Add job without hiring manager info
        enrichedJobs.push({
          companyName: job.companyName,
          companyId: job.companyName.toLowerCase().replace(/\s+/g, "-"),
          jobTitle: job.jobTitle,
          category: targetCategories,
          contactName: "Not Available",
          contactEmail: "",
          linkedinUrl: "",
          jobDescription: job.jobDescription,
          jobLink: job.jobLink,
          salary: job.salary || "Not specified",
          remote: job.remote,
          priority: job.remote ? "High" : "Medium",
          source: "CareerPage",
        });
      }
    }

    return enrichedJobs;
  } catch (error) {
    console.error("[JobResearchService] Error researching jobs:", error);
    throw error;
  }
}

export async function addJobsToPipeline(jobs: GeneratedJob[], userId: number = 1): Promise<number> {
  // For backwards compatibility, if no userId provided, use owner's user ID (1)
  const actualUserId = userId || 1;
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    let addedCount = 0;

    for (const job of jobs) {
      try {
        // Insert into companies table (pipeline) instead of applications
        await db.insert(companies).values({
          userId: actualUserId,
          companyId: job.companyId,
          companyName: job.companyName,
          category: job.category,
          jobTitle: job.jobTitle,
          jobDescription: job.jobDescription,
          jobLink: job.jobLink, // Direct link to job posting on company website
          contactName: job.contactName,
          contactEmail: job.contactEmail,
          linkedinUrl: job.linkedinUrl,
          remote: job.remote,
          salary: job.salary,
          companySize: "", // Will be populated later if needed
          priority: job.priority,
          stage: "Research", // New jobs start in Research stage
          notes: job.hiringManagerName ? `Hiring Manager: ${job.hiringManagerName} (${job.hiringManagerTitle})` : "",
        });
        addedCount++;
      } catch (err) {
        console.warn(`[JobResearchService] Failed to add job for ${job.companyName}:`, err);
        // Continue with next job
      }
    }

    return addedCount;
  } catch (error) {
    console.error("[JobResearchService] Error adding jobs to pipeline:", error);
    throw error;
  }
}
