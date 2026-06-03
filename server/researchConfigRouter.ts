import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { researchConfig } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export const researchConfigRouter = router({
  // Get current research configuration
  get: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    try {
      const config = await db
        .select()
        .from(researchConfig)
        .where(eq(researchConfig.userId, ctx.user.id))
        .limit(1);

      if (config.length === 0) {
        // No config yet — user hasn't uploaded a resume. Return empty fields.
        return {
          id: 0,
          userId: ctx.user.id,
          targetRoles: "",
          targetCategories: "",
          targetCompanies: "",
          rolesPerDay: 10,
          enabled: 1,
          documentType: "resume",
          documentFileName: null,
          lastDocumentParsed: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }

      return config[0];
    } catch (error) {
      console.error("Failed to get research config:", error);
      throw error;
    }
  }),

  // Update research configuration
  update: protectedProcedure
    .input(
      z.object({
        targetRoles: z.string().optional(),
        targetCategories: z.string().optional(),
        rolesPerDay: z.number().min(1).max(100).optional(),
        enabled: z.number().optional(),
        remoteOnly: z.boolean().optional(),
        usHiringOnly: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new Error("Database not available");
      }

      try {
        // Check if config exists for this user
        const existing = await db
          .select()
          .from(researchConfig)
          .where(eq(researchConfig.userId, ctx.user.id))
          .limit(1);

        if (existing.length === 0) {
          // Create new config with whatever the user/resume provided — no hardcoded defaults
          await db.insert(researchConfig).values({
            userId: ctx.user.id,
            targetRoles: input.targetRoles || "",
            targetCategories: input.targetCategories || "",
            targetCompanies: "",
            rolesPerDay: input.rolesPerDay || 10,
            enabled: input.enabled !== undefined ? input.enabled : 1,
          });
        } else {
          // Update existing config
          const updateData: Record<string, any> = {};
          if (input.targetRoles !== undefined) updateData.targetRoles = input.targetRoles;
          if (input.targetCategories !== undefined) updateData.targetCategories = input.targetCategories;
          if (input.rolesPerDay !== undefined) updateData.rolesPerDay = input.rolesPerDay;
          if (input.enabled !== undefined) updateData.enabled = input.enabled;
          if (input.remoteOnly !== undefined) updateData.remoteOnly = input.remoteOnly;
          if (input.usHiringOnly !== undefined) updateData.usHiringOnly = input.usHiringOnly;

          await db
            .update(researchConfig)
            .set(updateData)
            .where(eq(researchConfig.userId, ctx.user.id));
        }

        return { success: true };
      } catch (error) {
        console.error("Failed to update research config:", error);
        throw error;
      }
    }),
});
