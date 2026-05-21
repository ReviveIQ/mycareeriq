import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";

export const documentIntakeRouter = router({
  parse: protectedProcedure
    .input(z.object({
      fileBase64: z.string(),
      fileName: z.string(),
      documentType: z.string().default("resume"),
    }))
    .mutation(async ({ input }) => {
      try {
        const prompt = `Parse this ${input.documentType} document (base64 encoded: ${input.fileBase64.substring(0, 100)}...) and extract structured data.

For a resume, extract:
- candidateName: full name
- targetRoles: array of 4-6 specific job titles this person is qualified for
- targetIndustries: array of 3-5 industries they have experience in
- skills: array of top 8 skills
- seniorityLevel: one of "entry", "mid", "senior", "executive"
- yearsOfExperience: number
- summary: 2 sentence professional summary

Return ONLY valid JSON. No markdown, no preamble.`;

        const response = await invokeLLM({ 
          system: "You are a precise resume parser. Return only valid JSON.",
          prompt,
          max_tokens: 1000 
        });

        let jsonStr = response.trim();
        if (jsonStr.startsWith("```")) {
          jsonStr = jsonStr.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        }

        const parsed = JSON.parse(jsonStr);
        return parsed;
      } catch (error) {
        console.error("[DocumentIntake] Parse error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to parse document",
        });
      }
    }),
});
