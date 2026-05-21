import { invokeLLM } from "./_core/llm";

export interface HiringManager {
  name: string;
  title: string;
  linkedinUrl: string;
  linkedinProfileId?: string;
  email?: string;
  company: string;
  department: string;
}

/**
 * Find hiring managers on LinkedIn for a specific role at a company
 * Uses LinkedIn API to search for decision makers
 */
export async function findHiringManagers(
  companyName: string,
  jobTitle: string,
  department: string = "Sales"
): Promise<HiringManager[]> {
  try {
    console.log(
      `[LinkedInHiringManagerFinder] Finding hiring managers for ${jobTitle} at ${companyName}`
    );

    // Use LLM to search LinkedIn and find hiring managers
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert at finding hiring managers and decision makers on LinkedIn.
          
Your task is to:
1. Search LinkedIn for hiring managers at the specified company
2. Find people in relevant departments (Sales, Revenue, Business Development, etc.)
3. Identify decision makers who would be involved in hiring for the role
4. Extract their LinkedIn profile information
5. Return structured hiring manager data

CRITICAL REQUIREMENTS:
- linkedinUrl MUST be a direct LinkedIn profile URL (https://www.linkedin.com/in/username/)
- Only return real LinkedIn profiles
- Prioritize people with titles related to the role (e.g., VP Sales, Sales Director, Head of Revenue)
- Include email if available on LinkedIn profile`,
        },
        {
          role: "user",
          content: `Find hiring managers on LinkedIn for the following:

Company: ${companyName}
Role: ${jobTitle}
Department: ${department}

Search LinkedIn for decision makers and hiring managers who would be involved in hiring for this role.

For each hiring manager found, return:
- Full name
- Job title
- LinkedIn profile URL (must be https://www.linkedin.com/in/...)
- LinkedIn profile ID (if available)
- Email address (if available on profile)
- Company name
- Department

Format as JSON array:
[
  {
    "name": "string",
    "title": "string",
    "linkedinUrl": "string (https://www.linkedin.com/in/...)",
    "linkedinProfileId": "string or null",
    "email": "string or null",
    "company": "${companyName}",
    "department": "${department}"
  }
]

CRITICAL: 
- Only include real LinkedIn profiles
- linkedinUrl MUST be valid LinkedIn profile URLs
- Return up to 5 most relevant hiring managers
- If no hiring managers found, return empty array []`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "hiring_managers",
          strict: true,
          schema: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                title: { type: "string" },
                linkedinUrl: { type: "string" },
                linkedinProfileId: { type: ["string", "null"] },
                email: { type: ["string", "null"] },
                company: { type: "string" },
                department: { type: "string" },
              },
              required: ["name", "title", "linkedinUrl", "company", "department"],
              additionalProperties: false,
            },
          },
        },
      },
    });

    const message = response.choices[0]?.message;
    if (!message || !message.content) {
      console.warn(
        `[LinkedInHiringManagerFinder] No hiring managers found for ${jobTitle} at ${companyName}`
      );
      return [];
    }

    const content =
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content);
    const managers = JSON.parse(content) as HiringManager[];

    // Validate hiring managers
    const validManagers = managers.filter((manager) => {
      // Ensure linkedinUrl is a real LinkedIn profile URL
      if (!manager.linkedinUrl.includes("linkedin.com/in/")) {
        console.warn(
          `[LinkedInHiringManagerFinder] Invalid LinkedIn URL: ${manager.linkedinUrl}`
        );
        return false;
      }
      return true;
    });

    console.log(
      `[LinkedInHiringManagerFinder] Found ${validManagers.length} hiring managers for ${jobTitle} at ${companyName}`
    );
    return validManagers;
  } catch (error) {
    console.error(
      `[LinkedInHiringManagerFinder] Error finding hiring managers:`,
      error
    );
    return [];
  }
}

/**
 * Find hiring manager for a specific job
 * Prioritizes the primary hiring manager (usually the direct manager)
 */
export async function findPrimaryHiringManager(
  companyName: string,
  jobTitle: string,
  department: string = "Sales"
): Promise<HiringManager | null> {
  const managers = await findHiringManagers(companyName, jobTitle, department);
  return managers.length > 0 ? managers[0] : null;
}

/**
 * Enrich job data with hiring manager information
 */
export async function enrichJobWithHiringManager(
  companyName: string,
  jobTitle: string,
  department: string = "Sales"
): Promise<{
  hiringManagerName?: string;
  hiringManagerTitle?: string;
  hiringManagerLinkedInUrl?: string;
  hiringManagerEmail?: string;
}> {
  try {
    const manager = await findPrimaryHiringManager(
      companyName,
      jobTitle,
      department
    );

    if (!manager) {
      return {};
    }

    return {
      hiringManagerName: manager.name,
      hiringManagerTitle: manager.title,
      hiringManagerLinkedInUrl: manager.linkedinUrl,
      hiringManagerEmail: manager.email,
    };
  } catch (error) {
    console.error("[LinkedInHiringManagerFinder] Error enriching job:", error);
    return {};
  }
}
