import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";

// Mock the dependencies
vi.mock("./db");
vi.mock("./applicationGenerator");
vi.mock("./emailService");
vi.mock("./pdfGenerator");
vi.mock("./storage");

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId: number = 1): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };

  return ctx;
}

describe("applicationRouter.generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate and save a new application draft", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Mock generateApplicationDocuments
    const { generateApplicationDocuments } = await import(
      "./applicationGenerator"
    );
    vi.mocked(generateApplicationDocuments).mockResolvedValue({
      coverLetter: "Dear John, We are excited to offer you...",
      tailoredResume: "John Doe\nAccount Manager\nExperience...",
    });

    // Mock the database
    const mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 1,
                  userId: ctx.user.id,
                  companyId: "company-1",
                  companyName: "Test Company",
                  contactName: "John Doe",
                  contactEmail: "john@example.com",
                  jobTitle: "Account Manager",
                  coverLetter: "Dear John...",
                  tailoredResume: "Resume content...",
                  status: "draft",
                  createdAt: new Date(),
                },
              ]),
            }),
          }),
        }),
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const result = await caller.application.generate({
      companyName: "Test Company",
      jobTitle: "Account Manager",
      jobDescription: "Looking for an experienced account manager...",
      contactName: "John Doe",
      contactEmail: "john@example.com",
      companyId: "company-1",
    });

    expect(result.success).toBe(true);
    expect(result.applicationId).toBe(1);
    expect(result.coverLetter).toBeDefined();
    expect(result.tailoredResume).toBeDefined();
  });

  it("should throw error if database is not available", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Mock generateApplicationDocuments
    const { generateApplicationDocuments } = await import(
      "./applicationGenerator"
    );
    vi.mocked(generateApplicationDocuments).mockResolvedValue({
      coverLetter: "Dear John, We are excited to offer you...",
      tailoredResume: "John Doe\nAccount Manager\nExperience...",
    });

    vi.mocked(getDb).mockResolvedValue(null);

    await expect(
      caller.application.generate({
        companyName: "Test Company",
        jobTitle: "Account Manager",
        jobDescription: "Looking for an experienced account manager...",
        contactName: "John Doe",
        contactEmail: "john@example.com",
        companyId: "company-1",
      })
    ).rejects.toThrow("Database not available");
  });

  it("should handle optional contactEmail parameter", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Mock generateApplicationDocuments
    const { generateApplicationDocuments } = await import(
      "./applicationGenerator"
    );
    vi.mocked(generateApplicationDocuments).mockResolvedValue({
      coverLetter: "Dear Jane, We are excited to offer you...",
      tailoredResume: "Jane Doe\nSales Executive\nExperience...",
    });

    const mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 2,
                  userId: ctx.user.id,
                  companyId: "company-2",
                  companyName: "Another Company",
                  contactName: "Jane Doe",
                  contactEmail: "",
                  jobTitle: "Sales Executive",
                  coverLetter: "Dear Jane...",
                  tailoredResume: "Resume...",
                  status: "draft",
                  createdAt: new Date(),
                },
              ]),
            }),
          }),
        }),
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const result = await caller.application.generate({
      companyName: "Another Company",
      jobTitle: "Sales Executive",
      jobDescription: "Sales role...",
      contactName: "Jane Doe",
      companyId: "company-2",
    });

    expect(result.success).toBe(true);
    expect(result.applicationId).toBe(2);
  });
});

describe("applicationRouter.getDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should retrieve a draft application by ID", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const mockApplication = {
      id: 1,
      userId: ctx.user.id,
      companyId: "company-1",
      companyName: "Test Company",
      contactName: "John Doe",
      contactEmail: "john@example.com",
      jobTitle: "Account Manager",
      coverLetter: "Dear John...",
      tailoredResume: "Resume content...",
      status: "draft",
      createdAt: new Date(),
    };

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockApplication]),
          }),
        }),
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const result = await caller.application.getDraft({ applicationId: 1 });

    expect(result).toEqual(mockApplication);
  });

  it("should return null if application not found", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const result = await caller.application.getDraft({ applicationId: 999 });

    expect(result).toBeNull();
  });
});

