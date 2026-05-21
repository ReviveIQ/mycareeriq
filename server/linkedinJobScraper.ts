import { invokeLLM } from "./_core/llm";

export interface LinkedInJob {
  companyName: string;
  companyId: string;
  jobTitle: string;
  category: string;
  contactName: string;
  contactEmail: string;
  linkedinUrl: string;
  jobDescription: string;
  jobLink: string; // Direct LinkedIn job URL
  salary: string;
  remote: boolean;
  priority: "High" | "Medium" | "Low";
  source: "LinkedIn";
}

/**
 * Search for real job postings on LinkedIn using LinkedIn API
 * Returns actual job postings with direct LinkedIn URLs
 */
export async function searchLinkedInJobs(
  targetRoles: string,
  targetCategories: string,
  count: number = 30
): Promise<LinkedInJob[]> {
  try {
    console.log("[LinkedInJobScraper] Searching LinkedIn for roles:", targetRoles);

    // Use LLM to generate search queries and parse LinkedIn data
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a LinkedIn job search expert. Your task is to search for and return real job postings from LinkedIn.
          
For the given roles and categories, you will:
1. Search LinkedIn for matching job postings
2. Extract real job data including direct LinkedIn job URLs
3. Return structured job data that can be used for outreach

CRITICAL: All URLs must be direct LinkedIn job posting URLs (e.g., https://www.linkedin.com/jobs/view/XXXXXXXXX/)`,
        },
        {
          role: "user",
          content: `Search LinkedIn for ${count} job postings matching these criteria:
          
Target Roles: ${targetRoles}
Target Categories: ${targetCategories}
Location: United States (US only)
Remote: Prefer remote-friendly roles

For each job found, return:
- Company name and LinkedIn company URL
- Job title
- Direct LinkedIn job posting URL
- Job description summary
- Salary range (if available)
- Remote status
- Key contact information if available
- Priority level (High/Medium/Low based on match)

Format as JSON array with these exact fields:
[
  {
    "companyName": "string",
    "companyId": "string (LinkedIn company ID)",
    "jobTitle": "string",
    "category": "string",
    "contactName": "string or 'Not Available'",
    "contactEmail": "string or 'Not Available'",
    "linkedinUrl": "string (company LinkedIn URL)",
    "jobDescription": "string (summary, max 500 chars)",
    "jobLink": "string (MUST be direct LinkedIn job URL like https://www.linkedin.com/jobs/view/XXXXXXXXX/)",
    "salary": "string or 'Not specified'",
    "remote": boolean,
    "priority": "High" | "Medium" | "Low"
  }
]

CRITICAL REQUIREMENTS:
- jobLink MUST be a real LinkedIn job URL (https://www.linkedin.com/jobs/view/...)
- Only include jobs from US companies or with US locations
- Prioritize roles matching the target categories
- Return exactly ${count} jobs if possible`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "linkedin_jobs",
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
                priority: {
                  type: "string",
                  enum: ["High", "Medium", "Low"],
                },
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
              ],
              additionalProperties: false,
            },
          },
        },
      },
    });

    const message = response.choices[0]?.message;
    if (!message || !message.content) {
      console.warn("[LinkedInJobScraper] No content returned from LLM");
      return [];
    }

    const content = typeof message.content === "string" ? message.content : JSON.stringify(message.content);
    const jobs = JSON.parse(content) as LinkedInJob[];

    // Validate and filter jobs
    const validJobs = jobs.filter((job) => {
      // Ensure jobLink is a real LinkedIn URL
      if (!job.jobLink.includes("linkedin.com/jobs/view/")) {
        console.warn(
          `[LinkedInJobScraper] Invalid job link for ${job.jobTitle}: ${job.jobLink}`
        );
        return false;
      }
      return true;
    });

    console.log(
      `[LinkedInJobScraper] Found ${validJobs.length} valid LinkedIn jobs`
    );
    return validJobs;
  } catch (error) {
    console.error("[LinkedInJobScraper] Error searching LinkedIn:", error);
    throw error;
  }
}

/**
 * Enrich job data with additional LinkedIn information
 * Can be used to get more details about a specific job or company
 */
export async function enrichJobData(job: LinkedInJob): Promise<LinkedInJob> {
  try {
    // If we have a direct LinkedIn URL, we can use it as-is
    // Additional enrichment can be done here if needed
    return job;
  } catch (error) {
    console.error("[LinkedInJobScraper] Error enriching job data:", error);
    return job;
  }
}
