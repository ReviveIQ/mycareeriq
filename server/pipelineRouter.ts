import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { companies as companiesTable } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";

export const pipelineRouter = router({
  // Get all researched companies for the user's pipeline
  getCompanies: protectedProcedure.query(async ({ ctx }) => {
    try {
      const db = await getDb();
      if (!db) {
        throw new Error("Database not available");
      }

      // Fetch all researched companies for the user
      console.log("[PipelineRouter] getCompanies for userId:", ctx.user.id);
      const jobs = await db
        .select()
        .from(companiesTable)
        .where(eq(companiesTable.userId, ctx.user.id))
        .orderBy(desc(companiesTable.createdAt));
      console.log("[PipelineRouter] getCompanies found:", jobs.length, "companies");

      // Transform to pipeline format
      const companies = jobs.map((job) => ({
        id: job.id,
        name: job.companyName,
        category: job.category as any,
        stage: job.stage as "Research" | "Outreach" | "Applied" | "Interviewing" | "Offer" | "Rejected",
        role: job.jobTitle || "",
        jobLink: job.jobLink || "",
        contactName: job.contactName || "",
        contactTitle: "",
        contactLinkedIn: job.linkedinUrl || "",
        priority: job.priority as "High" | "Medium" | "Low",
        notes: job.notes || job.jobDescription || "",
        remoteOk: job.remote || false,
        estSalary: job.salary || "",
        companySize: job.companySize || "",
      }));

      return companies;
    } catch (error) {
      console.error("[PipelineRouter] Error fetching companies:", error);
      throw error;
    }
  }),

  // Get company count
  getCompanyCount: protectedProcedure.query(async ({ ctx }) => {
    try {
      const db = await getDb();
      if (!db) {
        throw new Error("Database not available");
      }

      const result = await db
        .select()
        .from(companiesTable)
        .where(eq(companiesTable.userId, ctx.user.id));

      return result.length;
    } catch (error) {
      console.error("[PipelineRouter] Error counting companies:", error);
      throw error;
    }
  }),

  // Get high priority companies
  getHighPriority: protectedProcedure.query(async ({ ctx }) => {
    try {
      const db = await getDb();
      if (!db) {
        throw new Error("Database not available");
      }

      const result = await db
        .select()
        .from(companiesTable)
        .where(eq(companiesTable.userId, ctx.user.id))
        .orderBy(desc(companiesTable.createdAt));

      return result.filter((j) => j.priority === "High").length;
    } catch (error) {
      console.error("[PipelineRouter] Error fetching high priority count:", error);
      throw error;
    }
  }),

  // Get remote roles count
  getRemoteCount: protectedProcedure.query(async ({ ctx }) => {
    try {
      const db = await getDb();
      if (!db) {
        throw new Error("Database not available");
      }

      const result = await db
        .select()
        .from(companiesTable)
        .where(eq(companiesTable.userId, ctx.user.id));

      return result.filter((j) => j.remote).length;
    } catch (error) {
      console.error("[PipelineRouter] Error fetching remote count:", error);
      throw error;
    }
  }),

  // Update company stage
  updateStage: protectedProcedure
    .input(z.object({ id: z.number(), stage: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.update(companiesTable)
        .set({ stage: input.stage as any })
        .where(eq(companiesTable.id, input.id));
      return { success: true };
    }),

  // Delete (dismiss) a company from the pipeline
  deleteCompany: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.delete(companiesTable)
        .where(eq(companiesTable.id, input.id));
      return { success: true };
    }),
});
