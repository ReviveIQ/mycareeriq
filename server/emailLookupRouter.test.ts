import { describe, it, expect, vi, beforeEach } from "vitest";
import { emailLookupRouter } from "./emailLookupRouter";
import * as hunterService from "./hunterService";

// Mock the Hunter service
vi.mock("./hunterService");

describe("emailLookupRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("searchEmails", () => {
    it("should search for emails successfully", async () => {
      const mockEmails = [
        {
          email: "amelia.howard@gong.io",
          score: 95,
          type: "professional" as const,
          position: "Director of Sales",
          linkedin_url: "https://linkedin.com/in/ameliahoward",
          phone_number: "+1-555-0123",
          sources: [
            {
              domain: "gong.io",
              uri: "https://gong.io/team",
              extracted_on: "2026-05-18",
            },
          ],
        },
      ];

      vi.mocked(hunterService.searchEmailsWithHunter).mockResolvedValue(mockEmails);
      vi.mocked(hunterService.extractDomain).mockReturnValue("gong.io");

      const caller = emailLookupRouter.createCaller({
        user: { id: 1, openId: "test", name: "Test", email: "test@example.com", role: "user" },
      } as any);

      const result = await caller.searchEmails({
        firstName: "Amelia",
        lastName: "Howard",
        company: "Gong",
      });

      expect(result.success).toBe(true);
      expect(result.emails).toHaveLength(1);
      expect(result.emails[0].email).toBe("amelia.howard@gong.io");
      expect(result.emails[0].score).toBe(95);
      expect(result.domain).toBe("gong.io");
    });

    it("should handle search errors gracefully", async () => {
      vi.mocked(hunterService.searchEmailsWithHunter).mockRejectedValue(
        new Error("API rate limit exceeded")
      );
      vi.mocked(hunterService.extractDomain).mockReturnValue("gong.io");

      const caller = emailLookupRouter.createCaller({
        user: { id: 1, openId: "test", name: "Test", email: "test@example.com", role: "user" },
      } as any);

      const result = await caller.searchEmails({
        firstName: "Amelia",
        lastName: "Howard",
        company: "Gong",
      });

      expect(result.success).toBe(false);
      expect(result.emails).toHaveLength(0);
      expect(result.error).toContain("rate limit");
    });

    it("should return empty results when no emails found", async () => {
      vi.mocked(hunterService.searchEmailsWithHunter).mockResolvedValue([]);
      vi.mocked(hunterService.extractDomain).mockReturnValue("gong.io");

      const caller = emailLookupRouter.createCaller({
        user: { id: 1, openId: "test", name: "Test", email: "test@example.com", role: "user" },
      } as any);

      const result = await caller.searchEmails({
        firstName: "Amelia",
        lastName: "Howard",
        company: "Gong",
      });

      expect(result.success).toBe(true);
      expect(result.emails).toHaveLength(0);
      expect(result.count).toBe(0);
    });
  });

  describe("getSuggestedEmails", () => {
    it("should return top suggested emails with confidence levels", async () => {
      const mockEmails = [
        {
          email: "amelia.howard@gong.io",
          score: 95,
          type: "professional" as const,
          position: "Director of Sales",
          linkedin_url: "https://linkedin.com/in/ameliahoward",
          phone_number: "+1-555-0123",
          sources: [],
        },
        {
          email: "a.howard@gong.io",
          score: 65,
          type: "generic" as const,
          position: undefined,
          linkedin_url: undefined,
          phone_number: undefined,
          sources: [],
        },
      ];

      vi.mocked(hunterService.searchEmailsWithHunter).mockResolvedValue(mockEmails);
      vi.mocked(hunterService.extractDomain).mockReturnValue("gong.io");

      const caller = emailLookupRouter.createCaller({
        user: { id: 1, openId: "test", name: "Test", email: "test@example.com", role: "user" },
      } as any);

      const result = await caller.getSuggestedEmails({
        firstName: "Amelia",
        lastName: "Howard",
        company: "Gong",
        limit: 2,
      });

      expect(result.success).toBe(true);
      expect(result.suggested).toHaveLength(2);
      expect(result.suggested[0].email).toBe("amelia.howard@gong.io");
      expect(result.suggested[0].confidence).toBe("high");
      expect(result.suggested[1].confidence).toBe("medium");
      expect(result.total).toBe(2);
    });

    it("should respect limit parameter", async () => {
      const mockEmails = Array.from({ length: 10 }, (_, i) => ({
        email: `email${i}@gong.io`,
        score: 90 - i * 5,
        type: "professional" as const,
        position: "Sales",
        linkedin_url: undefined,
        phone_number: undefined,
        sources: [],
      }));

      vi.mocked(hunterService.searchEmailsWithHunter).mockResolvedValue(mockEmails);
      vi.mocked(hunterService.extractDomain).mockReturnValue("gong.io");

      const caller = emailLookupRouter.createCaller({
        user: { id: 1, openId: "test", name: "Test", email: "test@example.com", role: "user" },
      } as any);

      const result = await caller.getSuggestedEmails({
        firstName: "Amelia",
        lastName: "Howard",
        company: "Gong",
        limit: 3,
      });

      expect(result.suggested).toHaveLength(3);
      expect(result.total).toBe(10);
    });

    it("should handle errors and return empty suggestions", async () => {
      vi.mocked(hunterService.searchEmailsWithHunter).mockRejectedValue(
        new Error("Network error")
      );
      vi.mocked(hunterService.extractDomain).mockReturnValue("gong.io");

      const caller = emailLookupRouter.createCaller({
        user: { id: 1, openId: "test", name: "Test", email: "test@example.com", role: "user" },
      } as any);

      const result = await caller.getSuggestedEmails({
        firstName: "Amelia",
        lastName: "Howard",
        company: "Gong",
      });

      expect(result.success).toBe(false);
      expect(result.suggested).toHaveLength(0);
      expect(result.error).toContain("Network error");
    });
  });

  describe("verifyEmail", () => {
    it("should verify a valid email", async () => {
      vi.mocked(hunterService.verifyEmail).mockResolvedValue({
        status: "valid",
        score: 98,
        reason: "Email found in database",
      });

      const caller = emailLookupRouter.createCaller({
        user: { id: 1, openId: "test", name: "Test", email: "test@example.com", role: "user" },
      } as any);

      const result = await caller.verifyEmail({
        email: "amelia.howard@gong.io",
      });

      expect(result.success).toBe(true);
      expect(result.valid).toBe(true);
      expect(result.status).toBe("valid");
      expect(result.score).toBe(98);
    });

    it("should handle verification errors", async () => {
      vi.mocked(hunterService.verifyEmail).mockRejectedValue(new Error("API error"));

      const caller = emailLookupRouter.createCaller({
        user: { id: 1, openId: "test", name: "Test", email: "test@example.com", role: "user" },
      } as any);

      const result = await caller.verifyEmail({
        email: "amelia.howard@gong.io",
      });

      expect(result.success).toBe(false);
      expect(result.valid).toBeNull();
      expect(result.status).toBe("unknown");
      expect(result.score).toBe(0);
    });
  });
});
