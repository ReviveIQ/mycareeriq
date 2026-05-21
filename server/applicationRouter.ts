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
        // Generate both documents
        const { coverLetter, tailoredResume } = await generateApplicationDocuments(
          input.companyName,
          input.jobTitle,
          input.jobDescription,
          input.contactName
        );

        // Save to database as draft
        const db = await getDb();
        if (!db) {
          throw new Error("Database not available");
        }

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

        // Get the inserted ID (most recent) - order by descending to get newest first
        const inserted = await db
          .select()
          .from(applications)
          .where(eq(applications.userId, ctx.user.id))
          .orderBy(desc(applications.createdAt))
          .limit(1);

        return {
          success: true,
          applicationId: inserted[0]?.id || 0,
          coverLetter,
          tailoredResume,
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
