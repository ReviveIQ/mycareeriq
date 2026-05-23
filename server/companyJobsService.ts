/**
 * Company Jobs Service
 * Fetches live job postings directly from company ATS systems
 * Supports Greenhouse, Lever, and Workday
 */

// Known company slugs for Greenhouse and Lever
const GREENHOUSE_SLUGS: Record<string, string> = {
  // Sales & Revenue
  "hubspot": "hubspot",
  "salesforce": "salesforce",
  "gong": "gong",
  "salesloft": "salesloft",
  "outreach": "outreach",
  "seismic": "seismic",
  "highspot": "highspot",
  "clari": "clari",
  "zoominfo": "zoominfo",
  "6sense": "6sense",
  "demandbase": "demandbase",
  "gainsight": "gainsight",
  "drift": "drift",
  "chorus": "chorus",
  "mindtickle": "mindtickle",
  "churnzero": "churnzero",
  "totango": "totango",
  "apollo": "apolloio",
  "klue": "klue",
  "showpad": "showpad",
  "revenue": "revenue",

  // Enterprise SaaS
  "zendesk": "zendesk",
  "freshworks": "freshworks",
  "pipedrive": "pipedrive",
  "monday": "mondaydotcom",
  "asana": "asana",
  "workday": "workday",
  "servicenow": "servicenow",
  "twilio": "twilio",
  "datadog": "datadog",
  "snowflake": "snowflake",
  "databricks": "databricks",
  "hashicorp": "hashicorp",
  "elastic": "elastic",
  "confluent": "confluent",
  "gitlab": "gitlab",
  "cloudflare": "cloudflare",
  "fastly": "fastly",
  "okta": "okta",
  "auth0": "auth0",
  "pagerduty": "pagerduty",
  "splunk": "splunk",
  "dynatrace": "dynatrace",
  "new relic": "newrelic",
  "newrelic": "newrelic",

  // Tech / Engineering
  "stripe": "stripe",
  "plaid": "plaid",
  "brex": "brex",
  "rippling": "rippling",
  "gusto": "gusto",
  "lattice": "lattice",
  "notion": "notion",
  "figma": "figma",
  "loom": "loom",
  "retool": "retool",
  "airtable": "airtable",
  "vercel": "vercel",
  "linear": "linear",
  "intercom": "intercom",
  "segment": "segment",
  "amplitude": "amplitude",
  "mixpanel": "mixpanel",
  "looker": "looker",
  "dbt labs": "dbtlabs",
  "fivetran": "fivetran",
  "airbyte": "airbyte",
  "prefect": "prefect",

  // Healthcare & Biotech
  "veeva": "veeva",
  "epic": "epic",
  "athenahealth": "athenahealth",
  "modernizing medicine": "modmed",
  "doximity": "doximity",
  "health catalyst": "healthcatalyst",
  "hims": "hims",
  "teladoc": "teladoc",
  "23andme": "23andme",
  "tempus": "tempus",
  "flatiron": "flatironhealth",
  "color": "color",

  // Finance & Fintech
  "robinhood": "robinhood",
  "chime": "chime",
  "affirm": "affirm",
  "marqeta": "marqeta",
  "adyen": "adyen",
  "carta": "carta",
  "expensify": "expensify",
  "bill": "billcom",
  "ramp": "ramp",
  "clearbit": "clearbit",

  // Marketing & Growth
  "klaviyo": "klaviyo",
  "iterable": "iterable",
  "braze": "braze",
  "sprout social": "sproutsocial",
  "hootsuite": "hootsuite",
  "semrush": "semrush",
  "moz": "moz",
  "yotpo": "yotpo",
  "bazaarvoice": "bazaarvoice",
  "wpengine": "wpengine",

  // E-commerce & Retail
  "shopify": "shopify",
  "bigcommerce": "bigcommerce",
  "klaviyo": "klaviyo",
  "attentive": "attentive",
  "yotpo": "yotpo",
  "gorgias": "gorgias",
  "recharge": "rechargepayments",
  "aftership": "aftership",

  // Education & EdTech
  "coursera": "coursera",
  "udemy": "udemy",
  "chegg": "chegg",
  "duolingo": "duolingo",
  "instructure": "instructure",
  "nearpod": "nearpod",
  "renaissance": "renaissance",
  "powerschool": "powerschool",
  "panorama": "panoramaeducation",
  "newsela": "newsela",

  // Cybersecurity
  "crowdstrike": "crowdstrike",
  "sentinelone": "sentinelone",
  "palo alto networks": "paloaltonetworks",
  "fortinet": "fortinet",
  "tenable": "tenable",
  "rapid7": "rapid7",
  "qualys": "qualys",
  "darktrace": "darktrace",
  "lacework": "lacework",
  "snyk": "snyk",
  "wiz": "wiz",

  // HR & Workforce
  "greenhouse": "greenhouse",
  "lever": "lever",
  "bamboohr": "bamboohr",
  "hibob": "hibob",
  "namely": "namely",
  "paycor": "paycor",
  "leapsome": "leapsome",
  "15five": "15five",
  "betterworks": "betterworks",
  "reflektive": "reflektive",

  // Legal & Compliance
  "ironclad": "ironclad",
  "docusign": "docusign",
  "clio": "clio",
  "litera": "litera",
  "relativity": "relativity",

  // Real Estate & PropTech
  "opendoor": "opendoor",
  "compass": "compass",
  "zillow": "zillow",
  "redfin": "redfin",
  "costar": "costar",
  "matterport": "matterport",

  // Logistics & Supply Chain
  "flexport": "flexport",
  "project44": "project44",
  "samsara": "samsara",
  "keep truckin": "keeptruckin",
  "locus robotics": "locusrobotics",

  // Media & Content
  "buzzfeed": "buzzfeed",
  "vox media": "voxmedia",
  "dotdash meredith": "dotdashmeredith",
  "axios": "axios",

  // Enterprise Legacy
  "cisco": "cisco",
  "oracle": "oracle",
  "sap": "sap",
  "vmware": "vmware",
  "dell": "dell",
  "hp": "hp",
  "ibm": "ibm",
};

