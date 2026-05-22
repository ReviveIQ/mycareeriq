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
import { getDb } from "../db";

async function runMigrations() {
  try {
    const db = await getDb();
    if (!db) return;

    const migrations = [
      // passwordHash column
      `ALTER TABLE users ADD COLUMN passwordHash varchar(255)`,

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

async function startServer() {
  await runMigrations();

  const app = express();
  const server = createServer(app);

  app.set("trust proxy", 1);
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerAuthRoutes(app);

  app.post("/api/scheduled/sendDigest", sendDigestEmailHandler);
  app.post("/api/scheduled/jobResearch", jobResearchHandler);

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
}

startServer().catch(console.error);
