/**
 * Document Intake Router
 *
 * Generic, reusable document parsing system. The first use case is resume parsing
 * for the job-search pipeline, but the same router supports any document type
 * (prospect brief, company overview, sales brief, etc.) via the `documentType`
 * parameter. Nothing here hardcodes "resume" beyond the default value and the
 * resume-specific prompt template; new types can be added in `getSystemPrompt`.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { researchConfig } from "../drizzle/schema";
import { invokeLLM } from "./_core/llm";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { storageGetSignedUrl, storagePut } from "./storage";
import {
  normalizeRoles,
  mergeWithSuggestedIndustries,
  looksLikeSalesResume,
  CANONICAL_AE_ROLES,
  SUGGESTED_AE_INDUSTRIES,
} from "./roleNormalization";

/**
 * Generic structure that all parsed documents return.
 * Different document types extend this in `extracted`.
 */
export type ParsedDocument = {
  documentType: string;
  parsedAt: string;
  extracted: Record<string, unknown>;
};

/**
 * Resume-specific extraction shape (also used to seed the pipeline config).
 */
export type ParsedResume = {
  candidateName?: string;
  targetRoles?: string[];
  targetIndustries?: string[];
  skills?: string[];
  seniorityLevel?: "entry" | "mid" | "senior" | "executive" | string;
  yearsOfExperience?: number;
  summary?: string;
};

/**
 * Returns the system prompt for a given document type. Adding a new type
 * later is a one-line change here — the router itself stays generic.
 */
function getSystemPrompt(documentType: string): string {
  const type = documentType.toLowerCase();

  if (type === "resume" || type === "cv") {
    return `You are a document intelligence system. Parse the uploaded resume and extract structured data.

IMPORTANT - targetRoles must be REAL, JOB-BOARD-SEARCHABLE titles that recruiters actually post.
DO NOT invent abstract or marketing-style labels (e.g. "Account Growth Professional", "Revenue Hunter", "Growth Executive", "Sales Professional").
Use canonical titles such as: ${CANONICAL_AE_ROLES.join(", ")}.
If the resume signals sales/AE work, prefer the most specific canonical title that matches the candidate's seniority.

IMPORTANT - targetIndustries must be searchable industry/category terms.
When the resume is sales-track, you SHOULD include relevant verticals from this list when applicable: ${SUGGESTED_AE_INDUSTRIES.join(", ")}.
Do not invent industries; only include ones supported by the resume.

Extract:
- candidateName
- targetRoles (array of REAL job titles, see above)
- targetIndustries (array of industries)
- skills (array of skills)
- seniorityLevel (entry/mid/senior/executive)
- yearsOfExperience (number)
- summary (2 sentence professional summary)

Return ONLY valid JSON. No preamble, no markdown.`;
  }

  if (type === "prospect_brief" || type === "prospect-brief") {
    return `You are a document intelligence system. Parse the uploaded prospect brief and extract structured data.

Extract:
- companyName
- industry
- companySize (number of employees if mentioned)
- keyContacts (array of {name, title})
- painPoints (array of strings)
- buyingSignals (array of strings)
- summary (2 sentence summary)

Return ONLY valid JSON. No preamble, no markdown.`;
  }

  if (type === "company_overview" || type === "company-overview") {
    return `You are a document intelligence system. Parse the uploaded company overview and extract structured data.

Extract:
- companyName
- industry
- products (array of product names)
- targetMarket (string)
- competitors (array of strings)
- summary (2 sentence summary)

Return ONLY valid JSON. No preamble, no markdown.`;
  }

  // Generic fallback for unknown document types.
  return `You are a document intelligence system. Parse the uploaded document of type "${documentType}" and extract the most relevant structured data.

Identify and return:
- title (or document name)
- entities (array of named entities)
- keywords (array of important keywords)
- intent (the apparent purpose of the document)
- summary (2 sentence summary)

Return ONLY valid JSON. No preamble, no markdown.`;
}

/**
 * Strip Markdown code fences if the LLM returns them despite our instructions.
 */
