/**
 * Notification service — sends alerts via Gmail SMTP
 * Falls back to console.log if email not configured
 */
import nodemailer from "nodemailer";

export type NotificationPayload = {
  title: string;
  content: string;
};

function getTransporter() {
  const user = process.env.GMAIL_USER || process.env.GMAIL_APP_EMAIL;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
}

export async function notifyOwner(payload: NotificationPayload): Promise<boolean> {
  const { title, content } = payload;
  if (!title || !content) return false;

  const transporter = getTransporter();
  const ownerEmail = process.env.OWNER_EMAIL || process.env.GMAIL_USER || process.env.GMAIL_APP_EMAIL;

  if (!transporter || !ownerEmail) {
    console.log(`[Notification] ${title}\n${content}`);
    return true;
  }

  try {
    await transporter.sendMail({
      from: `"MyCareerIQ" <${process.env.GMAIL_USER || process.env.GMAIL_APP_EMAIL}>`,
      to: ownerEmail,
      subject: title,
      text: content,
      html: `<pre style="font-family:sans-serif;white-space:pre-wrap">${content}</pre>`,
    });
    console.log(`[Notification] Email sent to ${ownerEmail}: ${title}`);
    return true;
  } catch (err) {
    console.warn("[Notification] Email failed:", err);
    return false;
  }
}

export async function notifyNewUser(email: string, name: string): Promise<void> {
  const time = new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });
  await notifyOwner({
    title: `🆕 New MyCareerIQ signup — ${email}`,
    content: `New free account created\n\nName: ${name || "—"}\nEmail: ${email}\nTime: ${time} ET\nPlan: Free`,
  });
}

export async function notifyPurchase(email: string, plan: string, amount: string): Promise<void> {
  const time = new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });
  await notifyOwner({
    title: `💰 MyCareerIQ purchase — ${amount} — ${email}`,
    content: `New purchase 🎉\n\nEmail: ${email}\nPlan: ${plan}\nAmount: ${amount}\nTime: ${time} ET`,
  });
}
