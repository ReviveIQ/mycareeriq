import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { searchEmailsWithHunter, extractDomain, verifyEmail } from "./hunterService";

export const emailLookupRouter = router({
  /**
   * Search for email addresses for a person at a company
   */
  searchEmails: protectedProcedure
    .input(
      z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        company: z.string().min(1), // Company name or domain
      })
    )
    .query(async ({ input }) => {
      try {
        // Extract domain from company name
        const domain = extractDomain(input.company);

        // Search for emails
        const emails = await searchEmailsWithHunter(input.firstName, input.lastName, domain);

        return {
          success: true,
          emails: emails.map((email) => ({
            email: email.email,
            score: email.score,
            type: email.type,
            position: email.position,
            linkedin_url: email.linkedin_url,
            phone_number: email.phone_number,
            sources: email.sources,
          })),
          domain,
          count: emails.length,
        };
      } catch (error) {
        console.error("[EmailLookupRouter] Search error:", error);

        // Return empty results on error instead of throwing
        // This allows graceful fallback to manual entry
        return {
          success: false,
          emails: [],
          domain: extractDomain(input.company),
          count: 0,
          error: error instanceof Error ? error.message : "Failed to search emails",
        };
      }
    }),

  /**
   * Verify if an email address is valid
   */
  verifyEmail: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
      })
    )
    .query(async ({ input }) => {
      try {
        const result = await verifyEmail(input.email);

        return {
          success: true,
          email: input.email,
          valid: result.status === "valid",
          status: result.status, // valid, invalid, unknown
          score: result.score, // 0-100 confidence
          reason: result.reason,
        };
      } catch (error) {
        console.error("[EmailLookupRouter] Verification error:", error);

        // Return unknown status on error
        return {
          success: false,
          email: input.email,
          valid: null,
          status: "unknown",
          score: 0,
          error: error instanceof Error ? error.message : "Failed to verify email",
        };
      }
    }),

  /**
   * Get suggested emails for a person at a company
   * This is a convenience method that combines search and verification
   */
  getSuggestedEmails: protectedProcedure
    .input(
      z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        company: z.string().min(1),
        limit: z.number().min(1).max(5).default(3),
      })
    )
    .mutation(async ({ input }) => {
      try {
        // Extract domain from company name
        const domain = extractDomain(input.company);

        // Search for emails
        const emails = await searchEmailsWithHunter(input.firstName, input.lastName, domain);

        // Return top results up to limit
        const suggested = emails.slice(0, input.limit).map((email) => ({
          email: email.email,
          score: email.score,
          type: email.type,
          position: email.position,
          confidence: email.score >= 80 ? "high" : email.score >= 50 ? "medium" : "low",
        }));

        return {
          success: true,
          firstName: input.firstName,
          lastName: input.lastName,
          company: input.company,
          domain,
          suggested,
          total: emails.length,
        };
      } catch (error) {
        console.error("[EmailLookupRouter] Get suggested error:", error);

        return {
          success: false,
          firstName: input.firstName,
          lastName: input.lastName,
          company: input.company,
          domain: extractDomain(input.company),
          suggested: [],
          total: 0,
          error: error instanceof Error ? error.message : "Failed to get suggestions",
        };
      }
    }),
});
