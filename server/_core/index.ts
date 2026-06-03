import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerAuthRoutes } from "./auth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sendDigestEmailHandler } from "../digestHandler";
import { jobResearchHandler } from "../jobResearchHandler";
import { registerResumeIQRoutes } from "../resumeIQRouter";
import { getDb } from "../db";

async function runMigrations() {
  try {
    const db = await getDb();
    if (!db) return;

    const migrations = [
      // Core users table
      `CREATE TABLE IF NOT EXISTS users (
        id int AUTO_INCREMENT NOT NULL,
        openId varchar(64) NOT NULL,
        name text,
        email varchar(320),
        passwordHash varchar(255),
        loginMethod varchar(64),
        role enum('user','admin') NOT NULL DEFAULT 'user',
        createdAt timestamp NOT NULL DEFAULT (now()),
        updatedAt timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        lastSignedIn timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT users_id PRIMARY KEY(id),
        CONSTRAINT users_openId_unique UNIQUE(openId)
      )`,

      // researchConfig table
      `CREATE TABLE IF NOT EXISTS researchConfig (
        id int AUTO_INCREMENT NOT NULL,
        userId int NOT NULL,
        targetRoles text,
        targetCategories text,
        targetCompanies text,
        rolesPerDay int NOT NULL DEFAULT 30,
        enabled tinyint NOT NULL DEFAULT 1,
        documentType varchar(50) DEFAULT 'resume',
        documentFileName varchar(255),
        lastDocumentParsed json,
        createdAt timestamp NOT NULL DEFAULT (now()),
        updatedAt timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT researchConfig_id PRIMARY KEY(id)
      )`,

      // companies table
      `CREATE TABLE IF NOT EXISTS companies (
        id int AUTO_INCREMENT NOT NULL,
        userId int NOT NULL,
        companyId varchar(255) NOT NULL,
        companyName varchar(255) NOT NULL,
        category varchar(255) DEFAULT '',
        jobTitle varchar(255) DEFAULT '',
        jobDescription text,
        jobLink varchar(2000) DEFAULT '',
        contactName varchar(255) DEFAULT '',
        contactEmail varchar(320) DEFAULT '',
        linkedinUrl varchar(500) DEFAULT '',
        contactLinkedIn varchar(500) DEFAULT '',
        remote boolean DEFAULT false,
        salary varchar(255) DEFAULT '',
        companySize varchar(100) DEFAULT '',
        priority enum('High','Medium','Low') DEFAULT 'Medium',
        stage varchar(100) DEFAULT 'Research',
        notes text,
        createdAt timestamp NOT NULL DEFAULT (now()),
        updatedAt timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT companies_id PRIMARY KEY(id)
      )`,

      // passwordHash column (for existing databases) - ignore if already exists
      `ALTER TABLE users ADD COLUMN passwordHash varchar(255)`,
      // contactLinkedIn is deprecated - linkedinUrl is used instead - skip this migration
      // Expand jobLink column size for long Adzuna URLs
      `ALTER TABLE companies MODIFY COLUMN jobLink varchar(2000) DEFAULT ''`,

      // applications table
      `CREATE TABLE IF NOT EXISTS applications (
        id int AUTO_INCREMENT NOT NULL,
        userId int NOT NULL,
        companyId varchar(255) DEFAULT '',
        companyName varchar(255) NOT NULL DEFAULT '',
        contactEmail varchar(320) DEFAULT '',
        contactName varchar(255) NOT NULL DEFAULT '',
        jobTitle varchar(255) NOT NULL DEFAULT '',
        coverLetter text NOT NULL,
        tailoredResume text NOT NULL,
        status enum('draft','scheduled','sent','failed') NOT NULL DEFAULT 'draft',
        outcome enum('pending','interviewing','offer','rejected') NOT NULL DEFAULT 'pending',
        scheduledSendTime timestamp NULL,
        sentAt timestamp NULL,
        sentToHiringManager boolean DEFAULT false,
        sentToUser boolean DEFAULT false,
        coverLetterPdfKey varchar(512),
        resumePdfKey varchar(512),
        jobDescription text,
        companyProfile text,
        generatedAt timestamp NOT NULL DEFAULT (now()),
        createdAt timestamp NOT NULL DEFAULT (now()),
        updatedAt timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT applications_id PRIMARY KEY(id)
      )`,

      // workspaces table
      `CREATE TABLE IF NOT EXISTS workspaces (
        id int AUTO_INCREMENT NOT NULL,
        name varchar(255) NOT NULL,
        slug varchar(255) NOT NULL,
        description text,
        ownerId int NOT NULL,
        plan enum('free','pro','enterprise') NOT NULL DEFAULT 'free',
        status enum('active','suspended','deleted') NOT NULL DEFAULT 'active',
        createdAt timestamp NOT NULL DEFAULT (now()),
        updatedAt timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT workspaces_id PRIMARY KEY(id),
        CONSTRAINT workspaces_slug_unique UNIQUE(slug)
      )`,

      // workspaceMembers table
      `CREATE TABLE IF NOT EXISTS workspaceMembers (
        id int AUTO_INCREMENT NOT NULL,
        workspaceId int NOT NULL,
        userId int NOT NULL,
        role enum('owner','manager','member') NOT NULL DEFAULT 'member',
        invitedBy int,
        joinedAt timestamp NOT NULL DEFAULT (now()),
        status enum('active','invited','inactive') NOT NULL DEFAULT 'active',
        CONSTRAINT workspaceMembers_id PRIMARY KEY(id)
      )`,

      // workspaceSettings table
      `CREATE TABLE IF NOT EXISTS workspaceSettings (
        id int AUTO_INCREMENT NOT NULL,
        workspaceId int NOT NULL,
        rolesPerDay int NOT NULL DEFAULT 30,
        targetRoles text,
        categories text,
        remoteOnly boolean NOT NULL DEFAULT false,
        usHiringOnly boolean NOT NULL DEFAULT true,
        emailNotifications boolean NOT NULL DEFAULT true,
        dailyDigest boolean NOT NULL DEFAULT true,
        createdAt timestamp NOT NULL DEFAULT (now()),
        updatedAt timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT workspaceSettings_id PRIMARY KEY(id),
        CONSTRAINT workspaceSettings_workspaceId_unique UNIQUE(workspaceId)
      )`,

      // subscriptions table
      `CREATE TABLE IF NOT EXISTS subscriptions (
        id int AUTO_INCREMENT NOT NULL,
        workspaceId int NOT NULL,
        stripeCustomerId varchar(255),
        stripeSubscriptionId varchar(255),
        plan enum('free','pro','enterprise') NOT NULL DEFAULT 'free',
        status enum('active','past_due','canceled','unpaid') NOT NULL DEFAULT 'active',
        currentPeriodStart timestamp,
        currentPeriodEnd timestamp,
        canceledAt timestamp,
        createdAt timestamp NOT NULL DEFAULT (now()),
        updatedAt timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT subscriptions_id PRIMARY KEY(id),
        CONSTRAINT subscriptions_workspaceId_unique UNIQUE(workspaceId)
      )`,

      
      // researchConfig document columns (migration 0012)
      `ALTER TABLE researchConfig ADD COLUMN documentType varchar(50) DEFAULT 'resume'`,
      `ALTER TABLE researchConfig ADD COLUMN documentFileName varchar(255)`,
      `ALTER TABLE researchConfig ADD COLUMN lastDocumentParsed json`,
      // targetCountries for location filtering (comma-separated: US,UK,CA,AU,remote)
      `ALTER TABLE researchConfig ADD COLUMN targetCountries varchar(255)`,
      // workArrangement filter: remote, hybrid, onsite (comma-separated, empty = all)
      `ALTER TABLE researchConfig ADD COLUMN workArrangement varchar(100)`,
      // workspaceInvitations table
      `CREATE TABLE IF NOT EXISTS workspaceInvitations (
        id int AUTO_INCREMENT NOT NULL,
        workspaceId int NOT NULL,
        email varchar(320) NOT NULL,
        role enum('manager','member') NOT NULL DEFAULT 'member',
        token varchar(255) NOT NULL,
        invitedBy int NOT NULL,
        expiresAt timestamp NOT NULL,
        acceptedAt timestamp,
        createdAt timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT workspaceInvitations_id PRIMARY KEY(id),
        CONSTRAINT workspaceInvitations_token_unique UNIQUE(token)
      )`,

      // Stripe subscription columns on users table
      `ALTER TABLE users ADD COLUMN stripeCustomerId varchar(255)`,
      `ALTER TABLE users ADD COLUMN stripeSubscriptionId varchar(255)`,
      `ALTER TABLE users ADD COLUMN plan enum('free','pro') NOT NULL DEFAULT 'free'`,
      `ALTER TABLE users ADD COLUMN planInterval varchar(20)`,
      `ALTER TABLE users ADD COLUMN planStatus varchar(50) DEFAULT 'active'`,
      `ALTER TABLE users ADD COLUMN planExpiresAt timestamp NULL`,
    ];

    for (const sql of migrations) {
      try {
        await db.execute(sql);
        const tableName = sql.match(/TABLE(?:\s+IF NOT EXISTS)?\s+(\w+)/i)?.[1] || 
                          sql.match(/COLUMN\s+(\w+)/i)?.[1] || "unknown";
        console.log(`[Migrations] ${tableName} ready ✓`);
      } catch (e: any) {
        const isDuplicate = e?.message?.includes("Duplicate") || 
                           e?.message?.includes("already exists");
        if (!isDuplicate) {
          console.warn(`[Migrations] Warning:`, e?.message?.slice(0, 100));
        }
      }
    }

    console.log("[Migrations] All migrations complete ✓");
  } catch (error: any) {
    console.warn("[Migrations] Error:", error?.message);
  }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => { server.close(() => resolve(true)); });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

