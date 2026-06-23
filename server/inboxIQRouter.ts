/**
 * InboxIQ — Application Tracking Layer
 *
 * Connects Gmail via OAuth, scans inbox for replies to applied companies,
 * classifies emails (reply/rejection/interview), auto-advances pipeline stages,
 * and surfaces stale applications needing follow-up.
 *
 * Required Railway env vars:
 *   GOOGLE_CLIENT_ID      — Google Cloud Console OAuth 2.0 client ID
 *   GOOGLE_CLIENT_SECRET  — Google Cloud Console OAuth 2.0 client secret
 *   GOOGLE_REDIRECT_URI   — e.g. https://mycareeriq.reviveiqi.com/api/inbox/oauth/callback
 */

import express from "express";
import { getDb } from "./db";
import { users, companies } from "../drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { verifySessionToken } from "./_core/auth";

const router = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ||
  "https://mycareeriq.reviveiqi.com/api/inbox/oauth/callback";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

// ── Auth middleware ──────────────────────────────────────────────────────────
async function requireAuth(req: any, res: any, next: any) {
  const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await verifySessionToken(token);
  if (!user) { res.status(401).json({ error: "Invalid session" }); return; }
  req.userId = user.userId;
  next();
}

// ── GET /api/inbox/status ────────────────────────────────────────────────────
// Returns connection status and last scan time
router.get("/status", requireAuth, async (req: any, res: any) => {
  try {
    const db = await getDb();
    if (!db) { res.json({ connected: false }); return; }

    const rows = await db.select({
      gmailConnected: (users as any).gmailConnected,
      gmailEmail: (users as any).gmailEmail,
      inboxLastScanned: (users as any).inboxLastScanned,
    }).from(users).where(eq(users.id, req.userId)).limit(1);

    const user = rows[0];
    res.json({
      connected: !!(user as any)?.gmailConnected,
      gmailEmail: (user as any)?.gmailEmail || null,
      lastScanned: (user as any)?.inboxLastScanned || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/inbox/oauth/start ───────────────────────────────────────────────
// Redirects user to Google OAuth consent screen
// Token passed as query param since browser can't send Bearer headers on redirect
router.get("/oauth/start", async (req: any, res: any) => {
  if (!GOOGLE_CLIENT_ID) {
    res.status(503).json({ error: "Google OAuth not configured — add GOOGLE_CLIENT_ID to Railway" });
    return;
  }

  // Accept token as query param from frontend
  const token = (req.query.token as string) || (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return; }

  const user = await verifySessionToken(token);
  if (!user) { res.status(401).json({ error: "Invalid session" }); return; }

  const state = Buffer.from(JSON.stringify({ userId: user.userId, ts: Date.now() })).toString("base64url");
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: GMAIL_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// ── GET /api/inbox/oauth/callback ────────────────────────────────────────────
// Google redirects here after user authorizes
router.get("/oauth/callback", async (req: any, res: any) => {
  const { code, state, error } = req.query;

  if (error) {
    res.redirect("https://mycareeriq.reviveiqi.com/?inbox_error=denied");
    return;
  }

  try {
    // Decode state to get userId
    const { userId } = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenRes.json() as any;
    if (!tokens.access_token) {
      res.redirect("https://mycareeriq.reviveiqi.com/?inbox_error=token_failed");
      return;
    }

    // Get user's Gmail address
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json() as any;

    // Store tokens in DB
    const db = await getDb();
    if (!db) { res.redirect("https://mycareeriq.reviveiqi.com/?inbox_error=db_error"); return; }

    await db.update(users).set({
      gmailConnected: true,
      gmailEmail: profile.email,
      gmailAccessToken: tokens.access_token,
      gmailRefreshToken: tokens.refresh_token || null,
      inboxLastScanned: null,
    } as any).where(eq(users.id, userId));

    console.log(`[InboxIQ] Gmail connected for userId ${userId}: ${profile.email}`);
    res.redirect("https://mycareeriq.reviveiqi.com/?inbox_connected=1");
  } catch (err: any) {
    console.error("[InboxIQ] OAuth callback error:", err.message);
    res.redirect("https://mycareeriq.reviveiqi.com/?inbox_error=server_error");
  }
});

// ── POST /api/inbox/disconnect ───────────────────────────────────────────────
router.post("/disconnect", requireAuth, async (req: any, res: any) => {
  try {
    const db = await getDb();
    if (!db) { res.status(500).json({ error: "DB unavailable" }); return; }
    await db.update(users).set({
      gmailConnected: false,
      gmailEmail: null,
      gmailAccessToken: null,
      gmailRefreshToken: null,
    } as any).where(eq(users.id, req.userId));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/inbox/scan ─────────────────────────────────────────────────────
// Scans Gmail for emails from pipeline companies, classifies, updates stages
router.post("/scan", requireAuth, async (req: any, res: any) => {
  try {
    const db = await getDb();
    if (!db) { res.status(500).json({ error: "DB unavailable" }); return; }

    const userRows = await db.select().from(users).where(eq(users.id, req.userId)).limit(1);
    const user = userRows[0] as any;

    if (!user?.gmailConnected || !user?.gmailAccessToken) {
      res.status(400).json({ error: "Gmail not connected" }); return;
    }

    // Get fresh access token if needed
    let accessToken = user.gmailAccessToken;
    if (user.gmailRefreshToken) {
      const refreshed = await refreshGmailToken(user.gmailRefreshToken);
      if (refreshed) {
        accessToken = refreshed;
        await db.update(users).set({ gmailAccessToken: refreshed } as any).where(eq(users.id, req.userId));
      }
    }

    // Get all Applied/Outreach companies for this user
    const pipeline = await db.select({
      id: companies.id,
      companyName: companies.companyName,
      stage: companies.stage,
      contactEmail: companies.contactEmail,
    }).from(companies).where(
      and(
        eq(companies.userId, req.userId),
        inArray(companies.stage as any, ["Research", "Outreach", "Applied", "Interviewing"])
      )
    );

    if (!pipeline.length) {
      res.json({ scanned: 0, events: [] }); return;
    }

    // Build domain list from company names
    const companyDomains = await buildDomainMap(pipeline);

    // Fetch recent emails from Gmail
    const emails = await fetchGmailMessages(accessToken, 50);
    console.log(`[InboxIQ] Fetched ${emails.length} recent emails for userId ${req.userId}`);

    const events: any[] = [];

    for (const email of emails) {
      const fromDomain = extractDomain(email.from);
      const matchedCompany = companyDomains.get(fromDomain);
      if (!matchedCompany) continue;

      // Classify the email
      const classification = await classifyEmail(email.subject, email.snippet, matchedCompany.companyName);
      if (!classification || classification.type === "other") continue;

      events.push({
        companyId: matchedCompany.id,
        companyName: matchedCompany.companyName,
        type: classification.type,
        subject: email.subject,
        from: email.from,
        date: email.date,
        snippet: email.snippet,
        newStage: classification.newStage,
      });

      // Auto-advance pipeline stage
      if (classification.newStage && classification.newStage !== matchedCompany.stage) {
        await db.update(companies).set({ stage: classification.newStage } as any)
          .where(and(eq(companies.id, matchedCompany.id), eq(companies.userId, req.userId)));
        console.log(`[InboxIQ] Auto-advanced ${matchedCompany.companyName}: ${matchedCompany.stage} → ${classification.newStage}`);
      }
    }

    // Update last scanned time
    await db.update(users).set({ inboxLastScanned: new Date() } as any).where(eq(users.id, req.userId));

    // Save events to inbox_events table
    if (events.length) {
      for (const event of events) {
        await db.execute(sql`
          INSERT IGNORE INTO inbox_events (userId, companyId, companyName, eventType, subject, fromAddress, emailDate, snippet, newStage, createdAt)
          VALUES (${req.userId}, ${event.companyId}, ${event.companyName}, ${event.type}, ${event.subject}, ${event.from}, ${new Date(event.date)}, ${event.snippet}, ${event.newStage || null}, NOW())
        `).catch(() => {}); // IGNORE duplicates
      }
    }

    res.json({ scanned: emails.length, events });
  } catch (err: any) {
    console.error("[InboxIQ] Scan error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/inbox/events ────────────────────────────────────────────────────
// Returns recent inbox events for this user
router.get("/events", requireAuth, async (req: any, res: any) => {
  try {
    const db = await getDb();
    if (!db) { res.json({ events: [], stale: [] }); return; }

    // Get inbox events
    const events = await db.execute(sql`
      SELECT * FROM inbox_events
      WHERE userId = ${req.userId}
      ORDER BY emailDate DESC
      LIMIT 50
    `).catch(() => ({ rows: [] })) as any;

    // Get stale applications (Applied > 7 days, no inbox event)
    const stale = await db.execute(sql`
      SELECT c.id, c.companyName, c.jobTitle, c.stage, c.createdAt
      FROM companies c
      WHERE c.userId = ${req.userId}
      AND c.stage = 'Applied'
      AND c.createdAt < DATE_SUB(NOW(), INTERVAL 7 DAY)
      AND c.id NOT IN (
        SELECT DISTINCT companyId FROM inbox_events
        WHERE userId = ${req.userId} AND eventType = 'reply'
      )
      ORDER BY c.createdAt ASC
      LIMIT 10
    `).catch(() => ({ rows: [] })) as any;

    res.json({
      events: events.rows || [],
      stale: stale.rows || [],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function refreshGmailToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        grant_type: "refresh_token",
      }),
    });
    const data = await res.json() as any;
    return data.access_token || null;
  } catch { return null; }
}

async function fetchGmailMessages(accessToken: string, maxResults = 50): Promise<any[]> {
  try {
    // Fetch message list
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=in:inbox`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listData = await listRes.json() as any;
    const messages = listData.messages || [];

    // Fetch each message (in parallel, batched)
    const details = await Promise.all(
      messages.slice(0, 30).map(async (msg: any) => {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        return msgRes.json();
      })
    );

    return details.map((d: any) => {
      const headers = d.payload?.headers || [];
      const get = (name: string) => headers.find((h: any) => h.name === name)?.value || "";
      return {
        id: d.id,
        from: get("From"),
        subject: get("Subject"),
        date: get("Date"),
        snippet: d.snippet || "",
      };
    });
  } catch (err: any) {
    console.error("[InboxIQ] Gmail fetch error:", err.message);
    return [];
  }
}

function extractDomain(from: string): string {
  const match = from.match(/@([\w.-]+)/);
  return match ? match[1].toLowerCase() : "";
}

async function buildDomainMap(pipeline: any[]): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  for (const company of pipeline) {
    // Convert company name to likely domain
    const name = company.companyName.toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .replace(/inc|llc|corp|co$/, "");
    // Try common TLDs
    map.set(`${name}.com`, company);
    map.set(`${name}.io`, company);
    map.set(`${name}.ai`, company);
    // Also add contact email domain if available
    if (company.contactEmail) {
      const domain = extractDomain(`noreply@${company.contactEmail.split("@")[1]}`);
      if (domain) map.set(domain, company);
    }
  }
  return map;
}

async function classifyEmail(subject: string, snippet: string, companyName: string): Promise<{ type: string; newStage: string | null } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 100,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: `Classify this email from ${companyName} in the context of a job application. Return JSON only:
{ "type": "reply" | "rejection" | "interview" | "other", "newStage": "Interviewing" | "Rejected" | null }

reply = human responded to outreach or application (not automated)
rejection = automated or human rejection
interview = interview invitation or scheduling request
other = newsletters, automated confirmations, unrelated`,
          },
          { role: "user", content: `Subject: ${subject}\n\nPreview: ${snippet}` },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });

    const data = await res.json() as any;
    const text = data.choices?.[0]?.message?.content || "";
    const clean = text.replace(/```json?|```/g, "").trim();
    return JSON.parse(clean);
  } catch { return null; }
}

export default router;
