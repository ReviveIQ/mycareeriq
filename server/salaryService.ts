/**
 * Salary extraction + estimation service
 *
 * Priority order:
 * 1. ATS structured salary field (already parsed by Greenhouse/Ashby/Lever)
 * 2. Regex parse from job description text
 * 3. GPT estimate based on job title + seniority + company (fallback)
 */

// ── Step 1: Parse ATS salary field ───────────────────────────────────────────
// ATS fields sometimes return things like:
//   "$120,000 - $160,000"
//   "120000-160000"
//   "Up to $200,000"
//   "£50,000 - £65,000"
//   "Competitive" (useless)
//   "" (blank)
export function parseAtsSalaryField(raw: string): string {
  if (!raw || !raw.trim()) return "";
  const lower = raw.toLowerCase().trim();

  // Skip useless values
  if (
    lower === "competitive" ||
    lower === "doe" ||
    lower === "negotiable" ||
    lower === "tbd" ||
    lower === "n/a" ||
    lower.length < 4
  ) return "";

  // Already looks like a real range — clean it up
  if (/\$[\d,]+/.test(raw) || /£[\d,]+/.test(raw)) {
    return raw.trim().replace(/\s+/g, " ");
  }

  // Numeric range without symbol — add $
  const numericRange = raw.match(/^(\d{4,6})\s*[-–to]+\s*(\d{4,6})$/);
  if (numericRange) {
    const lo = parseInt(numericRange[1]);
    const hi = parseInt(numericRange[2]);
    if (lo > 30000 && hi > lo) {
      return `$${(lo / 1000).toFixed(0)}K - $${(hi / 1000).toFixed(0)}K`;
    }
  }

  return raw.trim();
}

// ── Step 2: Regex parse from job description ──────────────────────────────────
// Handles formats like:
//   $150,000 - $200,000
//   $150K - $200K OTE
//   $150,000 to $200,000 annually
//   Up to $250,000
//   Between $120K and $180K
//   Base: $100K + OTE $200K
export function parseSalaryFromDescription(description: string): string {
  if (!description) return "";

  // Decode HTML entities first
  const text = description
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");

  const patterns = [
    // $150,000 - $200,000 OTE or $150K - $200K
    /\$[\d,]+[Kk]?\s*[-–to]+\s*\$[\d,]+[Kk]?(?:\s*(?:OTE|USD|annually|per year|\/yr)?)?/,
    // $150,000 to $200,000
    /\$[\d,]+\s+to\s+\$[\d,]+/,
    // Up to $250,000
    /up to\s+\$[\d,]+[Kk]?/i,
    // Base salary: $120K
    /base(?:\s+salary)?[:\s]+\$[\d,]+[Kk]?/i,
    // OTE: $200K or OTE of $200,000
    /OTE[:\s]+\$[\d,]+[Kk]?/i,
    // Between $X and $Y
    /between\s+\$[\d,]+[Kk]?\s+and\s+\$[\d,]+[Kk]?/i,
    // $120,000 + commission
    /\$[\d,]+(?:,\d{3})+\s*\+\s*(?:commission|bonus|OTE)/i,
    // £50,000 - £65,000
    /£[\d,]+\s*[-–]\s*£[\d,]+/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return normalizeRange(match[0].trim());
    }
  }

  return "";
}

// ── Normalize salary string ───────────────────────────────────────────────────
function normalizeRange(raw: string): string {
  // Convert full numbers to K notation: $150,000 → $150K
  return raw
    .replace(/\$(\d{1,3}),(\d{3})/g, (_, a, b) => {
      const full = parseInt(a + b);
      return `$${Math.round(full / 1000)}K`;
    })
    .replace(/\s+/g, " ")
    .trim();
}

// ── Step 3: GPT estimate as last resort ───────────────────────────────────────
const ESTIMATE_CACHE = new Map<string, string>(); // simple in-process cache

export async function estimateSalaryWithGPT(
  jobTitle: string,
  companyName: string,
  category: string,
  description: string
): Promise<string> {
  const cacheKey = `${jobTitle}|${category}`.toLowerCase();
  if (ESTIMATE_CACHE.has(cacheKey)) return ESTIMATE_CACHE.get(cacheKey)!;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "";

  // Extract seniority signals from title
  const titleLower = jobTitle.toLowerCase();
  const isExecutive = /\b(vp|vice president|svp|evp|chief|cro|cso|cmo)\b/.test(titleLower);
  const isDirector = /\b(director|head of)\b/.test(titleLower);
  const isManager = /\b(manager|lead|senior|sr\.?)\b/.test(titleLower);
  const isEnterprise = /\b(enterprise|strategic|global|major accounts)\b/.test(titleLower);

  // Limit description to 400 chars for context
  const descSnippet = description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // cheap model — just need a number
        max_tokens: 60,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: `You are a compensation analyst. Return ONLY a salary range in this exact format: "$XXXk - $XXXk OTE" or "$XXXk - $XXXk base". No other text. Use US market rates. For sales roles include OTE (on-target earnings). For non-sales roles use base salary.`,
          },
          {
            role: "user",
            content: `Job title: ${jobTitle}
Company: ${companyName}
Category: ${category}
Seniority signals: ${[isExecutive && "executive", isDirector && "director", isManager && "manager/senior", isEnterprise && "enterprise scope"].filter(Boolean).join(", ") || "individual contributor"}
Description snippet: ${descSnippet}

Estimate the compensation range for this role.`,
          },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return "";
    const data = await res.json() as any;
    const estimate = (data.choices?.[0]?.message?.content || "").trim();

    // Validate it looks like a real range
    if (/\$\d+k?\s*[-–]\s*\$\d+k?/i.test(estimate)) {
      ESTIMATE_CACHE.set(cacheKey, estimate);
      return estimate;
    }
    return "";
  } catch {
    return "";
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────
export async function resolveSalary(
  atsSalaryField: string,
  jobDescription: string,
  jobTitle: string,
  companyName: string,
  category: string
): Promise<string> {
  // 1. ATS structured field
  const fromAts = parseAtsSalaryField(atsSalaryField);
  if (fromAts) return fromAts;

  // 2. Parse from description text
  const fromDesc = parseSalaryFromDescription(jobDescription);
  if (fromDesc) return fromDesc;

  // 3. GPT estimate
  const estimated = await estimateSalaryWithGPT(jobTitle, companyName, category, jobDescription);
  if (estimated) return `~${estimated} est.`;

  return "";
}
