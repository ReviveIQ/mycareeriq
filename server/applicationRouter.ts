import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { generateApplicationDocuments } from "./applicationGenerator";
import { getDb } from "./db";
import { applications } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { sendApplicationEmail } from "./emailService";
import { generateCoverLetterPDF, generateResumePDF } from "./pdfGenerator";
import { storagePut } from "./storage";

export const applicationRouter = router({
  /**
   * Generate cover letter and tailored resume for a company
   */
  generate: protectedProcedure
    .input(
      z.object({
        companyName: z.string(),
        jobTitle: z.string(),
        jobDescription: z.string(),
        contactName: z.string(),
        contactEmail: z.string().optional(), // LinkedIn URL or email
        companyId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const { coverLetter, tailoredResume } = await generateApplicationDocuments(
          input.companyName,
          input.jobTitle,
          input.jobDescription,
          input.contactName,
          ctx.user.id
        );

        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // Auto-add to pipeline if not already there
        // This way generating a cover letter from anywhere adds the job to the pipeline
        const { companies } = await import("../drizzle/schema");
        const { eq: eqOp, and } = await import("drizzle-orm");

        const existing = await db.select({ id: companies.id })
          .from(companies)
          .where(and(
            eqOp(companies.userId, ctx.user.id),
            eqOp(companies.companyId, input.companyId)
          ))
          .limit(1);

        let addedToPipeline = false;
        if (existing.length === 0) {
          // Not in pipeline yet — add it at Research stage
          await db.insert(companies).values({
            userId: ctx.user.id,
            companyId: input.companyId,
            companyName: input.companyName,
            category: "Direct Apply",
            jobTitle: input.jobTitle,
            jobDescription: input.jobDescription,
            jobLink: "",
            contactName: input.contactName,
            contactEmail: input.contactEmail || "",
            linkedinUrl: "",
            remote: false,
            salary: "",
            companySize: "",
            priority: "Medium",
            stage: "Cover Letter",
            notes: "Added via cover letter generation",
          });
          addedToPipeline = true;
          console.log(`[ApplicationRouter] Auto-added ${input.companyName} to pipeline for userId ${ctx.user.id}`);
        }

        // Save cover letter to applications table
        await db.insert(applications).values({
          userId: ctx.user.id,
          companyId: input.companyId,
          companyName: input.companyName,
          contactEmail: input.contactEmail || "",
          contactName: input.contactName,
          jobTitle: input.jobTitle,
          coverLetter,
          tailoredResume,
          status: "draft",
          jobDescription: input.jobDescription,
          companyProfile: input.companyName,
        });

        const inserted = await db
          .select()
          .from(applications)
          .where(eqOp(applications.userId, ctx.user.id))
          .orderBy(desc(applications.createdAt))
          .limit(1);

        return {
          success: true,
          applicationId: inserted[0]?.id || 0,
          coverLetter,
          tailoredResume,
          addedToPipeline,
        };
      } catch (error) {
        console.error("[ApplicationRouter] Generate error:", error);
        throw error;
      }
    }),

  /**
   * Get a draft application by ID
   */
  getDraft: protectedProcedure
    .input(z.object({ applicationId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new Error("Database not available");
      }

      const app = await db
        .select()
        .from(applications)
        .where(eq(applications.id, input.applicationId))
        .limit(1);

      return app[0] || null;
    }),

  /**
   * Send application immediately or schedule for later
   */
  send: protectedProcedure
    .input(
      z.object({
        applicationId: z.number(),
        sendImmediately: z.boolean(),
        scheduledTime: z.date().optional(),
        hiringManagerEmail: z.string().email(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new Error("Database not available");
      }

      const app = await db
        .select()
        .from(applications)
        .where(eq(applications.id, input.applicationId))
        .limit(1);

      if (!app[0]) {
        throw new Error("Application not found");
      }

      const application = app[0];

      if (input.sendImmediately) {
        // Send immediately via email
        try {
          // Generate PDFs
          const coverLetterPdf = await generateCoverLetterPDF(
            application.coverLetter,
            application.contactName,
            application.companyName
          );
          const resumePdf = await generateResumePDF(application.tailoredResume);

          // Store PDFs in S3
          const coverLetterStorage = await storagePut(
            `applications/${input.applicationId}/cover-letter.pdf`,
            coverLetterPdf,
            "application/pdf"
          );
          const resumeStorage = await storagePut(
            `applications/${input.applicationId}/resume.pdf`,
            resumePdf,
            "application/pdf"
          );

          // Send email with PDF attachments
          const emailResult = await sendApplicationEmail({
            toEmail: input.hiringManagerEmail,
            toName: application.contactName,
            companyName: application.companyName,
            coverLetter: application.coverLetter,
            tailoredResume: application.tailoredResume,
            applicationId: input.applicationId,
          });

          // Update application with sent status and PDF keys
          await db
            .update(applications)
            .set({
              status: "sent",
              sentAt: new Date(),
              sentToHiringManager: true,
              sentToUser: true,
              coverLetterPdfKey: coverLetterStorage.key,
              resumePdfKey: resumeStorage.key,
            })
            .where(eq(applications.id, input.applicationId));

          return {
            success: true,
            message: "Application sent successfully",
            hiringManagerMessageId: emailResult.hiringManagerMessageId,
            userCopyMessageId: emailResult.userCopyMessageId,
            coverLetterPdfUrl: coverLetterStorage.url,
            resumePdfUrl: resumeStorage.url,
          };
        } catch (emailError) {
          console.error("[ApplicationRouter] Email send failed:", emailError);
          throw emailError;
        }
      } else if (input.scheduledTime) {
        // Schedule for later
        await db
          .update(applications)
          .set({
            status: "scheduled",
            scheduledSendTime: input.scheduledTime,
          })
          .where(eq(applications.id, input.applicationId));

        return { success: true, message: "Application scheduled for later" };
      }

      throw new Error("Must either send immediately or provide a scheduled time");
    }),

  /**
   * List all applications for the user
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    const apps = await db
      .select()
      .from(applications)
      .where(eq(applications.userId, ctx.user.id));
    return apps;
  }),
});
