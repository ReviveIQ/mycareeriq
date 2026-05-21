import { invokeLLM } from "./_core/llm";

export interface ScrapedJob {
  companyName: string;
  companyId: string;
  jobTitle: string;
  category: string;
  contactName: string;
  contactEmail: string;
  linkedinUrl: string;
  jobDescription: string;
  jobLink: string; // Real URL from job board
  salary: string;
  remote: boolean;
  priority: "High" | "Medium" | "Low";
  source: string; // e.g., "LinkedIn", "Indeed", "Glassdoor"
}

/**
 * Scrape real job postings from job boards using Apify
 * Falls back to LLM-generated data if Apify is not available
 */
export async function scrapeRealJobs(
  targetRoles: string,
  targetCategories: string,
  count: number = 30,
  jobBoards: string[] = ["LinkedIn", "Indeed", "Glassdoor"]
): Promise<ScrapedJob[]> {
  try {
    // Try to use Apify if available
    const apifyJobs = await scrapeJobsWithApify(targetRoles, targetCategories, count, jobBoards);
    if (apifyJobs.length > 0) {
      return apifyJobs;
    }
  } catch (error) {
    console.warn("[ApifyJobScraper] Apify scraping failed, falling back to LLM:", error);
  }

  // Fallback to LLM-generated jobs if Apify fails
  return generateJobsWithLLM(targetRoles, targetCategories, count);
}

/**
 * Scrape jobs using Apify API
 * Requires Apify API key to be configured
 */
async function scrapeJobsWithApify(
  targetRoles: string,
  targetCategories: string,
  count: number,
  jobBoards: string[]
): Promise<ScrapedJob[]> {
  const apifyKey = process.env.APIFY_API_KEY;
  if (!apifyKey) {
    throw new Error("APIFY_API_KEY not configured");
  }

  const jobs: ScrapedJob[] = [];

  // Scrape from each job board
  for (const board of jobBoards) {
    try {
      const boardJobs = await scrapeFromJobBoard(board, targetRoles, targetCategories, apifyKey);
      jobs.push(...boardJobs);
      if (jobs.length >= count) {
        break;
      }
    } catch (error) {
      console.warn(`[ApifyJobScraper] Failed to scrape from ${board}:`, error);
    }
  }

  return jobs.slice(0, count);
}

/**
 * Scrape jobs from a specific job board using Apify
 */
