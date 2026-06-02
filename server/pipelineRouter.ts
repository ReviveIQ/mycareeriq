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
      // db.execute returns [RowDataPacket[], FieldPacket[]] in mysql2
      // RowDataPacket objects have named fields — but result[0] is the rows array
      const rawResult = await db.execute(
        sql`SELECT * FROM companies WHERE userId = ${userId} ORDER BY createdAt DESC`
      ) as any;

      // Parse mysql2 result format: either [rows[], fields[]] or rows[] directly
      let jobs: any[] = [];
      if (Array.isArray(rawResult) && rawResult.length >= 1) {
        const first = rawResult[0];
        if (Array.isArray(first)) {
          // [rows[], fields[]] format — rows are in first element
          jobs = first;
        } else if (first && typeof first === "object" && ("companyName" in first || "id" in first)) {
          // Already an array of row objects
          jobs = rawResult;
        }
      } else if (rawResult?.rows) {
        jobs = rawResult.rows;
      }

      console.log("[PipelineRouter] getCompanies found:", jobs.length, "companies");
      if (jobs.length > 0) {
        const sample = jobs[0];
        console.log("[PipelineRouter] First row:", JSON.stringify(sample).slice(0, 200));
      }

      // Transform to pipeline format
      // TiDB raw SQL returns lowercase field names — handle both cases
      const companies = jobs.map((job: any) => {
        const get = (camel: string, lower: string) => job[camel] ?? job[lower] ?? job[camel.toLowerCase()] ?? "";
        return {
          id: job.id,
          name: get("companyName", "companyname") || get("company_name", "company_name"),
          category: get("category", "category") || "Uncategorized",
          stage: (get("stage", "stage") || "Research") as "Research" | "Outreach" | "Applied" | "Interviewing" | "Offer" | "Rejected",
          role: get("jobTitle", "jobtitle") || get("job_title", "job_title"),
          jobLink: get("jobLink", "joblink") || get("job_link", "job_link"),
          contactName: get("contactName", "contactname") || get("contact_name", "contact_name"),
          contactTitle: "",
          contactLinkedIn: get("linkedinUrl", "linkedinurl") || get("contactLinkedIn", "contactlinkedin"),
          priority: (get("priority", "priority") || "Medium") as "High" | "Medium" | "Low",
          notes: get("notes", "notes") || get("jobDescription", "jobdescription"),
          remoteOk: Boolean(job.remote),
          estSalary: get("salary", "salary"),
          companySize: get("companySize", "companysize") || get("company_size", "company_size"),
        };
      });

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

  // Mark outreach sent — advance Research → Outreach
  markOutreachSent: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { sql } = await import("drizzle-orm");
      await db.execute(
        sql`UPDATE companies SET stage = 'Outreach', updatedAt = NOW() WHERE id = ${input.companyId} AND userId = ${ctx.user.id}`
      );
      return { success: true };
    }),

  // Mark applied — advance Outreach → Applied
  markApplied: protectedProcedure
    .input(z.object({ companyId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { sql } = await import("drizzle-orm");
      await db.execute(
        sql`UPDATE companies SET stage = 'Applied', updatedAt = NOW() WHERE id = ${input.companyId} AND userId = ${ctx.user.id}`
      );
      return { success: true };
    }),

  // Get LinkedIn profile for current user
  getLinkedInProfile: protectedProcedure.query(async ({ ctx }) => {
    const { sql } = await import("drizzle-orm");
    const result = await db.execute(
      sql`SELECT linkedinAccessToken FROM users WHERE id = ${ctx.user.id} LIMIT 1`
    ) as any;
    const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
    const token = rows?.[0]?.linkedinAccessToken || rows?.[0]?.linkedinaccesstoken;
    return { connected: !!token };
  }),
});
