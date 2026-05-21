/**
 * Document Intake Router
 * Parses uploaded documents (PDF/DOCX) using OpenAI directly.
 * No external storage required - content sent directly to LLM.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { researchConfig } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { TRPCError } from "@trpc/server";

function getSystemPrompt(documentType: string): string {
  const type = documentType.toLowerCase();

  if (type === "resume" || type === "cv") {
    return `You are a resume parser. Extract structured data from this resume.

Extract these fields:
- candidateName: full name
- targetRoles: array of 4-6 REAL, job-board-searchable titles (e.g. "Enterprise Account Executive", "Strategic Account Manager", "VP of Sales") - NO made-up titles
- targetIndustries: array of 3-5 real industries (e.g. "B2B SaaS", "Revenue Intelligence", "Sales Enablement", "EdTech")
- skills: array of top 8 skills
- seniorityLevel: one of "entry", "mid", "senior", "executive"
- yearsOfExperience: number
- summary: 2 sentence professional summary

Return ONLY valid JSON. No markdown, no preamble.`;
  }

  return `You are a document intelligence system. Parse this ${documentType} and extract the most relevant structured data as JSON. Return ONLY valid JSON.`;
}

function stripJsonFences(raw: string): string {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  return text.trim();
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

      let extractedText = "";

      // For PDFs, use OpenAI's file upload API
      if (input.mimeType === "application/pdf") {
        try {
          // Upload file to OpenAI Files API
          const FormData = (await import("form-data")).default;
          const form = new FormData();
          form.append("file", buffer, {
            filename: input.fileName,
            contentType: "application/pdf",
          });
          form.append("purpose", "assistants");

          const uploadRes = await fetch("https://api.openai.com/v1/files", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              ...form.getHeaders(),
            },
            body: form as any,
          });

          if (uploadRes.ok) {
            const fileData = await uploadRes.json() as any;
            const fileId = fileData.id;

            // Use the file with GPT-4
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
                    content: [
                      { type: "text", text: `Parse this ${input.documentType} and return structured JSON.` },
                      { type: "file", file: { file_id: fileId } },
                    ],
                  },
                ],
                max_tokens: 1000,
              }),
            });

            if (chatRes.ok) {
              const chatData = await chatRes.json() as any;
              extractedText = chatData.choices?.[0]?.message?.content || "";
            }

            // Clean up the file
            fetch(`https://api.openai.com/v1/files/${fileId}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${apiKey}` },
            }).catch(() => {});
          }
        } catch (e) {
          console.warn("[DocumentIntake] File upload failed, falling back to text extraction:", e);
        }
      }

      // Fallback: extract text from buffer and send as text
      if (!extractedText) {
        const textContent = buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000);

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
              { role: "user", content: `Parse this ${input.documentType} document:\n\n${textContent}` },
            ],
            max_tokens: 1000,
          }),
        });

        if (!chatRes.ok) {
          const err = await chatRes.text();
          console.error("[DocumentIntake] OpenAI error:", err);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to analyze document" });
        }

        const chatData = await chatRes.json() as any;
        extractedText = chatData.choices?.[0]?.message?.content || "";
      }

      if (!extractedText) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Document analysis returned empty response" });
      }

      let extracted: Record<string, unknown>;
      try {
        extracted = JSON.parse(stripJsonFences(extractedText));
      } catch {
        console.error("[DocumentIntake] JSON parse failed:", extractedText);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to parse document analysis results" });
      }

      // Persist to researchConfig
      const db = await getDb();
      if (db) {
        try {
          const existing = await db.select().from(researchConfig).where(eq(researchConfig.userId, ctx.user.id)).limit(1);
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
              lastDocumentParsed: { documentType: input.documentType, parsedAt: new Date().toISOString(), extracted } as any,
            });
          } else {
            await db.update(researchConfig).set({
              documentType: input.documentType,
              documentFileName: input.fileName,
              lastDocumentParsed: { documentType: input.documentType, parsedAt: new Date().toISOString(), extracted } as any,
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

      const existing = await db.select().from(researchConfig).where(eq(researchConfig.userId, ctx.user.id)).limit(1);
      if (existing.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "No research config found. Parse a document first." });

      const last = existing[0].lastDocumentParsed as any;
      const rolesArr = input?.targetRoles || (last?.extracted?.targetRoles as string[]) || [];
      const catsArr = input?.targetCategories || (last?.extracted?.targetIndustries as string[]) || [];

      const updateData: Record<string, unknown> = {};
      if (rolesArr.length) updateData.targetRoles = rolesArr.join(",");
      if (catsArr.length) updateData.targetCategories = catsArr.join(",");

      await db.update(researchConfig).set(updateData).where(eq(researchConfig.userId, ctx.user.id));

      return { success: true as const, appliedTargetRoles: rolesArr, appliedTargetCategories: catsArr };
    }),

  getLastParsed: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;

    const rows = await db.select({
      documentType: researchConfig.documentType,
      documentFileName: researchConfig.documentFileName,
      lastDocumentParsed: researchConfig.lastDocumentParsed,
      updatedAt: researchConfig.updatedAt,
    }).from(researchConfig).where(eq(researchConfig.userId, ctx.user.id)).limit(1);

    if (rows.length === 0 || !rows[0].lastDocumentParsed) return null;

    return {
      documentType: rows[0].documentType,
      fileName: rows[0].documentFileName,
      parsed: rows[0].lastDocumentParsed,
      updatedAt: rows[0].updatedAt,
    };
  }),
});
