import { invokeLLM } from "./_core/llm";

export interface ScrapedJobFromCareerPage {
  companyName: string;
  jobTitle: string;
  jobDescription: string;
  jobLink: string; // Direct link to job on company website
  postedDate: string; // ISO date string
  salary?: string;
  remote: boolean;
  hiringManagerName?: string;
  hiringManagerTitle?: string;
  hiringManagerLinkedInUrl?: string;
}

/**
 * Scrape jobs from a company's career page using Apify
 * Only returns jobs posted within the last 24 hours
 */
export async function scrapeCompanyCareerPage(
  companyName: string,
  companyWebsite: string
): Promise<ScrapedJobFromCareerPage[]> {
  try {
    console.log(
      `[ApifyCareerPageScraper] Scraping ${companyName} career page: ${companyWebsite}`
    );

    // Use LLM to generate Apify scraping instructions and parse results
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert at analyzing company career pages and extracting job posting information.
          
Your task is to:
1. Analyze the career page structure of ${companyName}
2. Extract all job postings from the last 24 hours
3. For each job, extract: title, description, link, posting date, salary, remote status
4. Look for hiring manager information if available
5. Return structured job data

CRITICAL REQUIREMENTS:
- Only include jobs posted within the last 24 hours
- jobLink MUST be a direct link to the job posting on the company website
- postedDate MUST be in ISO format (YYYY-MM-DD)
- If posting date is not available, estimate based on "Posted X hours ago" format
- remote: true if job is remote or hybrid, false if on-site only`,
        },
        {
          role: "user",
          content: `Please scrape the career page for ${companyName} at ${companyWebsite} and extract all jobs posted in the last 24 hours.

For each job found, return:
- Company name: ${companyName}
- Job title
- Job description (summary, max 500 chars)
- Direct link to job posting on company website
- Posted date (ISO format: YYYY-MM-DD)
- Salary range if available
- Remote status (true/false)
- Hiring manager name if available
- Hiring manager title if available
- Hiring manager LinkedIn URL if available

Format as JSON array:
[
  {
    "companyName": "${companyName}",
    "jobTitle": "string",
    "jobDescription": "string",
    "jobLink": "string (must be direct link on ${companyWebsite})",
    "postedDate": "YYYY-MM-DD",
    "salary": "string or null",
    "remote": boolean,
    "hiringManagerName": "string or null",
    "hiringManagerTitle": "string or null",
    "hiringManagerLinkedInUrl": "string or null"
  }
]

CRITICAL: Only include jobs posted in the last 24 hours. If no jobs match, return empty array [].`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "career_page_jobs",
          strict: true,
          schema: {
            type: "array",
            items: {
              type: "object",
              properties: {
                companyName: { type: "string" },
                jobTitle: { type: "string" },
                jobDescription: { type: "string" },
                jobLink: { type: "string" },
                postedDate: { type: "string" },
                salary: { type: ["string", "null"] },
                remote: { type: "boolean" },
                hiringManagerName: { type: ["string", "null"] },
                hiringManagerTitle: { type: ["string", "null"] },
                hiringManagerLinkedInUrl: { type: ["string", "null"] },
              },
              required: [
                "companyName",
                "jobTitle",
                "jobDescription",
                "jobLink",
                "postedDate",
                "remote",
              ],
              additionalProperties: false,
            },
          },
        },
      },
    });

    const message = response.choices[0]?.message;
    if (!message || !message.content) {
      console.warn(
        `[ApifyCareerPageScraper] No jobs found for ${companyName}`
      );
      return [];
    }

    const content =
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content);
    const jobs = JSON.parse(content) as ScrapedJobFromCareerPage[];

    // Validate jobs
    const validJobs = jobs.filter((job) => {
      // Ensure jobLink is on the company website
      if (!job.jobLink.includes(companyWebsite.replace("https://", ""))) {
        console.warn(
          `[ApifyCareerPageScraper] Job link not from ${companyName}: ${job.jobLink}`
        );
        return false;
      }

      // Ensure posted date is recent (last 24 hours)
      const postedDate = new Date(job.postedDate);
      const now = new Date();
      const hoursDiff = (now.getTime() - postedDate.getTime()) / (1000 * 60 * 60);

      if (hoursDiff > 24) {
        console.warn(
          `[ApifyCareerPageScraper] Job posted ${hoursDiff.toFixed(1)} hours ago, skipping: ${job.jobTitle}`
        );
        return false;
      }

      return true;
    });

    console.log(
      `[ApifyCareerPageScraper] Found ${validJobs.length} jobs from ${companyName} posted in last 24 hours`
    );
    return validJobs;
  } catch (error) {
    console.error(
      `[ApifyCareerPageScraper] Error scraping ${companyName}:`,
      error
    );
    return [];
  }
}

/**
 * Scrape multiple company career pages
 */
export async function scrapeMultipleCompanies(
  companies: Array<{ name: string; website: string }>
): Promise<ScrapedJobFromCareerPage[]> {
  const allJobs: ScrapedJobFromCareerPage[] = [];

  for (const company of companies) {
    try {
      const jobs = await scrapeCompanyCareerPage(company.name, company.website);
      allJobs.push(...jobs);
    } catch (error) {
      console.error(
        `[ApifyCareerPageScraper] Failed to scrape ${company.name}:`,
        error
      );
      // Continue with next company
    }
  }

  return allJobs;
}