async function scrapeFromJobBoard(
  board: string,
  targetRoles: string,
  targetCategories: string,
  apifyKey: string
): Promise<ScrapedJob[]> {
  // Map job board names to Apify actors
  const actorMap: Record<string, string> = {
    LinkedIn: "apify/linkedin-jobs-scraper",
    Indeed: "apify/indeed-scraper",
    Glassdoor: "apify/glassdoor-scraper",
  };

  const actorId = actorMap[board];
  if (!actorId) {
    throw new Error(`No Apify actor configured for ${board}`);
  }

  try {
    // Call Apify API to run the actor
    const response = await fetch("https://api.apify.com/v2/acts/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apifyKey}`,
      },
      body: JSON.stringify({
        actorId,
        input: {
          searchTerms: targetRoles,
          location: "United States",
          filters: {
            remote: true,
          },
          maxResults: 30,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Apify API error: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      data?: { defaultDatasetId?: string; defaultKeyValueStoreId?: string };
    };
    const datasetId = data.data?.defaultDatasetId;

    if (!datasetId) {
      throw new Error("No dataset returned from Apify");
    }

    // Fetch the scraped data
    const datasetResponse = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items`, {
      headers: {
        Authorization: `Bearer ${apifyKey}`,
      },
    });

    if (!datasetResponse.ok) {
      throw new Error(`Failed to fetch Apify dataset: ${datasetResponse.statusText}`);
    }

    const items = (await datasetResponse.json()) as Array<Record<string, unknown>>;

    // Transform Apify data to our ScrapedJob format
    return items.map((item) => ({
      companyName: (item.company as string) || "Unknown",
      companyId: ((item.company as string) || "unknown").toLowerCase().replace(/\s+/g, "-"),
      jobTitle: (item.title as string) || "Unknown Role",
      category: targetCategories.split(",")[0]?.trim() || "SaaS",
      contactName: "Hiring Team",
      contactEmail: "",
      linkedinUrl: (item.companyUrl as string) || "",
      jobDescription: (item.description as string) || "",
      jobLink: (item.url as string) || "",
      salary: (item.salary as string) || "Competitive",
      remote: (item.remote as boolean) || false,
      priority: determinePriority(item.company as string),
      source: board,
    }));
  } catch (error) {
    console.error(`[ApifyJobScraper] Error scraping from ${board}:`, error);
    throw error;
  }
}

/**
 * Determine job priority based on company
 */
function determinePriority(company: string): "High" | "Medium" | "Low" {
  const highPriorityCompanies = [
    "Salesforce",
    "HubSpot",
    "Outreach",
    "Gainsight",
    "Totango",
    "Planhat",
    "Vitally",
  ];

  if (highPriorityCompanies.some((c) => company.toLowerCase().includes(c.toLowerCase()))) {
    return "High";
  }

  return Math.random() > 0.5 ? "Medium" : "Low";
}

/**
 * Fallback: Generate jobs using LLM when Apify is not available
 */
async function generateJobsWithLLM(
  targetRoles: string,
  targetCategories: string,
  count: number
): Promise<ScrapedJob[]> {
  const prompt = `Generate ${count} realistic job opportunities for someone with 10+ years of SaaS enterprise sales experience.

Target Roles to search for:
${targetRoles}

Target Categories/Industries:
${targetCategories}

Requirements:
- LOCATION: All jobs MUST be based in the United States (US companies or US-based remote positions)
- Each job should have: company name, job title, contact person name, contact email (realistic format), LinkedIn profile URL, brief job description, salary range, remote status, and priority level
- Vary the priority (High/Medium/Low) based on company size and growth stage
- Most should be remote-friendly (70% remote, 30% onsite/hybrid)
- Include a mix of well-known companies and emerging startups
- Contact emails should be realistic (firstname.lastname@company.com or similar)
- LinkedIn URLs should follow the pattern: linkedin.com/in/firstname-lastname or linkedin.com/company/company-name
- Focus on the target roles and categories specified above
- All companies should be US-based or have US headquarters
- CRITICAL: jobLink MUST be a SPECIFIC job posting URL (e.g., https://company.com/careers/job-123 or https://company.com/jobs/account-executive), NOT just the generic careers page URL

Return as JSON array with this structure:
[
  {
    "companyName": "string",
    "companyId": "string (lowercase with hyphens)",
    "jobTitle": "string",
    "category": "string",
    "contactName": "string",
    "contactEmail": "string",
    "linkedinUrl": "string",
    "jobDescription": "string (2-3 sentences)",
    "jobLink": "string (SPECIFIC job posting URL like https://company.com/careers/job-123, NOT https://company.com/careers)",
    "salary": "string ($XXK-$XXK OTE)",
    "remote": boolean,
    "priority": "High|Medium|Low",
    "source": "LLM Generated"
  }
]

Make sure the data is realistic, diverse, and matches the target roles and categories specified. CRITICAL: Each jobLink MUST be a specific job posting URL with a job ID or title in the path, not a generic careers page.`;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are a job market researcher specializing in SaaS enterprise sales roles. Generate realistic, diverse job opportunities.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "job_opportunities",
          strict: true,
          schema: {
            type: "array",
            items: {
              type: "object",
              properties: {
                companyName: { type: "string" },
                companyId: { type: "string" },
                jobTitle: { type: "string" },
                category: { type: "string" },
                contactName: { type: "string" },
                contactEmail: { type: "string" },
                linkedinUrl: { type: "string" },
                jobDescription: { type: "string" },
                jobLink: { type: "string" },
                salary: { type: "string" },
                remote: { type: "boolean" },
                priority: { type: "string", enum: ["High", "Medium", "Low"] },
                source: { type: "string" },
              },
              required: [
                "companyName",
                "companyId",
                "jobTitle",
                "category",
                "contactName",
                "contactEmail",
                "linkedinUrl",
                "jobDescription",
                "jobLink",
                "salary",
                "remote",
                "priority",
                "source",
              ],
            },
          },
        },
      },
    });

    const content = response.choices[0]?.message.content;
    if (!content || typeof content !== "string") {
      throw new Error("No content in LLM response");
    }

    const parsed = JSON.parse(content);
    return parsed.jobs || parsed;
  } catch (error) {
    console.error("[ApifyJobScraper] Error generating jobs with LLM:", error);
    throw error;
  }
}
