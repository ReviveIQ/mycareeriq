import { int, json, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  linkedinAccessToken: varchar("linkedinAccessToken", { length: 1000 }),
  // Stripe subscription
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  plan: mysqlEnum("plan", ["free", "pro"]).default("free").notNull(),
  planInterval: varchar("planInterval", { length: 20 }), // "month" | "year"
  planStatus: varchar("planStatus", { length: 50 }).default("active"),
  planExpiresAt: timestamp("planExpiresAt"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Stores generated applications with cover letters and tailored resumes.
 * Tracks the state of each application (draft, scheduled, sent).
 */
export const applications = mysqlTable("applications", {
  id: int("id").autoincrement().primaryKey(),
  
  // User who created this application
  userId: int("userId").notNull(),
  
  // Reference to the company in the pipeline
  companyId: varchar("companyId", { length: 255 }).default(""),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  contactEmail: varchar("contactEmail", { length: 320 }).default(""),
  contactName: varchar("contactName", { length: 255 }).notNull(),
  jobTitle: varchar("jobTitle", { length: 255 }).notNull(),
  
  // Generated documents
  coverLetter: text("coverLetter").notNull(),
  tailoredResume: text("tailoredResume").notNull(),
  
  // Application state
  status: mysqlEnum("status", ["draft", "scheduled", "sent", "failed"]).default("draft").notNull(),
  
  // Application outcome tracking
  outcome: mysqlEnum("outcome", ["pending", "interviewing", "offer", "rejected"]).default("pending").notNull(),
  
  // Scheduling info
  scheduledSendTime: timestamp("scheduledSendTime"),
  sentAt: timestamp("sentAt"),
  
  // Email delivery tracking
  sentToHiringManager: boolean("sentToHiringManager").default(false),
  sentToUser: boolean("sentToUser").default(false),
  
  // PDF storage keys (stored in S3)
  coverLetterPdfKey: varchar("coverLetterPdfKey", { length: 512 }),
  resumePdfKey: varchar("resumePdfKey", { length: 512 }),
  
  // Metadata
  jobDescription: text("jobDescription"),
  companyProfile: text("companyProfile"),
  generatedAt: timestamp("generatedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Application = typeof applications.$inferSelect;
export type InsertApplication = typeof applications.$inferInsert;

/**
 * Stores the job search pipeline companies (prospects).
 * This is the main table for managing the 30-company prospect list.
 */
export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),
  
  // User who owns this company in their pipeline
  userId: int("userId").notNull(),
  
  // Company identification
  companyId: varchar("companyId", { length: 255 }).notNull(),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }),
  
  // Job details
  jobTitle: varchar("jobTitle", { length: 255 }),
  jobDescription: text("jobDescription"),
  jobLink: varchar("jobLink", { length: 500 }),
  
  // Contact information
  contactName: varchar("contactName", { length: 255 }),
  contactEmail: varchar("contactEmail", { length: 320 }),
  linkedinUrl: varchar("linkedinUrl", { length: 500 }),
  
  // Opportunity details
  remote: boolean("remote").default(false),
  salary: varchar("salary", { length: 100 }),
  companySize: varchar("companySize", { length: 50 }),
  
  // Pipeline tracking
  priority: mysqlEnum("priority", ["High", "Medium", "Low"]).default("Medium").notNull(),
  stage: mysqlEnum("stage", ["Research", "Outreach", "Applied", "Interviewing", "Offer", "Rejected"]).default("Research").notNull(),
  
  // Custom notes
  notes: text("notes"),
  
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Company = typeof companies.$inferSelect;
export type InsertCompany = typeof companies.$inferInsert;

/**
 * Research configuration table to store user preferences for daily role research
 */
export const researchConfig = mysqlTable("researchConfig", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // Comma-separated list of roles to research (defaults provided by app code on insert; TEXT columns can't have DB defaults in TiDB)
  targetRoles: text("targetRoles").notNull(),

  // Comma-separated list of categories to research
  targetCategories: text("targetCategories").notNull(),



  // Comma-separated list of target companies to scrape
  targetCompanies: text("targetCompanies").notNull(),
  
  // Number of roles to research per day
  rolesPerDay: int("rolesPerDay").notNull().default(30),
  
  // Research enabled/disabled toggle
  enabled: int("enabled").notNull().default(1),

  // Document intake fields - generic, supports any document type (resume, prospect brief, etc.)
  documentType: varchar("documentType", { length: 50 }).notNull().default("resume"),
  documentFileName: varchar("documentFileName", { length: 255 }),
  lastDocumentParsed: json("lastDocumentParsed"),

  // Comma-separated country codes to filter job locations: "US", "UK", "CA", "AU", "remote"
  // Empty = no filter (all locations)
  targetCountries: varchar("targetCountries", { length: 255 }),

  // Work arrangement filter: "remote", "hybrid", "onsite" — comma-separated, empty = all
  workArrangement: varchar("workArrangement", { length: 100 }),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ResearchConfig = typeof researchConfig.$inferSelect;
export type InsertResearchConfig = typeof researchConfig.$inferInsert;

/**
 * User profile table to store resume and personalization data
 */
export const userProfiles = mysqlTable("userProfiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  
  // Resume storage
  resumeKey: varchar("resumeKey", { length: 512 }),
  resumeText: text("resumeText"),
  
  // User preferences
  targetRoles: text("targetRoles"),
  targetIndustries: text("targetIndustries"),
  
  // Onboarding status
  onboardingComplete: boolean("onboardingComplete").default(false),
  pipelineGenerated: boolean("pipelineGenerated").default(false),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;

export const jobResearchMonitoring = mysqlTable("jobResearchMonitoring", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  targetRoles: text("targetRoles").notNull(),
  targetCategories: text("targetCategories").notNull(),
  rolesPerDay: int("rolesPerDay").notNull(),
  
  jobsResearched: int("jobsResearched").notNull(),
  jobsAdded: int("jobsAdded").notNull(),
  topJobTitles: text("topJobTitles"),
  
  success: boolean("success").notNull(),
  errorMessage: text("errorMessage"),
  executionTimeMs: int("executionTimeMs").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type JobResearchMonitoring = typeof jobResearchMonitoring.$inferSelect;
export type InsertJobResearchMonitoring = typeof jobResearchMonitoring.$inferInsert;

// TODO: Add your tables here

/**
 * Workspaces table - represents a team/organization workspace
 * Each workspace is isolated and has its own data, settings, and subscription
 */
export const workspaces = mysqlTable("workspaces", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  description: text("description"),
  ownerId: int("ownerId").notNull(),
  plan: mysqlEnum("plan", ["free", "pro", "enterprise"]).default("free").notNull(),
  status: mysqlEnum("status", ["active", "suspended", "deleted"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = typeof workspaces.$inferInsert;

/**
 * Workspace members table - manages team membership, roles, and permissions
 * Roles: owner (full control), manager (team management), member (limited access)
 */
export const workspaceMembers = mysqlTable("workspaceMembers", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["owner", "manager", "member"]).default("member").notNull(),
  invitedBy: int("invitedBy"),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  status: mysqlEnum("status", ["active", "invited", "inactive"]).default("active").notNull(),
});
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type InsertWorkspaceMember = typeof workspaceMembers.$inferInsert;

/**
 * Workspace settings table - workspace-level job research configuration
 * Replaces user-level researchConfig for multi-user support
 */
export const workspaceSettings = mysqlTable("workspaceSettings", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().unique(),
  rolesPerDay: int("rolesPerDay").default(30).notNull(),
  targetRoles: text("targetRoles"),
  categories: text("categories"),
  remoteOnly: boolean("remoteOnly").default(false).notNull(),
  usHiringOnly: boolean("usHiringOnly").default(true).notNull(),
  emailNotifications: boolean("emailNotifications").default(true).notNull(),
  dailyDigest: boolean("dailyDigest").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WorkspaceSettings = typeof workspaceSettings.$inferSelect;
export type InsertWorkspaceSettings = typeof workspaceSettings.$inferInsert;

/**
 * Subscriptions table - Stripe subscription tracking and billing management
 */
export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().unique(),
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  plan: mysqlEnum("plan", ["free", "pro", "enterprise"]).default("free").notNull(),
  status: mysqlEnum("status", ["active", "past_due", "canceled", "unpaid"]).default("active").notNull(),
  currentPeriodStart: timestamp("currentPeriodStart"),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  canceledAt: timestamp("canceledAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

/**
 * Workspace invitations table - manage pending team member invitations
 * Includes expiring tokens for secure invitation acceptance
 */
export const workspaceInvitations = mysqlTable("workspaceInvitations", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  role: mysqlEnum("role", ["manager", "member"]).default("member").notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  invitedBy: int("invitedBy").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  acceptedAt: timestamp("acceptedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type WorkspaceInvitation = typeof workspaceInvitations.$inferSelect;
export type InsertWorkspaceInvitation = typeof workspaceInvitations.$inferInsert;
