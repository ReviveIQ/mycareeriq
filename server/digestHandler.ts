import { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { pipelineData } from "../client/src/lib/pipelineData";

/**
 * Handler for the 48-hour job search pipeline digest email.
 * Sends a summary of high-priority companies and action items to bryan.greer1@gmail.com
 */
export async function sendDigestEmailHandler(req: Request, res: Response) {
  try {
    // Authenticate as cron
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    // Get high-priority companies (the ones to contact first)
    const highPriority = pipelineData.filter((c) => c.priority === "High");
    const remoteCount = pipelineData.filter((c) => c.remoteOk).length;

    // Build email content
    const emailSubject = "Job Search Pipeline — 48-Hour Digest";
    const emailBody = buildDigestEmailBody(highPriority, remoteCount);

    // Send email via Manus built-in notification API
    const response = await fetch(
      `${process.env.BUILT_IN_FORGE_API_URL}/v1/notification/send_email`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: "bryan.greer1@gmail.com",
          subject: emailSubject,
          html: emailBody,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("[Digest] Email send failed:", error);
      return res.status(500).json({
        error: "Failed to send email",
        details: error,
        context: { taskUid: user.taskUid },
      });
    }

    res.json({
      ok: true,
      message: "Digest email sent successfully",
      highPriorityCount: highPriority.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Digest] Handler error:", error);
    res.status(500).json({
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context: { timestamp: new Date().toISOString() },
    });
  }
}

/**
 * Build the HTML email body for the digest
 */
function buildDigestEmailBody(highPriority: typeof pipelineData, remoteCount: number): string {
  const topCompanies = highPriority.slice(0, 5);
  const companiesHtml = topCompanies
    .map(
      (c) =>
        `
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 12px; font-weight: 600; color: #1e293b;">${c.name}</td>
      <td style="padding: 12px; color: #64748b; font-size: 14px;">${c.role}</td>
      <td style="padding: 12px; color: #64748b; font-size: 14px;">${c.contactName}</td>
      <td style="padding: 12px;">
        <a href="${c.jobLink}" target="_blank" style="color: #4f46e5; text-decoration: none;">View Job</a>
        &nbsp;|&nbsp;
        <a href="${c.contactLinkedIn}" target="_blank" style="color: #0a66c2; text-decoration: none;">LinkedIn</a>
      </td>
    </tr>
  `
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1e293b; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: white; padding: 24px; border-radius: 8px; margin-bottom: 24px; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 700; }
    .header p { margin: 8px 0 0 0; font-size: 14px; opacity: 0.9; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 16px; font-weight: 700; color: #1e293b; margin-bottom: 12px; }
    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
    .stat-box { background: #f1f5f9; padding: 12px; border-radius: 6px; border-left: 4px solid #4f46e5; }
    .stat-number { font-size: 20px; font-weight: 700; color: #4f46e5; }
    .stat-label { font-size: 12px; color: #64748b; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th { background: #f1f5f9; padding: 12px; text-align: left; font-weight: 600; font-size: 12px; color: #64748b; text-transform: uppercase; }
    td { padding: 12px; }
    .cta-button { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 12px; }
    .footer { border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Job Search Pipeline Digest</h1>
      <p>Your 48-hour summary — ${new Date().toLocaleDateString()}</p>
    </div>

    <div class="section">
      <div class="section-title">Pipeline Overview</div>
      <div class="stats">
        <div class="stat-box">
          <div class="stat-number">30</div>
          <div class="stat-label">Total Prospects</div>
        </div>
        <div class="stat-box">
          <div class="stat-number">${highPriority.length}</div>
          <div class="stat-label">High Priority</div>
        </div>
        <div class="stat-box">
          <div class="stat-number">${remoteCount}</div>
          <div class="stat-label">Remote Roles</div>
        </div>
        <div class="stat-box">
          <div class="stat-number">30</div>
          <div class="stat-label">Key Contacts</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">🎯 Top Companies to Contact Today</div>
      <p style="font-size: 14px; color: #64748b; margin-bottom: 12px;">
        These ${topCompanies.length} companies are your immediate outreach targets. Click the links to view job postings or connect on LinkedIn.
      </p>
      <table>
        <thead>
          <tr>
            <th>Company</th>
            <th>Role</th>
            <th>Contact</th>
            <th>Links</th>
          </tr>
        </thead>
        <tbody>
          ${companiesHtml}
        </tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title">📋 Suggested Actions</div>
      <ul style="font-size: 14px; color: #1e293b; padding-left: 20px;">
        <li>Reach out to the top 3 companies today via LinkedIn or email</li>
        <li>Review their job postings and customize your pitch for each</li>
        <li>Check your pipeline dashboard for the full list and analytics</li>
        <li>Update company stages as you progress through conversations</li>
      </ul>
    </div>

    <div style="text-align: center;">
      <a href="https://bryanjobs-nsyrkzpz.manus.space" class="cta-button">View Full Pipeline</a>
    </div>

    <div class="footer">
      <p>
        This is your automated 48-hour job search pipeline digest. You'll receive this every 48 hours to keep your outreach on track.
      </p>
      <p style="margin-top: 12px;">
        <strong>Bryan Greer — SaaS Enterprise Account Management</strong><br>
        30-Company Prospect Pipeline | May 2026
      </p>
    </div>
  </div>
</body>
</html>
  `;
}
