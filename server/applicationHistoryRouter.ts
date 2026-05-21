import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { applications } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export const applicationHistoryRouter = router({
  // List all applications
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    try {
      const allApplications = await db.select().from(applications);
      return allApplications;
    } catch (error) {
      console.error("Failed to list applications:", error);
      throw error;
    }
  }),

  // Delete an application
  delete: protectedProcedure
    .input(
      z.object({
        applicationId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new Error("Database not available");
      }

      try {
        await db.delete(applications).where(eq(applications.id, input.applicationId));
        return { success: true };
      } catch (error) {
        console.error("Failed to delete application:", error);
        throw error;
      }
    }),
});