function stripJsonFences(raw: string): string {
  let text = raw.trim();
  if (text.startsWith("```")) {
    // Remove leading ```json or ```
    text = text.replace(/^```(?:json)?\s*/i, "");
    text = text.replace(/```\s*$/i, "");
  }
  return text.trim();
}

// Currently only PDF is supported because the LLM file_url channel reads PDFs
// natively. DOCX support would require server-side conversion; see TODO.
const SUPPORTED_MIME_TYPES = ["application/pdf"] as const;

export const documentIntakeRouter = router({
  /**
   * Parse an uploaded document. Accepts base64-encoded file content. Stores the
   * file in storage so the LLM can read it, then asks the LLM to return
   * structured JSON appropriate for the document type.
   */
  parse: protectedProcedure
    .input(
      z.object({
        fileBase64: z.string().min(1),
        fileName: z.string().min(1),
        mimeType: z.string().min(1),
        documentType: z.string().min(1).default("resume"),
        workspaceId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Validate MIME type — currently PDF only.
      const mimeType = input.mimeType;
      if (!SUPPORTED_MIME_TYPES.includes(mimeType as typeof SUPPORTED_MIME_TYPES[number])) {
        throw new Error(
          `Unsupported file type: ${mimeType}. Only PDF is supported at this time.`,
        );
      }

      // 1. Decode base64 (strip any data URL prefix).
      const base64 = input.fileBase64.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      if (buffer.length === 0) {
        throw new Error("Uploaded file is empty.");
      }

      // 2. Upload to storage so the LLM can fetch it via file_url.
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `documents/${ctx.user.id}/${input.documentType}/${Date.now()}_${safeName}`;
      const { key: storedKey } = await storagePut(key, buffer, mimeType);
      const signedUrl = await storageGetSignedUrl(storedKey);

      // 3. Call the LLM with the document URL (PDF only).
      const response = await invokeLLM({
        messages: [
          { role: "system", content: getSystemPrompt(input.documentType) },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Parse this ${input.documentType} document and return the structured JSON described in the system prompt. Return ONLY valid JSON.`,
              },
              {
                type: "file_url",
                file_url: { url: signedUrl, mime_type: "application/pdf" },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      });

      const rawContent = response.choices?.[0]?.message?.content;
      const rawText =
        typeof rawContent === "string"
          ? rawContent
          : Array.isArray(rawContent)
            ? rawContent
                .map((part: any) => (typeof part === "string" ? part : part?.text ?? ""))
                .join("\n")
            : "";

      if (!rawText) {
        throw new Error("LLM returned no content while parsing the document.");
      }

      let extracted: Record<string, unknown>;
      try {
        extracted = JSON.parse(stripJsonFences(rawText));
      } catch (err) {
        console.error("[documentIntake.parse] Failed to parse JSON:", rawText);
        throw new Error("Document parsing failed: model did not return valid JSON.");
      }

      // Normalization layer: rewrite generic role labels into real,
      // searchable titles, and merge AE-specific industries when the resume
      // looks like a sales-track resume. This runs even on non-resume types
      // (it's a no-op when the fields are absent), but the augmentation only
      // fires for sales-looking resumes.
      if (extracted && typeof extracted === "object") {
        const ex = extracted as Record<string, unknown>;
        if (Array.isArray(ex.targetRoles)) {
          ex.targetRoles = normalizeRoles(ex.targetRoles as string[]);
        }
        const summary = typeof ex.summary === "string" ? ex.summary : "";
        const isSales = looksLikeSalesResume(
          (ex.targetRoles as string[] | undefined) ?? [],
          summary,
        );
        if (isSales) {
          ex.targetIndustries = mergeWithSuggestedIndustries(
            Array.isArray(ex.targetIndustries) ? (ex.targetIndustries as string[]) : [],
          );
        }
      }

      const parsed: ParsedDocument = {
        documentType: input.documentType,
        parsedAt: new Date().toISOString(),
        extracted,
      };

      // 4. Persist to researchConfig (per-user, single row) so getLastParsed
      // and applyToConfig can read it later.
      const db = await getDb();
      if (db) {
        try {
          const existing = await db
            .select()
            .from(researchConfig)
            .where(eq(researchConfig.userId, ctx.user.id))
            .limit(1);

          if (existing.length === 0) {
            await db.insert(researchConfig).values({
              userId: ctx.user.id,
              targetRoles: "Enterprise Account Manager,Account Executive,Sales Manager",
              targetCategories: "SaaS,Revenue Intelligence,Sales Enablement",
              targetCompanies: "",
              rolesPerDay: 30,
              enabled: 1,
              documentType: input.documentType,
              documentFileName: input.fileName,
              lastDocumentParsed: parsed as unknown as object,
            });
          } else {
            await db
              .update(researchConfig)
              .set({
                documentType: input.documentType,
                documentFileName: input.fileName,
                lastDocumentParsed: parsed as unknown as object,
              })
              .where(eq(researchConfig.userId, ctx.user.id));
          }
        } catch (err) {
          console.error("[documentIntake.parse] Failed to persist parsed doc:", err);
          // Don't throw — the parse itself succeeded; persistence is secondary.
        }
      }

      return {
        success: true as const,
        documentType: input.documentType,
        fileName: input.fileName,
        parsedAt: parsed.parsedAt,
        extracted,
      };
    }),

  /**
   * Apply the most recently parsed document to the user's research config.
   * For a resume, this maps targetRoles → researchConfig.targetRoles and
   * targetIndustries → researchConfig.targetCategories.
   * For other document types, callers can pass `targetRoles` and
   * `targetCategories` overrides directly.
   */
  applyToConfig: protectedProcedure
    .input(
      z
        .object({
          targetRoles: z.array(z.string()).optional(),
          targetCategories: z.array(z.string()).optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new Error("Database not available");
      }

      const existing = await db
        .select()
        .from(researchConfig)
        .where(eq(researchConfig.userId, ctx.user.id))
        .limit(1);

      if (existing.length === 0) {
        throw new Error("No research config found. Parse a document first.");
      }

      // Pull values from the last parsed document if no override is supplied.
      let rolesArr = input?.targetRoles;
      let catsArr = input?.targetCategories;

      const last = existing[0].lastDocumentParsed as ParsedDocument | null;
      if ((!rolesArr || !catsArr) && last && last.extracted) {
        const ex = last.extracted as ParsedResume & {
          targetCategories?: string[];
        };
        if (!rolesArr && Array.isArray(ex.targetRoles)) {
          rolesArr = ex.targetRoles;
        }
        if (!catsArr) {
          if (Array.isArray(ex.targetIndustries)) catsArr = ex.targetIndustries;
          else if (Array.isArray(ex.targetCategories)) catsArr = ex.targetCategories;
        }
      }

      if (!rolesArr?.length && !catsArr?.length) {
        throw new Error(
          "Nothing to apply. Provide targetRoles/targetCategories or parse a document first.",
        );
      }

      // Defense-in-depth: even if the user (or LLM) bypassed parse-time
      // normalization, rewrite generic role labels here before persisting.
      const normalizedRoles = normalizeRoles(rolesArr);

      const updateData: Record<string, unknown> = {};
      if (normalizedRoles.length) updateData.targetRoles = normalizedRoles.join(",");
      if (catsArr?.length) updateData.targetCategories = catsArr.join(",");

      await db
        .update(researchConfig)
        .set(updateData)
        .where(eq(researchConfig.userId, ctx.user.id));

      return {
        success: true as const,
        appliedTargetRoles: normalizedRoles,
        appliedTargetCategories: catsArr ?? [],
      };
    }),

  /**
   * Return the last parsed document for the current user.
   */
  getLastParsed: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      return null;
    }

    const rows = await db
      .select({
        documentType: researchConfig.documentType,
        documentFileName: researchConfig.documentFileName,
        lastDocumentParsed: researchConfig.lastDocumentParsed,
        updatedAt: researchConfig.updatedAt,
      })
      .from(researchConfig)
      .where(eq(researchConfig.userId, ctx.user.id))
      .limit(1);

    if (rows.length === 0 || !rows[0].lastDocumentParsed) {
      return null;
    }

    return {
      documentType: rows[0].documentType,
      fileName: rows[0].documentFileName,
      parsed: rows[0].lastDocumentParsed as ParsedDocument,
      updatedAt: rows[0].updatedAt,
    };
  }),
});
