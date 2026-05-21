import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  workspaces,
  workspaceMembers,
  workspaceSettings,
  subscriptions,
  users,
  InsertWorkspace,
  InsertWorkspaceSettings,
  InsertSubscription,
} from "../drizzle/schema";

/**
 * Workspace Router - Manages workspace creation, retrieval, and updates
 * All procedures are protected and require authentication
 */
export const workspaceRouter = router({
  /**
   * Create a new workspace
   * Only authenticated users can create workspaces
   * The creator becomes the workspace owner
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/),
        description: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      try {
        // Check if slug already exists
        const existing = await db
          .select()
          .from(workspaces)
          .where(eq(workspaces.slug, input.slug))
          .limit(1);

        if (existing.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Workspace slug already exists",
          });
        }

        // Create workspace
        const newWorkspace: InsertWorkspace = {
          name: input.name,
          slug: input.slug,
          description: input.description || null,
          ownerId: ctx.user.id,
          plan: "free",
          status: "active",
        };

        const result = await db.insert(workspaces).values(newWorkspace);
        const workspaceId = result[0];

        // Add creator as owner
        await db.insert(workspaceMembers).values({
          workspaceId,
          userId: ctx.user.id,
          role: "owner",
          status: "active",
        });

        // Create default workspace settings
        const defaultSettings: InsertWorkspaceSettings = {
          workspaceId,
          rolesPerDay: 30,
          remoteOnly: false,
          usHiringOnly: true,
          emailNotifications: true,
          dailyDigest: true,
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
          id: workspaceId,
          name: input.name,
          slug: input.slug,
          description: input.description || null,
          ownerId: ctx.user.id,
          plan: "free",
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("[Workspace] Create error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create workspace",
        });
      }
    }),

  /**
   * Get all workspaces for the current user
   * Returns workspaces where user is a member
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available",
      });
    }

    try {
      // Get all workspace IDs where user is a member
      const memberRecords = await db
        .select({ workspaceId: workspaceMembers.workspaceId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, ctx.user.id));

      if (memberRecords.length === 0) {
        return [];
      }

      const workspaceIds = memberRecords.map((r) => r.workspaceId);

      // Get workspace details
      const userWorkspaces = await db
        .select()
        .from(workspaces)
        .where(
          and(
            eq(workspaces.status, "active"),
            workspaceIds.length > 0
              ? workspaces.id.inArray(workspaceIds)
              : undefined
          )
        );

      return userWorkspaces;
    } catch (error) {
      console.error("[Workspace] List error:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to list workspaces",
      });
    }
  }),

  /**
   * Get a specific workspace by ID
   * User must be a member of the workspace
   */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      try {
        // Check if user is a member
        const membership = await db
          .select()
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, input.id),
              eq(workspaceMembers.userId, ctx.user.id)
            )
          )
          .limit(1);

        if (membership.length === 0) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this workspace",
          });
        }

        // Get workspace details
        const workspace = await db
          .select()
          .from(workspaces)
          .where(eq(workspaces.id, input.id))
          .limit(1);

        if (workspace.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Workspace not found",
          });
        }

        return workspace[0];
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("[Workspace] Get error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get workspace",
        });
      }
    }),

  /**
   * Update workspace details
   * Only workspace owner can update
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().max(1000).optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      try {
        // Check if user is owner
        const membership = await db
          .select()
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, input.id),
              eq(workspaceMembers.userId, ctx.user.id),
              eq(workspaceMembers.role, "owner")
            )
          )
          .limit(1);

        if (membership.length === 0) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only workspace owner can update workspace",
          });
        }

        const updateData: Record<string, unknown> = {
          updatedAt: new Date(),
        };

        if (input.name !== undefined) {
          updateData.name = input.name;
        }
        if (input.description !== undefined) {
          updateData.description = input.description;
        }

        await db
          .update(workspaces)
          .set(updateData)
          .where(eq(workspaces.id, input.id));

        // Return updated workspace
        const updated = await db
          .select()
          .from(workspaces)
          .where(eq(workspaces.id, input.id))
          .limit(1);

        return updated[0];
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("[Workspace] Update error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update workspace",
        });
      }
    }),

  /**
   * Delete a workspace (soft delete - set status to deleted)
   * Only workspace owner can delete
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      try {
        // Check if user is owner
        const membership = await db
          .select()
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, input.id),
              eq(workspaceMembers.userId, ctx.user.id),
              eq(workspaceMembers.role, "owner")
            )
          )
          .limit(1);

        if (membership.length === 0) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only workspace owner can delete workspace",
          });
        }

        // Soft delete
        await db
          .update(workspaces)
          .set({ status: "deleted", updatedAt: new Date() })
          .where(eq(workspaces.id, input.id));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("[Workspace] Delete error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete workspace",
        });
      }
    }),

  /**
   * Get workspace members
   * User must be a member of the workspace
   */
  getMembers: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      try {
        // Check if user is a member
        const membership = await db
          .select()
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, input.workspaceId),
              eq(workspaceMembers.userId, ctx.user.id)
            )
          )
          .limit(1);

        if (membership.length === 0) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this workspace",
          });
        }

        // Get all members with user info
        const members = await db
          .select({
            id: workspaceMembers.id,
            workspaceId: workspaceMembers.workspaceId,
            userId: workspaceMembers.userId,
            role: workspaceMembers.role,
            status: workspaceMembers.status,
            joinedAt: workspaceMembers.joinedAt,
            email: users.email,
            name: users.name,
          })
          .from(workspaceMembers)
          .leftJoin(users, eq(workspaceMembers.userId, users.id))
          .where(eq(workspaceMembers.workspaceId, input.workspaceId));

        return members;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("[Workspace] Get members error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get workspace members",
        });
      }
    }),
});
