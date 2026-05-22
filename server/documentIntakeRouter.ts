/**
 * Document Intake Router
 * Parses uploaded documents using OpenAI directly.
 * Extracts text from the buffer and sends to GPT-4o.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { researchConfig } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { TRPCError } from "@trpc/server";

function getSystemPrompt(documentType: string): string {
  if (documentType === "resume" || documentType === "cv") {
    return `You are a resume parser. Extract structured data from this resume text.

Return a JSON object with:
- candidateName: full name
- targetRoles: array of 4-6 REAL searchable job titles (e.g. "Enterprise Account Executive", "Strategic Account Manager", "VP of Sales", "Director of Business Development")
- targetIndustries: array of 3-5 industries (e.g. "B2B SaaS", "Revenue Intelligence", "Sales Enablement", "EdTech", "CRM")  
- skills: array of top 8 skills
- seniorityLevel: "entry", "mid", "senior", or "executive"
- yearsOfExperience: number
- summary: 2 sentence professional summary

IMPORTANT: targetRoles must be real job titles recruiters actually post. No made-up titles.
Return ONLY valid JSON. No markdown, no explanation.`;
  }
  return `Parse this ${documentType} document and extract structured data as JSON. Return ONLY valid JSON.`;
}

function stripJsonFences(raw: string): string {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  return text.trim();
}

function extractTextFromBuffer(buffer: Buffer, mimeType: string): string {
  // Extract readable text from the buffer
  // For PDFs, try to get UTF-8 text content
  // For DOCX, extract what we can
  const raw = buffer.toString("utf-8");
  
  // Remove non-printable characters but keep spaces, newlines, tabs
  const cleaned = raw
    .replace(/[^\x20-\x7E\n\r\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  
  // Return up to 8000 chars to stay within token limits
  return cleaned.slice(0, 8000);
}

export const documentIntakeRouter = router({
  parse: protectedProcedure
    .input(z.object({
      fileBase64: z.string().min(1),
      fileName: z.string().min(1),
      mimeType: z.string().min(1),
      documentType: z.string().min(1).default("resume"),
    }))
    .mutation(async ({ ctx, input }) => {
      const apiKey = ENV.openAiApiKey || ENV.forgeApiKey;
      if (!apiKey) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "OpenAI API key not configured",
        });
      }

      // Decode base64
      const base64 = input.fileBase64.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      if (buffer.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Uploaded file is empty" });
      }

      // Extract text content from the document
      const textContent = extractTextFromBuffer(buffer, input.mimeType);
      
      if (!textContent || textContent.length < 50) {
        throw new TRPCError({ 
          code: "BAD_REQUEST", 
          message: "Could not extract text from document. Please ensure it is a text-based PDF or Word document." 
        });
      }

      console.log(`[DocumentIntake] Analyzing ${input.fileName} (${textContent.length} chars)`);

      // Send to OpenAI
      const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: getSystemPrompt(input.documentType) },
            { 
              role: "user", 
              content: `Parse this ${input.documentType}:\n\n${textContent}` 
            },
          ],
          max_tokens: 1000,
          temperature: 0.1,
        }),
      });

      if (!chatRes.ok) {
        const err = await chatRes.text();
        console.error("[DocumentIntake] OpenAI error:", err);
        throw new TRPCError({ 
          code: "INTERNAL_SERVER_ERROR", 
          message: "Failed to analyze document - OpenAI error" 
        });
      }

      const chatData = await chatRes.json() as any;
      const rawText = chatData.choices?.[0]?.message?.content || "";

      if (!rawText) {
        throw new TRPCError({ 
          code: "INTERNAL_SERVER_ERROR", 
          message: "Document analysis returned empty response" 
        });
      }

      let extracted: Record<string, unknown>;
      try {
        extracted = JSON.parse(stripJsonFences(rawText));
      } catch {
        console.error("[DocumentIntake] JSON parse failed:", rawText);
        throw new TRPCError({ 
          code: "INTERNAL_SERVER_ERROR", 
          message: "Failed to parse document analysis results" 
        });
      }

      // Use logged-in user's name if parser couldn't identify it
      if (!extracted.candidateName || 
          extracted.candidateName === "John Doe" || 
          extracted.candidateName === "Unknown") {
        extracted.candidateName = ctx.user.name || ctx.user.email || "You";
      }
      
      console.log(`[DocumentIntake] Successfully parsed for: ${extracted.candidateName}`);

      // Persist to researchConfig
      const db = await getDb();
      if (db) {
        try {
          const existing = await db.select().from(researchConfig)
            .where(eq(researchConfig.userId, ctx.user.id)).limit(1);
          
          const parsedDoc = { 
            documentType: input.documentType, 
            parsedAt: new Date().toISOString(), 
            extracted 
          };

          if (existing.length === 0) {
            await db.insert(researchConfig).values({
              userId: ctx.user.id,
              targetRoles: (extracted.targetRoles as string[] || []).join(","),
              targetCategories: (extracted.targetIndustries as string[] || []).join(","),
              targetCompanies: "",
              rolesPerDay: 30,
              enabled: 1,
              documentType: input.documentType,
              documentFileName: input.fileName,
              lastDocumentParsed: parsedDoc as any,
            });
          } else {
            await db.update(researchConfig).set({
              documentType: input.documentType,
              documentFileName: input.fileName,
              lastDocumentParsed: parsedDoc as any,
            }).where(eq(researchConfig.userId, ctx.user.id));
          }
        } catch (err) {
          console.warn("[DocumentIntake] Failed to persist:", err);
        }
      }

      return {
        success: true as const,
        documentType: input.documentType,
        fileName: input.fileName,
        parsedAt: new Date().toISOString(),
        extracted,
      };
    }),

  applyToConfig: protectedProcedure
    .input(z.object({
      targetRoles: z.array(z.string()).optional(),
      targetCategories: z.array(z.string()).optional(),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const existing = await db.select().from(researchConfig)
        .where(eq(researchConfig.userId, ctx.user.id)).limit(1);
      
      if (existing.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No research config found. Parse a document first." });
      }

      const last = existing[0].lastDocumentParsed as any;
      const rolesArr = input?.targetRoles || (last?.extracted?.targetRoles as string[]) || [];
      const catsArr = input?.targetCategories || (last?.extracted?.targetIndustries as string[]) || [];

      const updateData: Record<string, unknown> = {};
      if (rolesArr.length) updateData.targetRoles = rolesArr.join(",");
      if (catsArr.length) updateData.targetCategories = catsArr.join(",");

      await db.update(researchConfig).set(updateData)
        .where(eq(researchConfig.userId, ctx.user.id));

      return { 
        success: true as const, 
        appliedTargetRoles: rolesArr, 
        appliedTargetCategories: catsArr 
      };
    }),

  getLastParsed: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;

    const rows = await db.select({
      documentType: researchConfig.documentType,
      documentFileName: researchConfig.documentFileName,
      lastDocumentParsed: researchConfig.lastDocumentParsed,
      updatedAt: researchConfig.updatedAt,
    }).from(researchConfig)
      .where(eq(researchConfig.userId, ctx.user.id)).limit(1);

    if (rows.length === 0 || !rows[0].lastDocumentParsed) return null;

    return {
      documentType: rows[0].documentType,
      fileName: rows[0].documentFileName,
      parsed: rows[0].lastDocumentParsed,
      updatedAt: rows[0].updatedAt,
    };
  }),
});
