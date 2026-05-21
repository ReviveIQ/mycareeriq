import { invokeLLM } from "./_core/llm";

/**
 * Resume content extracted from Bryan's PDF
 */
const RESUME_DATA = {
  name: "Bryan Greer",
  location: "Fort Lauderdale, FL",
  phone: "(561) 213-8316",
  email: "Bryan.Greer1@gmail.com",
  linkedin: "LinkedIn",
  summary: `Growth-focused Account Manager and post-sales revenue leader with 10+ years of revenue increasing experience driving renewals, expansion, and customer lifetime value across SaaS and digital platform industries. Proven track record managing multimillion-dollar enterprise portfolios, delivering ~7M+ in expansion and renewal revenue, and consistently exceeding growth targets.`,
  experience: [
    {
      company: "BG Consulting",
      location: "Remote, FL",
      title: "Lead/Principal Consultant",
      dates: "08/24 - Present",
      bullets: [
        "Partner with SaaS and digital platform organizations to diagnose revenue performance gaps and design scalable account management, renewal, and expansion strategies aligned to growth targets for companies with profit up to ~$50M",
        "Advise leadership teams on revenue modeling, pipeline forecasting, and lifecycle management frameworks",
        "Build and optimize post-sale revenue motions by working with customer success, product adoption, and account strategy",
        "Identify opportunities within existing customer bases and develop structured growth plans that convert adoption into measurable revenue increases through renewal and upsell opportunities",
      ],
    },
    {
      company: "Renaissance Learning / Nearpod, Inc",
      location: "Sunrise, FL",
      title: "Enterprise Growth Account Manager",
      dates: "01/19 - 11/25",
      bullets: [
        "Delivered ~$7M+ in renewal and expansion revenue across an 11-state enterprise territory through disciplined forecasting, account planning, and lifecycle management",
        "Responsible for managing post-sale revenue performance across complex enterprise portfolios, aligning adoption milestones with regional growth targets and averaging ~20%+ across all clients",
        "Improved forecast visibility and revenue predictability by maintaining optimized and automated pipeline management and renewal tracking",
        "Expanded regional revenue opportunities by identifying whitespace within existing districts and aligning adoption strategies with customer growth objectives",
        "Conducted executive business reviews (QBRs) that translated adoption metrics and ROI insights into expansion opportunities with senior customer stakeholders",
      ],
    },
    {
      company: "DexYP (Thryv)",
      location: "Boca Raton, FL",
      title: "Growth Account Executive",
      dates: "02/15 - 12/18",
      bullets: [
        "Ranked top 0.3% of company performers and earned President's Club recognition for sustained revenue growth and account performance",
        "Increased customer lifetime value by ensuring product adoption matched client measurable business outcomes through consultative engagement and performance analytics",
        "Expanded account revenue by an average of ~15% by identifying additional digital marketing opportunities and positioning automation tools",
        "Built long-term client relationships that drove consistent upsell and cross-sell activity averaging ~30% within a highly competitive digital marketing environment",
      ],
    },
  ],
  skills: {
    leadership: ["Revenue Leadership", "Sales team scaling", "Revenue ownership", "Organizational design", "Performance management"],
    operations: ["Pipeline analytics", "Forecast modeling", "Funnel diagnostics", "KPI development", "Revenue visibility"],
    strategy: ["GTM planning", "Product launch strategy", "Market positioning", "Customer acquisition frameworks", "Revenue growth strategy"],
    technical: ["Salesforce", "HubSpot", "Zoho", "Revenue dashboards", "Advanced Excel", "CRM analytics"],
  },
  education: "Florida Atlantic University - College of Business - Bachelor of Science, Marketing and Advertising",
};

/**
 * Generate a custom, friendly cover letter tailored to a specific company and role
 */
export async function generateCoverLetter(
  companyName: string,
  jobTitle: string,
  jobDescription: string,
  contactName: string
): Promise<string> {
  const prompt = `You are an expert cover letter writer. Generate a warm, friendly, and direct cover letter (no business jargon) for Bryan Greer applying to ${companyName} for the ${jobTitle} role.

Key guidelines:
- Write in a conversational, friendly tone (like talking to a friend)
- Avoid corporate buzzwords and jargon
- Be direct and authentic
- Show genuine interest in the company and role
- Highlight relevant experience from his background
- Keep it concise (3-4 short paragraphs)
- Make it personal and human

Bryan's Background:
- 10+ years in SaaS revenue leadership and account management
- Expertise in renewals, expansion, and customer lifetime value
- Proven track record delivering millions in revenue
- Strong at building relationships and understanding customer needs
- Experience with enterprise and mid-market customers

Job Description:
${jobDescription}

Contact Name: ${contactName}

Generate the cover letter in plain text format (no HTML). Start directly with the greeting.`;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "You are an expert cover letter writer who creates warm, friendly, and direct cover letters without business jargon.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const content = response.choices[0]?.message.content;
  const coverLetter = typeof content === "string" ? content : "";
  return coverLetter;
}

/**
 * Generate a tailored resume focused on skills and experience relevant to the specific role
 */
export async function generateTailoredResume(
  jobTitle: string,
  jobDescription: string,
  companyName: string
): Promise<string> {
  const prompt = `You are an expert resume writer. Create a tailored resume for Bryan Greer applying to ${companyName} for the ${jobTitle} role.

Key guidelines:
- Reorder and emphasize experience most relevant to this specific role
- Highlight skills that match the job description
- Keep the same professional summary but make it more targeted
- Focus on achievements and metrics that align with the role
- Use bullet points for clarity
- Keep it to 1 page format (plain text)

Bryan's Full Background:
Name: ${RESUME_DATA.name}
Location: ${RESUME_DATA.location}
Phone: ${RESUME_DATA.phone}
Email: ${RESUME_DATA.email}

Professional Summary:
${RESUME_DATA.summary}

Experience:
${RESUME_DATA.experience
  .map(
    (exp) => `
${exp.title} at ${exp.company} (${exp.dates})
${exp.bullets.map((b) => `• ${b}`).join("\n")}
`
  )
  .join("\n")}

Skills:
Leadership: ${RESUME_DATA.skills.leadership.join(", ")}
Operations: ${RESUME_DATA.skills.operations.join(", ")}
Strategy: ${RESUME_DATA.skills.strategy.join(", ")}
Technical: ${RESUME_DATA.skills.technical.join(", ")}

Education: ${RESUME_DATA.education}

Job Description for Context:
${jobDescription}

Generate a tailored resume in plain text format that emphasizes the most relevant experience and skills for this ${jobTitle} role at ${companyName}.`;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "You are an expert resume writer who creates tailored resumes that highlight the most relevant experience for specific roles.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const content = response.choices[0]?.message.content;
  const resume = typeof content === "string" ? content : "";
  return resume;
}

/**
 * Generate both cover letter and resume in parallel
 */
export async function generateApplicationDocuments(
  companyName: string,
  jobTitle: string,
  jobDescription: string,
  contactName: string
): Promise<{ coverLetter: string; tailoredResume: string }> {
  const [coverLetter, tailoredResume] = await Promise.all([
    generateCoverLetter(companyName, jobTitle, jobDescription, contactName),
    generateTailoredResume(jobTitle, jobDescription, companyName),
  ]);

  return { coverLetter, tailoredResume };
}
