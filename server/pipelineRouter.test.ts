import { describe, it, expect, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      headers: new Map(),
      method: "POST",
      url: "http://localhost:3000/api/trpc",
    },
    res: {
      setHeader: () => {},
    },
  };

  return ctx;
}

describe("pipelineRouter", () => {
  let ctx: TrpcContext;
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    ctx = createAuthContext();
    caller = appRouter.createCaller(ctx);
  });

  describe("getCompanies", () => {
    it("should return array of companies", async () => {
      const result = await caller.pipeline.getCompanies();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it("should return companies in correct format", async () => {
      const result = await caller.pipeline.getCompanies();
      if (result.length > 0) {
        const company = result[0];
        expect(company).toHaveProperty("id");
        expect(company).toHaveProperty("name");
        expect(company).toHaveProperty("category");
        expect(company).toHaveProperty("role");
        expect(company).toHaveProperty("stage");
        expect(company).toHaveProperty("priority");
        expect(company).toHaveProperty("remoteOk");
      }
    });
  });

  describe("getCompanyCount", () => {
    it("should return a number", async () => {
      const result = await caller.pipeline.getCompanyCount();
      expect(typeof result).toBe("number");
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it("should match getCompanies array length", async () => {
      const companies = await caller.pipeline.getCompanies();
      const count = await caller.pipeline.getCompanyCount();
      expect(count).toBe(companies.length);
    });
  });

  describe("getHighPriority", () => {
    it("should return a number", async () => {
      const result = await caller.pipeline.getHighPriority();
      expect(typeof result).toBe("number");
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it("should not exceed total company count", async () => {
      const highPriority = await caller.pipeline.getHighPriority();
      const total = await caller.pipeline.getCompanyCount();
      expect(highPriority).toBeLessThanOrEqual(total);
    });
  });

  describe("getRemoteCount", () => {
    it("should return a number", async () => {
      const result = await caller.pipeline.getRemoteCount();
      expect(typeof result).toBe("number");
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it("should not exceed total company count", async () => {
      const remoteCount = await caller.pipeline.getRemoteCount();
      const total = await caller.pipeline.getCompanyCount();
      expect(remoteCount).toBeLessThanOrEqual(total);
    });
  });
});
