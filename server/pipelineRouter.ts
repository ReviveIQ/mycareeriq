import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { companies as companiesTable } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";


// Map Adzuna/external categories to pipeline categories
function mapCategory(raw: string): string {
  const cat = (raw || "").toLowerCase();
  if (cat.includes("edtech") || cat.includes("education")) return "EdTech SaaS";
  if (cat.includes("customer success") || cat.includes("customer service")) return "Customer Success";
  if (cat.includes("revenue intelligence") || cat.includes("revenue operations")) return "Revenue Intelligence";
  if (cat.includes("marketing")) return "Marketing Automation";
  if (cat.includes("hr") || cat.includes("recruit") || cat.includes("talent") || cat.includes("workforce")) return "HR / Workforce Tech";
  if (cat.includes("sales enablement") || cat.includes("enablement")) return "Sales Enablement";
  if (cat.includes("account") || cat.includes("sales")) return "Sales Enablement";
  if (cat.includes("it ") || cat.includes("software") || cat.includes("tech")) return "Sales Enablement";
  // Keep the original Adzuna category label if it doesn't map cleanly
  return raw || "Sales Enablement";
}

export const pipelineRouter = router({
  // Get all researched companies for the user's pipeline
  getCompanies: protectedProcedure.query(async ({ ctx }) => {
    try {
      const db = await getDb();
      if (!db) {
        throw new Error("Database not available");
      }

      // Fetch all researched companies for the user
      const jobs = await db
        .select()
        .from(companiesTable)
        .where(eq(companiesTable.userId, ctx.user.id))
        .orderBy(desc(companiesTable.createdAt));

      // Transform to pipeline format
      const companies = jobs.map((job) => ({
        id: job.id,
        name: job.companyName,
        category: mapCategory(job.category || "") as any,
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
  updateStage: protectedProcedure
    .input(z.object({
      id: z.number(),
      stage: z.enum(["Research", "Outreach", "Applied", "Interviewing", "Offer", "Rejected"]),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db.update(companiesTable)
          .set({ stage: input.stage, updatedAt: new Date() })
          .where(and(eq(companiesTable.id, input.id), eq(companiesTable.userId, ctx.user.id)));
        return { success: true };
      } catch (error) {
        console.error("[PipelineRouter] Error updating stage:", error);
        throw error;
      }
    }),

  updateNotes: protectedProcedure
    .input(z.object({
      id: z.number(),
      notes: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db.update(companiesTable)
          .set({ notes: input.notes, updatedAt: new Date() })
          .where(and(eq(companiesTable.id, input.id), eq(companiesTable.userId, ctx.user.id)));
        return { success: true };
      } catch (error) {
        console.error("[PipelineRouter] Error updating notes:", error);
        throw error;
      }
    }),

  deleteCompany: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db.delete(companiesTable)
          .where(and(eq(companiesTable.id, input.id), eq(companiesTable.userId, ctx.user.id)));
        return { success: true };
      } catch (error) {
        console.error("[PipelineRouter] Error deleting company:", error);
        throw error;
      }
    }),
});
