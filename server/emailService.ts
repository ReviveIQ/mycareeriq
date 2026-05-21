import nodemailer from "nodemailer";
import { generateCoverLetterPDF, generateResumePDF } from "./pdfGenerator";
import { storagePut } from "./storage";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    const gmailPassword = process.env.GMAIL_APP_PASSWORD;
    if (!gmailPassword) {
      throw new Error("GMAIL_APP_PASSWORD environment variable is not set");
    }

    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "bryan.greer1@gmail.com",
        pass: gmailPassword,
      },
    });
  }
  return transporter;
}

export interface SendApplicationEmailParams {
  toEmail: string;
  toName: string;
  companyName: string;
  coverLetter: string;
  tailoredResume: string;
  applicationId: number;
}

export interface SendApplicationEmailResult {
  success: boolean;
  hiringManagerMessageId?: string;
  userCopyMessageId?: string;
  coverLetterPdfKey?: string;
  resumePdfKey?: string;
  error?: string;
}

export async function sendApplicationEmail(params: SendApplicationEmailParams): Promise<SendApplicationEmailResult> {
  try {
    const transporter = getTransporter();

    // Generate PDFs
    const coverLetterPDF = await generateCoverLetterPDF(
      params.coverLetter,
      params.toName,
      params.companyName
    );
    const resumePDF = await generateResumePDF(params.tailoredResume);

    // Upload PDFs to S3 storage
    let coverLetterPdfKey: string | undefined;
    let resumePdfKey: string | undefined;
    
    try {
      const coverLetterResult = await storagePut(
        `applications/${params.applicationId}/cover_letter.pdf`,
        coverLetterPDF,
        "application/pdf"
      );
      coverLetterPdfKey = coverLetterResult.key;

      const resumeResult = await storagePut(
        `applications/${params.applicationId}/resume.pdf`,
        resumePDF,
        "application/pdf"
      );
      resumePdfKey = resumeResult.key;
    } catch (storageError) {
      console.error("[emailService] PDF storage upload failed:", storageError);
      // Continue with email sending even if storage fails
    }

    // Email body text
    const emailBody = `Dear ${params.toName},

I'm writing to express my strong interest in the opportunity at ${params.companyName}.

Please find my cover letter and tailored resume attached.

I look forward to hearing from you.

Best regards,
Bryan Greer
bryan.greer1@gmail.com`;

    // Send to hiring manager
    const hiringManagerResult = await transporter.sendMail({
      from: "bryan.greer1@gmail.com",
      to: params.toEmail,
      subject: `Application: ${params.companyName}`,
      text: emailBody,
      attachments: [
        {
          filename: "Cover_Letter.pdf",
          content: coverLetterPDF,
          contentType: "application/pdf",
        },
        {
          filename: "Resume.pdf",
          content: resumePDF,
          contentType: "application/pdf",
        },
      ],
    });

    // Send copy to Bryan with both attachments
    const userCopyResult = await transporter.sendMail({
      from: "bryan.greer1@gmail.com",
      to: "bryan.greer1@gmail.com",
      subject: `[COPY] Application Sent to ${params.companyName} - ${params.toName}`,
      text: emailBody,
      attachments: [
        {
          filename: "Cover_Letter.pdf",
          content: coverLetterPDF,
          contentType: "application/pdf",
        },
        {
          filename: "Resume.pdf",
          content: resumePDF,
          contentType: "application/pdf",
        },
      ],
    });

    return {
      success: true,
      hiringManagerMessageId: hiringManagerResult.messageId,
      userCopyMessageId: userCopyResult.messageId,
      coverLetterPdfKey,
      resumePdfKey,
    };
  } catch (error) {
    console.error("[EmailService] Failed to send application email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function testEmailConnection() {
  try {
    const transporter = getTransporter();
    await transporter.verify();
    return { success: true, message: "Email connection verified" };
  } catch (error) {
    console.error("[EmailService] Failed to verify email connection:", error);
    throw error;
  }
}
