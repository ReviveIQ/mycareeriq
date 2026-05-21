import { describe, it, expect, vi, beforeEach } from "vitest";
import { runDailyJobResearch } from "./jobResearchCron";
import * as jobResearchService from "./jobResearchService";
import * as notification from "./_core/notification";

// Mock the dependencies
vi.mock("./jobResearchService");
vi.mock("./_core/notification");

describe("jobResearchCron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("runDailyJobResearch", () => {
    it("should research jobs, add them to pipeline, and send morning notification", async () => {
      const mockJobs = [
        {
          companyName: "Gong",
          companyId: "gong",
          jobTitle: "Enterprise Account Manager",
          category: "Revenue Intelligence",
          contactName: "Amelia Howard",
          contactEmail: "amelia.howard@gong.io",
          linkedinUrl: "https://linkedin.com/in/ameliahoward",
          jobDescription: "Lead enterprise sales for Gong",
          salary: "$200K-$250K OTE",
          remote: true,
          priority: "High",
        },
        {
          companyName: "Outreach",
          companyId: "outreach",
          jobTitle: "Account Executive",
          category: "Sales Enablement",
          contactName: "John Smith",
          contactEmail: "john.smith@outreach.io",
          linkedinUrl: "https://linkedin.com/in/johnsmith",
          jobDescription: "Sell Outreach to enterprise customers",
          salary: "$150K-$200K OTE",
          remote: true,
          priority: "High",
        },
      ];

      vi.mocked(jobResearchService.researchNewJobs).mockResolvedValue(mockJobs);
      vi.mocked(jobResearchService.addJobsToPipeline).mockResolvedValue(2);
      vi.mocked(notification.notifyOwner).mockResolvedValue(true);

      const result = await runDailyJobResearch();

      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(2);
      expect(result.notificationSent).toBe(true);

      // Verify notification was called with morning update
      expect(notification.notifyOwner).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining("Morning Job Search Update"),
          content: expect.stringContaining("NEW JOBS RESEARCHED"),
        })
      );

      // Verify notification includes pipeline digest
      const notificationCall = vi.mocked(notification.notifyOwner).mock.calls[0][0];
      expect(notificationCall.content).toContain("PIPELINE UPDATE");
      expect(notificationCall.content).toContain("High priority");
      expect(notificationCall.content).toContain("Remote opportunities");
      expect(notificationCall.content).toContain("dashboard");
    });

    it("should include top 5 job opportunities in notification", async () => {
      const mockJobs = Array.from({ length: 10 }, (_, i) => ({
        companyName: `Company ${i}`,
        companyId: `company-${i}`,
        jobTitle: `Role ${i}`,
        category: "Sales",
        contactName: `Contact ${i}`,
        contactEmail: `contact${i}@company.com`,
        linkedinUrl: `https://linkedin.com/in/contact${i}`,
        jobDescription: `Description ${i}`,
        salary: "$100K-$150K OTE",
        remote: true,
        priority: "High" as const,
      }));

      vi.mocked(jobResearchService.researchNewJobs).mockResolvedValue(mockJobs);
      vi.mocked(jobResearchService.addJobsToPipeline).mockResolvedValue(10);
      vi.mocked(notification.notifyOwner).mockResolvedValue(true);

      await runDailyJobResearch();

      const notificationCall = vi.mocked(notification.notifyOwner).mock.calls[0][0];
      const content = notificationCall.content;

      // Verify top 5 are included
      expect(content).toContain("Company 0");
      expect(content).toContain("Company 4");
      // Verify 6th is not included
      expect(content).not.toContain("Company 5");
    });

    it("should handle errors and notify owner of failure", async () => {
      const error = new Error("LLM API failed");
      vi.mocked(jobResearchService.researchNewJobs).mockRejectedValue(error);
      vi.mocked(notification.notifyOwner).mockResolvedValue(true);

      await expect(runDailyJobResearch()).rejects.toThrow("LLM API failed");

      // Verify failure notification was sent
      expect(notification.notifyOwner).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining("Daily Job Research Failed"),
          content: expect.stringContaining("LLM API failed"),
        })
      );
    });

    it("should handle pipeline addition errors gracefully", async () => {
      const mockJobs = [
        {
          companyName: "Gong",
          companyId: "gong",
          jobTitle: "Enterprise Account Manager",
          category: "Revenue Intelligence",
          contactName: "Amelia Howard",
          contactEmail: "amelia.howard@gong.io",
          linkedinUrl: "https://linkedin.com/in/ameliahoward",
          jobDescription: "Lead enterprise sales for Gong",
          salary: "$200K-$250K OTE",
          remote: true,
          priority: "High",
        },
      ];

      vi.mocked(jobResearchService.researchNewJobs).mockResolvedValue(mockJobs);
      vi.mocked(jobResearchService.addJobsToPipeline).mockRejectedValue(
        new Error("Database error")
      );
      vi.mocked(notification.notifyOwner).mockResolvedValue(true);

      await expect(runDailyJobResearch()).rejects.toThrow("Database error");

      // Verify failure notification was sent
      expect(notification.notifyOwner).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining("Daily Job Research Failed"),
        })
      );
    });

    it("should consolidate job research and pipeline digest into single morning notification", async () => {
      const mockJobs = [
        {
          companyName: "Gong",
          companyId: "gong",
          jobTitle: "Enterprise Account Manager",
          category: "Revenue Intelligence",
          contactName: "Amelia Howard",
          contactEmail: "amelia.howard@gong.io",
          linkedinUrl: "https://linkedin.com/in/ameliahoward",
          jobDescription: "Lead enterprise sales for Gong",
          salary: "$200K-$250K OTE",
          remote: true,
          priority: "High",
        },
      ];

      vi.mocked(jobResearchService.researchNewJobs).mockResolvedValue(mockJobs);
      vi.mocked(jobResearchService.addJobsToPipeline).mockResolvedValue(1);
      vi.mocked(notification.notifyOwner).mockResolvedValue(true);

      await runDailyJobResearch();

      // Verify only ONE notification was sent (not separate job research + digest)
      expect(notification.notifyOwner).toHaveBeenCalledTimes(1);

      const notificationCall = vi.mocked(notification.notifyOwner).mock.calls[0][0];
      const content = notificationCall.content;

      // Verify both sections are in ONE notification
      expect(content).toContain("NEW JOBS RESEARCHED");
      expect(content).toContain("PIPELINE UPDATE");
      expect(content).toContain("High priority roles");
    });
  });
});
