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
      const userId = Number(ctx.user.id);
      console.log("[PipelineRouter] getCompanies for userId:", userId, "type:", typeof userId);

      // Use raw SQL to bypass any Drizzle type coercion issues
      const { sql } = await import("drizzle-orm");
      const rawResult = await db.execute(
        sql`SELECT * FROM companies WHERE userId = ${userId} ORDER BY createdAt DESC`
      ) as any;
      const jobs = Array.isArray(rawResult) ? rawResult : (rawResult?.rows ?? []);
      console.log("[PipelineRouter] getCompanies found:", jobs.length, "companies (raw SQL)");

      // Transform to pipeline format — handle both Drizzle and raw SQL field names
      const companies = jobs.map((job: any) => ({
        id: job.id,
        name: job.companyName || job.company_name || "",
        category: job.category || "",
        stage: (job.stage || "Research") as "Research" | "Outreach" | "Applied" | "Interviewing" | "Offer" | "Rejected",
        role: job.jobTitle || job.job_title || "",
        jobLink: job.jobLink || job.job_link || "",
        contactName: job.contactName || job.contact_name || "",
        contactTitle: "",
        contactLinkedIn: job.linkedinUrl || job.linkedin_url || job.contactLinkedIn || "",
        priority: (job.priority || "Medium") as "High" | "Medium" | "Low",
        notes: job.notes || job.jobDescription || job.job_description || "",
        remoteOk: Boolean(job.remote),
        estSalary: job.salary || "",
        companySize: job.companySize || job.company_size || "",
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
