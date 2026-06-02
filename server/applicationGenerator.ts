import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import { researchConfig } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ── Cover Letter Modes ────────────────────────────────────────────────────────
export type CoverLetterMode =
  | "traditional"
  | "executive"
  | "achievement"
  | "transition"
  | "startup"
  | "human";

const MODE_DESCRIPTIONS: Record<CoverLetterMode, string> = {
  traditional: "Corporate, ATS-friendly, conservative tone. Best for mid-level IC, finance, legal, government roles.",
  executive: "Leadership-focused, career story driven. Best for Director, VP, C-suite — use when title contains Director/VP/Head of/Lead/Manager.",
  achievement: "Metrics-first, quantified impact. Best for sales, revenue, quota-carrying roles (AE, CSM, SDR, RevOps).",
  transition: "Layoff recovery, career pivots, industry changes. Auto-selected when transition event detected.",
  startup: "Builder mentality, bias for action. Best for startup AE, SDR, PM roles.",
  human: "Relationship and impact focused. Best for nonprofit, healthcare, education sectors.",
};

// ── Narrative Brief (extracted from resume before generating letter) ──────────
export interface NarrativeBrief {
  professionalIdentity: string;
  careerTheme: string;
  transitionEvent: "layoff" | "acquisition" | "pivot" | "relocation" | "none" | null;
  transitionStatement: string;
  topAccomplishments: Array<{ metric: string; context: string; outcome: string }>;
  valueProposition: string;
  relevantSkills: string[];
  employerNeedsMatch: string;
  closingHook: string;
}

export interface CoverLetterScores {
  authenticity: number;
  relevance: number;
  readability: number;
  flags: string[];
}

export interface GeneratedCoverLetter {
  outreachMessage: string;
  coverLetter: string;
  narrativeBrief: NarrativeBrief;
  scores: CoverLetterScores;
  mode: CoverLetterMode;
}

// ── Auto-select mode based on job title and transition detection ──────────────
function autoSelectMode(jobTitle: string, transitionEvent: string | null): CoverLetterMode {
  if (transitionEvent && transitionEvent !== "none") return "transition";

  const title = jobTitle.toLowerCase();
  if (/director|vp|vice president|head of|chief|c-suite|cro|cso/.test(title)) return "executive";
  if (/account executive|ae|sdr|bdr|csm|revops|quota|sales/.test(title)) return "achievement";
  if (/nonprofit|social work|healthcare|nurse|teacher|counselor|education/.test(title)) return "human";
  if (/startup|early.stage|founding/.test(title)) return "startup";
  return "traditional";
}

// ── Detect career transition from resume data ─────────────────────────────────
function detectTransition(resumeText: string): "layoff" | "acquisition" | "pivot" | "relocation" | "none" {
  const lower = resumeText.toLowerCase();
  if (/laid off|restructur|reduction in force|rif|position eliminated/.test(lower)) return "layoff";
  if (/acqui|merger|acquired by|merged with/.test(lower)) return "acquisition";
  if (/career change|transitioning|pivoting|new direction/.test(lower)) return "pivot";
  return "none";
}

// ── Stage 1: Extract Narrative Brief from resume ──────────────────────────────
async function extractNarrativeBrief(
  resumeText: string,
  jobDescription: string,
  jobTitle: string,
  companyName: string
): Promise<NarrativeBrief> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a career narrative analyst. Extract the candidate's professional identity, career arc, transition context, and top accomplishments from their resume. Return ONLY valid JSON matching the NarrativeBrief schema. No preamble, no markdown, no explanation.`,
      },
      {
        role: "user",
        content: `Resume:
${resumeText}

Target Job: ${jobTitle} at ${companyName}
Job Description: ${jobDescription.slice(0, 1000)}

Extract and return this JSON:
{
  "professionalIdentity": "one sentence — who this person is professionally",
  "careerTheme": "the throughline across all roles",
  "transitionEvent": "layoff | acquisition | pivot | relocation | none",
  "transitionStatement": "one factual non-defensive sentence about the transition, or empty string",
  "topAccomplishments": [
    { "metric": "specific number or outcome", "context": "what role/situation", "outcome": "business impact" }
  ],
  "valueProposition": "what this candidate delivers that others don't",
  "relevantSkills": ["skill1", "skill2", "skill3"],
  "employerNeedsMatch": "how candidate experience addresses stated job requirements",
  "closingHook": "why this specific company and role is compelling to the candidate"
}

Return ONLY the JSON object. No markdown. No explanation.`,
      },
    ],
  });

  const text = (response.choices?.[0]?.message?.content || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");

  try {
    return JSON.parse(text) as NarrativeBrief;
  } catch {
    // Fallback brief if parse fails
    return {
      professionalIdentity: "An experienced professional with a strong track record.",
      careerTheme: "Consistent delivery of results across roles",
      transitionEvent: "none",
      transitionStatement: "",
      topAccomplishments: [],
      valueProposition: "Strong execution and relationship-building skills",
      relevantSkills: [],
      employerNeedsMatch: "Relevant experience aligned to role requirements",
      closingHook: "Excited by the opportunity to contribute to the team",
    };
  }
}

