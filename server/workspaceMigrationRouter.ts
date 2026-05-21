import { z } from "zod";
import { eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  workspaces,
  workspaceMembers,
  workspaceSettings,
  subscriptions,
  researchConfig,
  InsertWorkspace,
  InsertWorkspaceSettings,
  InsertSubscription,
} from "../drizzle/schema";

/**
 * Workspace Migration Router - Handles migration from single-user to multi-workspace
 * This router provides procedures to migrate existing user data to the new workspace model
 */
export const workspaceMigrationRouter = router({
  /**
   * Migrate user's existing data to a default workspace
   * Creates a workspace for the user and associates their existing data
   * Should only be called once per user during onboarding
   */
  migrateToDefaultWorkspace: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available",
      });
    }

    try {
      // Check if user already has a workspace
      const existingMembership = await db
        .select()
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, ctx.user.id))
        .limit(1);

      if (existingMembership.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User already has a workspace",
        });
      }

      // Get user's existing research config
      const userConfig = await db
        .select()
        .from(researchConfig)
        .where(eq(researchConfig.userId, ctx.user.id))
        .limit(1);

      // Create default workspace
      const workspaceName =
        ctx.user.name || `${ctx.user.email}'s Workspace`;
      const workspaceSlug = `${ctx.user.email
        ?.split("@")[0]
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")}-${Date.now()}`;

      const newWorkspace: InsertWorkspace = {
        name: workspaceName,
        slug: workspaceSlug,
        description: "Default workspace",
        ownerId: ctx.user.id,
        plan: "free",
        status: "active",
      };

      const result = await db.insert(workspaces).values(newWorkspace);
      const workspaceId = (result as any).insertId ?? (result[0] as any)?.insertId;

      // Add user as owner
      await db.insert(workspaceMembers).values({
        workspaceId,
        userId: ctx.user.id,
        role: "owner",
        status: "active",
      });

      // Create workspace settings from user's existing config
      const defaultSettings: InsertWorkspaceSettings = {
        workspaceId,
        rolesPerDay: userConfig[0]?.rolesPerDay || 30,
        targetRoles: userConfig[0]?.targetRoles || null,
        categories: userConfig[0]?.categories || null,
        remoteOnly: userConfig[0]?.remoteOnly || false,
        usHiringOnly: userConfig[0]?.usHiringOnly || true,
        emailNotifications: userConfig[0]?.emailNotifications || true,
        dailyDigest: userConfig[0]?.dailyDigest || true,
      };

      await db.insert(workspaceSettings).values(defaultSettings);

      // Create default subscription (free tier)
      const defaultSubscription: InsertSubscription = {
        workspaceId,
        plan: "free",
        status: "active",
      };

      await db.insert(subscriptions).values(defaultSubscription);

      return {
        success: true,
        workspaceId,
        workspaceName,
        message: "Successfully migrated to default workspace",
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      console.error("[WorkspaceMigration] Migration error:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to migrate to workspace",
      });
    }
  }),

  /**
   * Check if user needs migration
   * Returns true if user has no workspace yet
   */
  needsMigration: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available",
      });
    }

    try {
      const membership = await db
        .select()
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, ctx.user.id))
        .limit(1);

      return membership.length === 0;
    } catch (error) {
      console.error("[WorkspaceMigration] Check migration error:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to check migration status",
      });
    }
  }),

  /**
   * Get migration status for user
   * Returns workspace info if already migrated
   */
  getMigrationStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available",
      });
    }

    try {
      const membership = await db
        .select()
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, ctx.user.id))
        .limit(1);

      if (membership.length === 0) {
        return {
          migrated: false,
          workspaceId: null,
          message: "User has not been migrated to a workspace yet",
        };
      }

      const workspace = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, membership[0].workspaceId))
        .limit(1);

      return {
        migrated: true,
        workspaceId: membership[0].workspaceId,
        workspace: workspace[0],
        role: membership[0].role,
        message: "User has been migrated to a workspace",
      };
    } catch (error) {
      console.error("[WorkspaceMigration] Get status error:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get migration status",
      });
    }
  }),
});
