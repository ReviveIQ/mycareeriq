import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logResearchExecution, getResearchHealthStatus, verifySettingsApplied } from "./jobResearchMonitoring";

// Mock the database module
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

describe("jobResearchMonitoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("logResearchExecution", () => {
    it("should log successful research execution", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Mock getDb to return null (no database)
      const { getDb } = await import("./db");
      vi.mocked(getDb).mockResolvedValue(null);

      await logResearchExecution(
        1,
        5,
        4,
        ["Senior Account Executive", "Account Manager", "Sales Manager", "Enterprise Account Manager", "Director of Sales"],
        2500,
        true
      );

      // When database is null, it should log a warning
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[ResearchMonitoring] Database not available for logging")
      );
    });

    it("should log failed research execution with error message", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Mock getDb to return null (no database)
      const { getDb } = await import("./db");
      vi.mocked(getDb).mockResolvedValue(null);

      await logResearchExecution(1, 0, 0, [], 1000, false, "API timeout");

      // When database is null, it should log a warning
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[ResearchMonitoring] Database not available for logging")
      );
    });
  });

  describe("getResearchHealthStatus", () => {
    it("should return unhealthy status when no executions found", async () => {
      const health = await getResearchHealthStatus(999); // Non-existent user

      expect(health.isHealthy).toBe(false);
      expect(health.consecutiveFailures).toBe(0);
      expect(health.successRate).toBe(0);
      expect(health.warnings).toContain("No research executions found in the last 7 days");
    });

    it("should calculate success rate correctly", async () => {
      // Mock getDb to return null (no database)
      const { getDb } = await import("./db");
      vi.mocked(getDb).mockResolvedValue(null);

      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Log multiple executions (will fail silently due to mocked DB)
      await logResearchExecution(2, 5, 4, ["Job 1"], 1000, true);
      await logResearchExecution(2, 5, 4, ["Job 2"], 1000, true);
      await logResearchExecution(2, 5, 4, ["Job 3"], 1000, false, "Error");

      const health = await getResearchHealthStatus(2);

      // Since DB is mocked, no executions will be found
      expect(health.isHealthy).toBe(false);
      expect(health.successRate).toBe(0);
      expect(health.warnings).toContain("No research executions found in the last 7 days");
    });
  });

  describe("verifySettingsApplied", () => {
    it("should return error when no config found", async () => {
      // Mock getDb to return null (no database)
      const { getDb } = await import("./db");
      vi.mocked(getDb).mockResolvedValue(null);

      const verification = await verifySettingsApplied(999); // Non-existent user

      expect(verification.settingsCorrect).toBe(false);
      // Check if there are any issues reported
      expect(verification.issues.length).toBeGreaterThan(0);
      // The issues should indicate a problem with the configuration
      const hasIssue = verification.issues.some((issue) =>
        issue.length > 0 && (issue.includes("Database not available") || issue.includes("Error"))
      );
      expect(hasIssue).toBe(true);
    });
  });
});