// ── Stage 2: Generate Cover Letter ───────────────────────────────────────────
async function generateCoverLetterFromBrief(
  brief: NarrativeBrief,
  mode: CoverLetterMode,
  jobTitle: string,
  companyName: string,
  hiringManager: string
): Promise<string> {
  const modeDesc = MODE_DESCRIPTIONS[mode];
  const salutation = hiringManager && hiringManager !== "Hiring Manager"
    ? `Dear ${hiringManager},`
    : "Dear Hiring Manager,";

  const transitionParagraph = brief.transitionEvent && brief.transitionEvent !== "none" && brief.transitionStatement
    ? `

${brief.transitionStatement}`
    : "";

  const accomplishmentsText = brief.topAccomplishments.length > 0
    ? brief.topAccomplishments
        .slice(0, 3)
        .map(a => `${a.metric} — ${a.context} — ${a.outcome}`)
        .join("; ")
    : "";

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an expert cover letter writer. Write in first person. Never fabricate metrics or experience not in the brief. 4 paragraphs plus a close. Plain text with paragraph breaks only. No headers, no bullet points. Mode: ${modeDesc}`,
      },
      {
        role: "user",
        content: `Write a cover letter for:
Role: ${jobTitle} at ${companyName}
Salutation: ${salutation}

Career Narrative:
- Identity: ${brief.professionalIdentity}
- Theme: ${brief.careerTheme}${transitionParagraph}
- Top accomplishments: ${accomplishmentsText}
- Value proposition: ${brief.valueProposition}
- Relevant skills: ${brief.relevantSkills.join(", ")}
- Why this role: ${brief.closingHook}
- How they match employer needs: ${brief.employerNeedsMatch}

Structure:
Paragraph 1: Who I am + why I am interested in ${companyName}
Paragraph 2: Career story${brief.transitionEvent !== "none" ? " + transition context (factual, never defensive)" : ""}
Paragraph 3: Relevant accomplishments and qualifications
Paragraph 4: Connection to ${companyName}'s specific needs + closing call to action

Start directly with the salutation. End with "Sincerely," followed by a blank line for the candidate name. 250-350 words.`,
      },
    ],
  });

  return (response.choices?.[0]?.message?.content || "").trim();
}

// ── Stage 3: Score the Cover Letter ──────────────────────────────────────────
async function scoreCoverLetter(
  coverLetter: string,
  jobDescription: string,
  companyName: string
): Promise<CoverLetterScores> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a cover letter quality reviewer. Score on three dimensions and return ONLY valid JSON. No markdown.`,
      },
      {
        role: "user",
        content: `Score this cover letter for a role at ${companyName}:

Cover Letter:
${coverLetter}

Job Description excerpt:
${jobDescription.slice(0, 500)}

Return this JSON:
{
  "authenticity": <1-10 — real career story, no generic phrases, no unsupported claims>,
  "relevance": <1-10 — addresses employer needs, JD keyword coverage, company name used>,
  "readability": <1-10 — clear, well-structured, 250-350 words, good paragraph flow>,
  "flags": ["list any issues here, or empty array if none"]
}

Return ONLY the JSON. No markdown.`,
      },
    ],
  });

  const text = (response.choices?.[0]?.message?.content || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");

  try {
    return JSON.parse(text) as CoverLetterScores;
  } catch {
    return { authenticity: 7, relevance: 7, readability: 7, flags: [] };
  }
}

// ── Generate outreach message (Page 1) ───────────────────────────────────────
function generateOutreachMessage(
  contactFirstName: string,
  companyName: string,
  jobTitle: string,
  candidateName: string
): string {
  const firstName = contactFirstName || "there";
  return `Hi ${firstName},

I'm exploring an opportunity at ${companyName} and was hoping you might be able to point me in the right direction. I came across the ${jobTitle} opening and I'm trying to figure out who the right person to connect with would be — whether that's the hiring manager or someone else on the team.

Any help you could offer would be greatly appreciated. Thank you so much, and I look forward to hearing from you soon.

${candidateName}`;
}

