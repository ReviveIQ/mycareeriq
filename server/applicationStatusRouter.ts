import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { applications } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export const applicationStatusRouter = router({
  /**
   * Update application outcome status
   */
  updateOutcome: protectedProcedure
    .input(
      z.object({
        applicationId: z.number(),
        outcome: z.enum(["pending", "interviewing", "offer", "rejected"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new Error("Database not available");
      }

      try {
        const result = await db
          .update(applications)
          .set({
            outcome: input.outcome,
            updatedAt: new Date(),
          })
          .where(eq(applications.id, input.applicationId));

        return {
          success: true,
          message: `Application outcome updated to ${input.outcome}`,
        };
      } catch (error) {
        console.error("[ApplicationStatusRouter] Update error:", error);
        throw error;
      }
    }),

  /**
   * Get all applications with their outcomes
   */
  listWithOutcomes: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    const apps = await db.select().from(applications);
    return apps;
  }),
});
