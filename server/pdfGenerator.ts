import PDFDocument from "pdfkit";
import { Buffer } from "buffer";

export async function generateCoverLetterPDF(
  coverLetterText: string,
  contactName: string,
  companyName: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "Letter",
        margin: 50,
      });

      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      doc.on("end", () => {
        resolve(Buffer.concat(chunks));
      });

      doc.on("error", reject);

      // Header with date
      doc.fontSize(11).text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), {
        align: "left",
      });

      doc.moveDown(2);

      // Recipient info
      doc.fontSize(11).text(contactName);
      doc.text(companyName);

      doc.moveDown(1);

      // Salutation
      doc.text(`Dear ${contactName},`);

      doc.moveDown(1);

      // Cover letter body
      doc.fontSize(11).text(coverLetterText, {
        align: "left",
        lineGap: 5,
      });

      doc.moveDown(2);

      // Closing
      doc.text("Best regards,");

      doc.moveDown(1);

      doc.text("Bryan Greer");
      doc.text("bryan.greer1@gmail.com");

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

export async function generateResumePDF(resumeText: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "Letter",
        margin: 50,
      });

      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      doc.on("end", () => {
        resolve(Buffer.concat(chunks));
      });

      doc.on("error", reject);

      // Title
      doc.fontSize(14).font("Helvetica-Bold").text("RESUME", { align: "center" });

      doc.moveDown(1);

      // Resume body
      doc.fontSize(10).font("Helvetica").text(resumeText, {
        align: "left",
        lineGap: 3,
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