describe("applicationRouter.list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should list all applications for the user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const mockApplications = [
      {
        id: 1,
        userId: ctx.user.id,
        companyId: "company-1",
        companyName: "Test Company",
        contactName: "John Doe",
        contactEmail: "john@example.com",
        jobTitle: "Account Manager",
        coverLetter: "Dear John...",
        tailoredResume: "Resume...",
        status: "sent",
        createdAt: new Date(),
      },
      {
        id: 2,
        userId: ctx.user.id,
        companyId: "company-2",
        companyName: "Another Company",
        contactName: "Jane Doe",
        contactEmail: "jane@example.com",
        jobTitle: "Sales Executive",
        coverLetter: "Dear Jane...",
        tailoredResume: "Resume...",
        status: "draft",
        createdAt: new Date(),
      },
    ];

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockApplications),
        }),
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const result = await caller.application.list();

    expect(result).toHaveLength(2);
    expect(result[0]?.companyName).toBe("Test Company");
    expect(result[1]?.companyName).toBe("Another Company");
  });

  it("should return empty array if user has no applications", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const result = await caller.application.list();

    expect(result).toHaveLength(0);
  });

  it("should throw error if database is not available", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    vi.mocked(getDb).mockResolvedValue(null);

    await expect(caller.application.list()).rejects.toThrow(
      "Database not available"
    );
  });
});

describe("applicationRouter.send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should send application immediately with email", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Mock dependencies
    const { generateCoverLetterPDF } = await import("./pdfGenerator");
    const { generateResumePDF } = await import("./pdfGenerator");
    const { sendApplicationEmail } = await import("./emailService");
    const { storagePut } = await import("./storage");

    vi.mocked(generateCoverLetterPDF).mockResolvedValue(Buffer.from("PDF"));
    vi.mocked(generateResumePDF).mockResolvedValue(Buffer.from("PDF"));
    vi.mocked(storagePut)
      .mockResolvedValueOnce({
        key: "applications/1/cover-letter.pdf",
        url: "/manus-storage/applications/1/cover-letter.pdf",
      })
      .mockResolvedValueOnce({
        key: "applications/1/resume.pdf",
        url: "/manus-storage/applications/1/resume.pdf",
      });
    vi.mocked(sendApplicationEmail).mockResolvedValue({
      hiringManagerMessageId: "msg-1",
      userCopyMessageId: "msg-2",
    });

    const mockApplication = {
      id: 1,
      userId: ctx.user.id,
      companyId: "company-1",
      companyName: "Test Company",
      contactName: "John Doe",
      contactEmail: "john@example.com",
      jobTitle: "Account Manager",
      coverLetter: "Dear John...",
      tailoredResume: "Resume...",
      status: "draft",
      createdAt: new Date(),
    };

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockApplication]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const result = await caller.application.send({
      applicationId: 1,
      sendImmediately: true,
      hiringManagerEmail: "john@example.com",
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain("sent successfully");
    expect(result.hiringManagerMessageId).toBe("msg-1");
    expect(result.userCopyMessageId).toBe("msg-2");
  });

  it("should schedule application for later", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const mockApplication = {
      id: 1,
      userId: ctx.user.id,
      companyId: "company-1",
      companyName: "Test Company",
      contactName: "John Doe",
      contactEmail: "john@example.com",
      jobTitle: "Account Manager",
      coverLetter: "Dear John...",
      tailoredResume: "Resume...",
      status: "draft",
      createdAt: new Date(),
    };

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockApplication]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const scheduledTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const result = await caller.application.send({
      applicationId: 1,
      sendImmediately: false,
      scheduledTime,
      hiringManagerEmail: "john@example.com",
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain("scheduled");
  });

  it("should throw error if application not found", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    await expect(
      caller.application.send({
        applicationId: 999,
        sendImmediately: true,
        hiringManagerEmail: "john@example.com",
      })
    ).rejects.toThrow("Application not found");
  });

  it("should throw error if neither immediate send nor scheduled time provided", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const mockApplication = {
      id: 1,
      userId: ctx.user.id,
      companyId: "company-1",
      companyName: "Test Company",
      contactName: "John Doe",
      contactEmail: "john@example.com",
      jobTitle: "Account Manager",
      coverLetter: "Dear John...",
      tailoredResume: "Resume...",
      status: "draft",
      createdAt: new Date(),
    };

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockApplication]),
          }),
        }),
      }),
    };

    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    await expect(
      caller.application.send({
        applicationId: 1,
        sendImmediately: false,
        hiringManagerEmail: "john@example.com",
      })
    ).rejects.toThrow("Must either send immediately or provide a scheduled time");
  });
});