const LEVER_SLUGS: Record<string, string> = {
  // Tech
  "netflix": "netflix",
  "airbnb": "airbnb",
  "twitter": "twitter",
  "pinterest": "pinterest",
  "reddit": "reddit",
  "quora": "quora",
  "medium": "medium",
  "lyft": "lyft",
  "doordash": "doordash",
  "instacart": "instacart",
  "grubhub": "grubhub",
  "postmates": "postmates",
  "peloton": "peloton",
  "wayfair": "wayfair",
  "chewy": "chewy",
  "rover": "rover",
  "wealthfront": "wealthfront",
  "betterment": "betterment",
  "sofi": "sofi",
  "nubank": "nubank",
  "opentable": "opentable",
  "eventbrite": "eventbrite",
  "squarespace": "squarespace",
  "wix": "wix",
  "canva": "canva",
  "miro": "miro",
  "invision": "invision",
  "typeform": "typeform",
  "surveymonkey": "surveymonkey",
  "docusign": "docusign",
  "pandadoc": "pandadoc",
  "hellosign": "hellosign",
};

export interface CompanyJob {
  id: string;
  title: string;
  location: string;
  department: string;
  applyUrl: string;
  postedAt?: string;
  source: "greenhouse" | "lever" | "adzuna";
}

function normalizeCompanyName(name: string): string {
  return name.toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "")
    .replace(/inc$|llc$|corp$|ltd$|group$/, "");
}

export async function fetchCompanyJobs(companyName: string): Promise<CompanyJob[]> {
  const normalized = normalizeCompanyName(companyName);
  const jobs: CompanyJob[] = [];

  // Try Greenhouse first
  const ghSlug = GREENHOUSE_SLUGS[normalized] || normalized;
  try {
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${ghSlug}/jobs?content=true`, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (res.ok) {
      const data = await res.json() as any;
      const ghJobs = (data.jobs || []).slice(0, 10);
      console.log(`[CompanyJobs] Found ${ghJobs.length} jobs via Greenhouse for ${companyName}`);
      for (const job of ghJobs) {
        jobs.push({
          id: String(job.id),
          title: job.title || "",
          location: job.location?.name || "See posting",
          department: job.departments?.[0]?.name || "",
          applyUrl: job.absolute_url || `https://boards.greenhouse.io/${ghSlug}/jobs/${job.id}`,
          postedAt: job.updated_at,
          source: "greenhouse",
        });
      }
      if (jobs.length > 0) return jobs;
    }
  } catch (err) {
    console.warn(`[CompanyJobs] Greenhouse failed for ${companyName}:`, err);
  }

  // Try Lever
  const leverSlug = LEVER_SLUGS[normalized] || normalized;
  try {
    const res = await fetch(`https://api.lever.co/v0/postings/${leverSlug}?mode=json`, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (res.ok) {
      const data = await res.json() as any;
      const leverJobs = (Array.isArray(data) ? data : []).slice(0, 10);
      console.log(`[CompanyJobs] Found ${leverJobs.length} jobs via Lever for ${companyName}`);
      for (const job of leverJobs) {
        jobs.push({
          id: job.id || "",
          title: job.text || "",
          location: job.categories?.location || job.workplaceType || "See posting",
          department: job.categories?.department || job.categories?.team || "",
          applyUrl: job.hostedUrl || job.applyUrl || "",
          postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : undefined,
          source: "lever",
        });
      }
      if (jobs.length > 0) return jobs;
    }
  } catch (err) {
    console.warn(`[CompanyJobs] Lever failed for ${companyName}:`, err);
  }

  console.log(`[CompanyJobs] No direct ATS found for ${companyName}`);
  return [];
}
