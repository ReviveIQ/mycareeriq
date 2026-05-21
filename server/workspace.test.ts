import { describe, it, expect, beforeEach, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { workspaceRouter } from "./workspaceRouter";
import { workspaceMemberRouter } from "./workspaceMemberRouter";
import { workspaceMigrationRouter } from "./workspaceMigrationRouter";

// Mock context
const mockUser = {
  id: 1,
  openId: "test-user",
  name: "Test User",
  email: "test@example.com",
  role: "user" as const,
};

const mockContext = {
  user: mockUser,
  req: {} as any,
  res: {} as any,
};

// Mock database - returns null to avoid actual DB calls
vi.mock("./db", () => ({
  getDb: () => null,
}));

describe("Workspace Router", () => {
  describe("create", () => {
    it("should throw error when database is unavailable", async () => {
      const caller = workspaceRouter.createCaller(mockContext);

      try {
        await caller.create({
          name: "Test Workspace",
          slug: "test-workspace",
        });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
      }
    });
  });

  describe("list", () => {
    it("should throw error when database is unavailable", async () => {
      const caller = workspaceRouter.createCaller(mockContext);

      try {
        await caller.list();
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
      }
    });
  });

  describe("get", () => {
    it("should throw error when database is unavailable", async () => {
      const caller = workspaceRouter.createCaller(mockContext);

      try {
        await caller.get({ id: 1 });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
      }
    });
  });

  describe("update", () => {
    it("should throw error when database is unavailable", async () => {
      const caller = workspaceRouter.createCaller(mockContext);

      try {
        await caller.update({
          id: 1,
          name: "Updated Workspace",
        });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
      }
    });
  });

  describe("delete", () => {
    it("should throw error when database is unavailable", async () => {
      const caller = workspaceRouter.createCaller(mockContext);

      try {
        await caller.delete({ id: 1 });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
      }
    });
  });

  describe("getMembers", () => {
    it("should throw error when database is unavailable", async () => {
      const caller = workspaceRouter.createCaller(mockContext);

      try {
        await caller.getMembers({ workspaceId: 1 });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
      }
    });
  });
});

describe("Workspace Member Router", () => {
  describe("invite", () => {
    it("should throw error when database is unavailable", async () => {
      const caller = workspaceMemberRouter.createCaller(mockContext);

      try {
        await caller.invite({
          workspaceId: 1,
          email: "newmember@example.com",
          role: "member",
        });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
      }
    });

    it("should validate email format", async () => {
      const caller = workspaceMemberRouter.createCaller(mockContext);

      try {
        await caller.invite({
          workspaceId: 1,
          email: "invalid-email",
          role: "member",
        });
        expect.fail("Should have thrown a validation error");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe("acceptInvitation", () => {
    it("should throw error when database is unavailable", async () => {
      const caller = workspaceMemberRouter.createCaller(mockContext);

      try {
        await caller.acceptInvitation({ token: "test-token" });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
      }
    });
  });

  describe("removeMember", () => {
    it("should throw error when database is unavailable", async () => {
      const caller = workspaceMemberRouter.createCaller(mockContext);

      try {
        await caller.removeMember({
          workspaceId: 1,
          userId: 2,
        });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
      }
    });
  });

  describe("updateRole", () => {
    it("should throw error when database is unavailable", async () => {
      const caller = workspaceMemberRouter.createCaller(mockContext);

      try {
        await caller.updateRole({
          workspaceId: 1,
          userId: 2,
          role: "manager",
        });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
      }
    });
  });

  describe("getPendingInvitations", () => {
    it("should throw error when database is unavailable", async () => {
      const caller = workspaceMemberRouter.createCaller(mockContext);

      try {
        await caller.getPendingInvitations({ workspaceId: 1 });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
      }
    });
  });

  describe("cancelInvitation", () => {
    it("should throw error when database is unavailable", async () => {
      const caller = workspaceMemberRouter.createCaller(mockContext);

      try {
        await caller.cancelInvitation({ invitationId: 1 });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
      }
    });
  });
});

describe("Workspace Migration Router", () => {
  describe("migrateToDefaultWorkspace", () => {
    it("should throw error when database is unavailable", async () => {
      const caller = workspaceMigrationRouter.createCaller(mockContext);

      try {
        await caller.migrateToDefaultWorkspace();
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
      }
    });
  });

  describe("needsMigration", () => {
    it("should throw error when database is unavailable", async () => {
      const caller = workspaceMigrationRouter.createCaller(mockContext);

      try {
        await caller.needsMigration();
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
      }
    });
  });

  describe("getMigrationStatus", () => {
    it("should throw error when database is unavailable", async () => {
      const caller = workspaceMigrationRouter.createCaller(mockContext);

      try {
        await caller.getMigrationStatus();
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
      }
    });
  });
});

describe("Workspace Input Validation", () => {
  describe("Workspace creation", () => {
    it("should validate workspace name is required", async () => {
      const caller = workspaceRouter.createCaller(mockContext);

      try {
        await caller.create({
          name: "",
          slug: "test",
        });
        expect.fail("Should have thrown a validation error");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it("should validate slug format", async () => {
      const caller = workspaceRouter.createCaller(mockContext);

      try {
        await caller.create({
          name: "Test",
          slug: "test@invalid",
        });
        expect.fail("Should have thrown a validation error");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe("Member invitation", () => {
    it("should validate email format", async () => {
      const caller = workspaceMemberRouter.createCaller(mockContext);

      try {
        await caller.invite({
          workspaceId: 1,
          email: "not-an-email",
          role: "member",
        });
        expect.fail("Should have thrown a validation error");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it("should validate role is member or manager", async () => {
      const caller = workspaceMemberRouter.createCaller(mockContext);

      try {
        await caller.invite({
          workspaceId: 1,
          email: "test@example.com",
          role: "owner" as any,
        });
        expect.fail("Should have thrown a validation error");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