const ALLOWED_ORIGINS = [
  "https://mycareeriq.reviveiqi.com",
  "https://resumeiq.reviveiqi.com",
  "https://claude.ai",
  "https://www.claude.ai",
  "http://localhost:5173",
  "http://localhost:3000",
];

async function startServer() {
  await runMigrations();

  const app = express();
  const server = createServer(app);

  app.set("trust proxy", 1);

  // CORS
  app.use((req: any, res: any, next: any) => {
    const origin = req.headers.origin as string | undefined;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    if (req.method === "OPTIONS") { res.sendStatus(204); return; }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerAuthRoutes(app);
  registerResumeIQRoutes(app);

  // ── Cross-app SSO handoff ─────────────────────────────────────────────────
  // Generates a short-lived signed token so a logged-in MyCareerIQ user can
  // be automatically signed into ResumeIQ without re-authenticating.
  // Token expires in 5 minutes and can only be used once (nonce in payload).
  app.post("/api/auth/cross-app-token", async (req: any, res: any) => {
    try {
      const authHeader = req.headers.authorization || "";
      const token = authHeader.replace("Bearer ", "").trim();
      if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }

      const { verifySessionToken } = await import("./auth");
      const user = await verifySessionToken(token);
      if (!user) { res.status(401).json({ error: "Invalid session" }); return; }

      const secret = process.env.CROSS_APP_SECRET || process.env.JWT_SECRET || "cross-app-secret";
      const crypto = await import("crypto");
      const nonce = crypto.randomBytes(16).toString("hex");
      const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
      const payload = JSON.stringify({ email: user.email, name: user.name, nonce, expiresAt });
      const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
      const crossToken = Buffer.from(JSON.stringify({ payload, sig })).toString("base64url");

      console.log(`[CrossApp] SSO token issued for ${user.email}`);
      res.json({ token: crossToken });
    } catch (err) {
      console.error("[CrossApp] Token generation failed:", err);
      res.status(500).json({ error: "Failed to generate SSO token" });
    }
  });

  app.post("/api/scheduled/sendDigest", sendDigestEmailHandler);
  app.post("/api/scheduled/jobResearch", jobResearchHandler);

  // ── Stripe webhook ────────────────────────────────────────────────────────
  // Must use raw body — express.json() must NOT parse this route
  app.post("/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req: any, res: any) => {
      try {
        const { handleWebhookEvent } = await import("../stripeService");
        const sig = req.headers["stripe-signature"] || "";
        const result = await handleWebhookEvent(req.body, sig);

        if (result?.userId && result?.updates) {
          const db = await import("../db").then(m => m.getDb());
          if (db) {
            const { users } = await import("../../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            await db.update(users)
              .set(result.updates as any)
              .where(eq(users.id, result.userId));
            console.log(`[Stripe] Updated user ${result.userId}: plan=${result.updates.plan}, status=${result.updates.planStatus}`);

            // Update run limit based on plan
            const { researchConfig } = await import("../../drizzle/schema");
            const newLimit = result.updates.plan === "pro" ? 9999 : 3;
            await db.update(researchConfig)
              .set({ monthlyRunLimit: newLimit } as any)
              .where(eq(researchConfig.userId, result.userId));
          }
        }

        res.json({ received: true });
      } catch (err: any) {
        console.error("[Stripe] Webhook error:", err.message);
        res.status(400).json({ error: err.message });
      }
    }
  );

  // Serve S3 storage files via signed URL redirect
  app.get("/api/storage/:key(*)", async (req: any, res: any) => {
    try {
      const { storageGetSignedUrl } = await import("../storage");
      const url = await storageGetSignedUrl(req.params.key);
      if (!url) { res.status(404).send("File not found"); return; }
      res.redirect(307, url);
    } catch { res.status(502).send("Storage error"); }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({ router: appRouter, createContext })
  );

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = process.env.PORT ? parseInt(process.env.PORT) : await findAvailablePort(3000);
  server.listen(port, "0.0.0.0", () => {
    console.log(`[Server] Running on port ${port}`);
  });

  // Daily job research cron — 8:00 AM EST (13:00 UTC)
  try {
    const cron = await import("node-cron");
    cron.default.schedule("0 13 * * *", async () => {
      console.log("[Cron] Starting daily job research");
      try {
        const { runDailyJobResearch } = await import("../jobResearchCron");
        await runDailyJobResearch(1);
      } catch (err) {
        console.error("[Cron] Job research failed:", err);
      }
    }, { timezone: "UTC" });
    console.log("[Cron] Daily job research scheduled at 8:00 AM EST");
  } catch (err: any) {
    console.warn("[Cron] node-cron not available:", err.message);
  }
}

startServer().catch(console.error);
