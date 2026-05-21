import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  workspaceMembers,
  workspaceInvitations,
  workspaces,
  users,
  InsertWorkspaceMember,
  InsertWorkspaceInvitation,
} from "../drizzle/schema";
import { randomBytes } from "crypto";

/**
 * Generate a secure invitation token
 */
function generateInvitationToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Workspace Member Router - Manages team membership and invitations
 */
export const workspaceMemberRouter = router({
  /**
   * Invite a user to the workspace by email
   * Only workspace owner/manager can invite
   */
  invite: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number(),
        email: z.string().email(),
        role: z.enum(["manager", "member"]),
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
        // Check if user has permission to invite (owner or manager)
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

        if (
          membership.length === 0 ||
          (membership[0].role !== "owner" && membership[0].role !== "manager")
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only workspace owner/manager can invite members",
          });
        }

        // Check if user is already a member
        const existingUser = await db
          .select()
          .from(users)
          .where(eq(users.email, input.email))
          .limit(1);

        if (existingUser.length > 0) {
          const existingMember = await db
            .select()
            .from(workspaceMembers)
            .where(
              and(
                eq(workspaceMembers.workspaceId, input.workspaceId),
                eq(workspaceMembers.userId, existingUser[0].id)
              )
            )
            .limit(1);

          if (existingMember.length > 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "User is already a member of this workspace",
            });
          }
        }

        // Check if invitation already exists and is not expired
        const existingInvite = await db
          .select()
          .from(workspaceInvitations)
          .where(
            and(
              eq(workspaceInvitations.workspaceId, input.workspaceId),
              eq(workspaceInvitations.email, input.email)
            )
          )
          .limit(1);

        if (existingInvite.length > 0 && !existingInvite[0].acceptedAt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invitation already sent to this email",
          });
        }

        // Create invitation
        const token = generateInvitationToken();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        const newInvitation: InsertWorkspaceInvitation = {
          workspaceId: input.workspaceId,
          email: input.email,
          role: input.role,
          token,
          invitedBy: ctx.user.id,
          expiresAt,
        };

        const result = await db
          .insert(workspaceInvitations)
          .values(newInvitation);

        return {
          id: result[0],
          email: input.email,
          role: input.role,
          token,
          expiresAt,
          createdAt: new Date(),
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("[WorkspaceMember] Invite error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send invitation",
        });
      }
    }),

  /**
   * Accept a workspace invitation
   * User must be logged in and have a valid token
   */
  acceptInvitation: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      try {
        // Find invitation
        const invitation = await db
          .select()
          .from(workspaceInvitations)
          .where(eq(workspaceInvitations.token, input.token))
          .limit(1);

        if (invitation.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Invitation not found",
          });
        }

        const inv = invitation[0];

        // Check if invitation is expired
        if (inv.expiresAt < new Date()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invitation has expired",
          });
        }

        // Check if invitation is already accepted
        if (inv.acceptedAt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invitation has already been accepted",
          });
        }

        // Check if email matches current user
        if (ctx.user.email !== inv.email) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Invitation is for a different email address",
          });
        }

        // Add user to workspace
        const newMember: InsertWorkspaceMember = {
          workspaceId: inv.workspaceId,
          userId: ctx.user.id,
          role: inv.role,
          invitedBy: inv.invitedBy,
          status: "active",
        };

        await db.insert(workspaceMembers).values(newMember);

        // Mark invitation as accepted
        await db
          .update(workspaceInvitations)
          .set({ acceptedAt: new Date() })
          .where(eq(workspaceInvitations.id, inv.id));

        // Get workspace details
        const workspace = await db
          .select()
          .from(workspaces)
          .where(eq(workspaces.id, inv.workspaceId))
          .limit(1);

        return {
          success: true,
          workspace: workspace[0],
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("[WorkspaceMember] Accept invitation error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to accept invitation",
        });
      }
    }),

  /**
   * Remove a member from workspace
   * Only workspace owner can remove members
   */
  removeMember: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number(),
        userId: z.number(),
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
        // Check if requester is owner
        const requesterMembership = await db
          .select()
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, input.workspaceId),
              eq(workspaceMembers.userId, ctx.user.id),
              eq(workspaceMembers.role, "owner")
            )
          )
          .limit(1);

        if (requesterMembership.length === 0) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only workspace owner can remove members",
          });
        }

        // Cannot remove owner
        const targetMembership = await db
          .select()
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, input.workspaceId),
              eq(workspaceMembers.userId, input.userId)
            )
          )
          .limit(1);

        if (
          targetMembership.length === 0 ||
          targetMembership[0].role === "owner"
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot remove workspace owner",
          });
        }

        // Remove member
        await db
          .update(workspaceMembers)
          .set({ status: "inactive" })
          .where(
            and(
              eq(workspaceMembers.workspaceId, input.workspaceId),
              eq(workspaceMembers.userId, input.userId)
            )
          );

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("[WorkspaceMember] Remove member error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to remove member",
        });
      }
    }),

  /**
   * Update member role
   * Only workspace owner can update roles
   */
  updateRole: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number(),
        userId: z.number(),
        role: z.enum(["owner", "manager", "member"]),
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
        // Check if requester is owner
        const requesterMembership = await db
          .select()
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, input.workspaceId),
              eq(workspaceMembers.userId, ctx.user.id),
              eq(workspaceMembers.role, "owner")
            )
          )
          .limit(1);

        if (requesterMembership.length === 0) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only workspace owner can update roles",
          });
        }

        // Cannot change owner role
        if (input.role === "owner") {
          const targetMembership = await db
            .select()
            .from(workspaceMembers)
            .where(
              and(
                eq(workspaceMembers.workspaceId, input.workspaceId),
                eq(workspaceMembers.userId, input.userId)
              )
            )
            .limit(1);

          if (targetMembership.length === 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "User is not a member of this workspace",
            });
          }

          if (targetMembership[0].role === "owner") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Cannot change owner role",
            });
          }
        }

        // Update role
        await db
          .update(workspaceMembers)
          .set({ role: input.role })
          .where(
            and(
              eq(workspaceMembers.workspaceId, input.workspaceId),
              eq(workspaceMembers.userId, input.userId)
            )
          );

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("[WorkspaceMember] Update role error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update member role",
        });
      }
    }),

  /**
   * Get pending invitations for a workspace
   * Only workspace owner/manager can view
   */
  getPendingInvitations: protectedProcedure
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
        // Check if user has permission
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

        if (
          membership.length === 0 ||
          (membership[0].role !== "owner" && membership[0].role !== "manager")
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only workspace owner/manager can view invitations",
          });
        }

        // Get pending invitations
        const invitations = await db
          .select()
          .from(workspaceInvitations)
          .where(
            and(
              eq(workspaceInvitations.workspaceId, input.workspaceId),
              eq(workspaceInvitations.acceptedAt, null)
            )
          );

        return invitations;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("[WorkspaceMember] Get pending invitations error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get pending invitations",
        });
      }
    }),

  /**
   * Cancel a pending invitation
   * Only workspace owner/manager can cancel
   */
  cancelInvitation: protectedProcedure
    .input(z.object({ invitationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      try {
        // Get invitation
        const invitation = await db
          .select()
          .from(workspaceInvitations)
          .where(eq(workspaceInvitations.id, input.invitationId))
          .limit(1);

        if (invitation.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Invitation not found",
          });
        }

        // Check if user has permission
        const membership = await db
          .select()
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, invitation[0].workspaceId),
              eq(workspaceMembers.userId, ctx.user.id)
            )
          )
          .limit(1);

        if (
          membership.length === 0 ||
          (membership[0].role !== "owner" && membership[0].role !== "manager")
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only workspace owner/manager can cancel invitations",
          });
        }

        // Delete invitation
        await db
          .delete(workspaceInvitations)
          .where(eq(workspaceInvitations.id, input.invitationId));

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("[WorkspaceMember] Cancel invitation error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to cancel invitation",
        });
      }
    }),
});