// ── Main export: Generate complete cover letter package ───────────────────────
export async function generateCoverLetter(
  companyName: string,
  jobTitle: string,
  jobDescription: string,
  contactName: string,
  userId?: number,
  requestedMode?: CoverLetterMode
): Promise<string> {
  // Get user's resume from researchConfig if userId provided
  let resumeText = "";
  if (userId) {
    try {
      const db = await getDb();
      if (db) {
        const configs = await db.select().from(researchConfig).where(eq(researchConfig.userId, userId));
        const config = configs[0];
        if (config?.lastDocumentParsed) {
          const parsed = typeof config.lastDocumentParsed === "string"
            ? JSON.parse(config.lastDocumentParsed)
            : config.lastDocumentParsed;

          // Use raw resume text if available (best for cover letter generation)
          if (parsed?.rawText) {
            resumeText = parsed.rawText;
          } else if (parsed?.extracted) {
            // Fall back to structured extracted data
            const e = parsed.extracted;
            resumeText = [
              e.candidateName ? `Name: ${e.candidateName}` : "",
              e.currentTitle ? `Current Title: ${e.currentTitle}` : "",
              e.summary ? `Summary: ${e.summary}` : "",
              e.experience ? `Experience: ${JSON.stringify(e.experience)}` : "",
              e.skills ? `Skills: ${JSON.stringify(e.skills)}` : "",
              e.education ? `Education: ${JSON.stringify(e.education)}` : "",
            ].filter(Boolean).join("

");
          }
        }
      }
    } catch (e) {
      console.warn("[CoverLetter] Could not load user resume:", e);
    }
  }

  // Fallback if no resume uploaded
  if (!resumeText) {
    console.warn("[CoverLetter] No resume found for userId", userId, "— using generic fallback");
    resumeText = `Experienced professional applying for ${jobTitle} role. Please upload a resume in Settings for a personalized cover letter.`;
  }

  // Stage 1 — Extract narrative
  const brief = await extractNarrativeBrief(resumeText, jobDescription, jobTitle, companyName);

  // Auto-select mode
  const mode = requestedMode || autoSelectMode(jobTitle, brief.transitionEvent);

  // Stage 2 — Generate cover letter
  let coverLetter = await generateCoverLetterFromBrief(brief, mode, jobTitle, companyName, contactName);

  // Stage 3 — Score (retry once if below threshold)
  let scores = await scoreCoverLetter(coverLetter, jobDescription, companyName);
  if (scores.authenticity < 7 || scores.relevance < 7) {
    console.log("[CoverLetter] Score below threshold — regenerating...");
    coverLetter = await generateCoverLetterFromBrief(brief, mode, jobTitle, companyName, contactName);
    scores = await scoreCoverLetter(coverLetter, jobDescription, companyName);
  }

  console.log(`[CoverLetter] Generated for ${companyName} — Mode: ${mode} — Scores: A${scores.authenticity}/R${scores.relevance}/R${scores.readability}`);

  return coverLetter;
}

// ── Generate tailored resume (unchanged) ─────────────────────────────────────
export async function generateTailoredResume(
  jobTitle: string,
  jobDescription: string,
  companyName: string,
  userId?: number
): Promise<string> {
  let resumeText = "";
  if (userId) {
    try {
      const db = await getDb();
      if (db) {
        const configs = await db.select().from(researchConfig).where(eq(researchConfig.userId, userId));
        const config = configs[0];
        if (config?.lastDocumentParsed) {
          const parsed = typeof config.lastDocumentParsed === "string"
            ? JSON.parse(config.lastDocumentParsed)
            : config.lastDocumentParsed;
          if (parsed?.rawText) {
            resumeText = parsed.rawText;
          } else if (parsed?.extracted) {
            const e = parsed.extracted;
            resumeText = [
              e.candidateName ? `Name: ${e.candidateName}` : "",
              e.summary ? `Summary: ${e.summary}` : "",
              e.experience ? `Experience: ${JSON.stringify(e.experience)}` : "",
              e.skills ? `Skills: ${JSON.stringify(e.skills)}` : "",
            ].filter(Boolean).join("

");
          }
        }
      }
    } catch (e) {
      console.warn("[TailoredResume] Could not load user resume:", e);
    }
  }

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "You are an expert resume writer. Create a tailored resume that highlights the most relevant experience for the specific role. Use plain text format with clear sections.",
      },
      {
        role: "user",
        content: `Create a tailored resume for a ${jobTitle} role at ${companyName}.

${resumeText ? `Candidate Resume:
${resumeText}

` : ""}Job Description:
${jobDescription}

Format as plain text. Emphasize experience and skills most relevant to this specific role. Keep to one page equivalent.`,
      },
    ],
  });

  return (response.choices?.[0]?.message?.content || "").trim();
}

// ── Generate both documents ───────────────────────────────────────────────────
export async function generateApplicationDocuments(
  companyName: string,
  jobTitle: string,
  jobDescription: string,
  contactName: string,
  userId?: number
): Promise<{ coverLetter: string; tailoredResume: string }> {
  const [coverLetter, tailoredResume] = await Promise.all([
    generateCoverLetter(companyName, jobTitle, jobDescription, contactName, userId),
    generateTailoredResume(jobTitle, jobDescription, companyName, userId),
  ]);
  return { coverLetter, tailoredResume };
}
