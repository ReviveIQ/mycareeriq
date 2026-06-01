import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  getResearchMonitoringHistory,
  getResearchHealthStatus,
  verifySettingsApplied,
} from "./jobResearchMonitoring";
import { researchNewJobs, addJobsToPipeline } from "./jobResearchService";

export const monitoringRouter = router({
  /**
   * Get research monitoring history for the current user
   * @param days - Number of days to retrieve (default: 7)
   */
  getHistory: publicProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(7) }))
    .query(async ({ input }) => {
      const userId = 1; // In production, get from ctx.user
      const history = await getResearchMonitoringHistory(userId, input.days);
      return {
        userId,
        days: input.days,
        executionCount: history.length,
        history,
      };
    }),

  /**
   * Get health status of the job research service
   */
  getHealthStatus: publicProcedure.query(async () => {
    const userId = 1; // In production, get from ctx.user
    const health = await getResearchHealthStatus(userId);
    return {
      userId,
      ...health,
    };
  }),

  /**
   * Verify that research settings are being applied correctly
   */
  verifySettings: publicProcedure.query(async () => {
    const userId = 1; // In production, get from ctx.user
    const verification = await verifySettingsApplied(userId);
    return {
      userId,
      ...verification,
    };
  }),

  /**
   * Manually trigger job research (for testing/on-demand)
   */
  runNow: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;

    // ── Rate limiting check ────────────────────────────────────────────────
    const { getDb } = await import("./db");
    const { researchConfig } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const configs = await db.select().from(researchConfig).where(eq(researchConfig.userId, userId));
    const config = configs[0];

    const now = new Date();

    // Check 24-hour cooldown
    if (config?.lastRunAt) {
      const lastRun = new Date(config.lastRunAt);
      const hoursSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastRun < 12) {
        const hoursLeft = Math.ceil(12 - hoursSinceLastRun);
        return {
          success: false,
          jobsResearched: 0,
          jobsAdded: 0,
          executionTimeMs: 0,
          message: `Rate limited — next run available in ${hoursLeft} hour${hoursLeft === 1 ? "" : "s"}`,
          rateLimited: true,
          hoursUntilNextRun: hoursLeft,
        };
      }
    }

    // Check monthly run limit — reset counter if new month
    let runsThisMonth = config?.runsThisMonth || 0;
    const monthlyLimit = config?.monthlyRunLimit || 10;
    const resetAt = config?.monthlyRunsResetAt ? new Date(config.monthlyRunsResetAt) : null;

    if (!resetAt || now > resetAt) {
      // Reset monthly counter
      runsThisMonth = 0;
      const nextReset = new Date(now);
      nextReset.setMonth(nextReset.getMonth() + 1);
      await db.update(researchConfig)
        .set({ runsThisMonth: 0, monthlyRunsResetAt: nextReset })
        .where(eq(researchConfig.userId, userId));
    }

    if (runsThisMonth >= monthlyLimit) {
      const daysUntilReset = resetAt ? Math.ceil((resetAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 30;
      return {
        success: false,
        jobsResearched: 0,
        jobsAdded: 0,
        executionTimeMs: 0,
        message: `Monthly limit reached (${monthlyLimit} runs). Resets in ${daysUntilReset} day${daysUntilReset === 1 ? "" : "s"}.`,
        rateLimited: true,
        monthlyLimitReached: true,
        runsThisMonth,
        monthlyLimit,
      };
    }

    // ── Update timestamps before firing ────────────────────────────────────
    const nextReset = resetAt || (() => { const d = new Date(now); d.setMonth(d.getMonth() + 1); return d; })();
    await db.update(researchConfig)
      .set({
        lastRunAt: now,
        runsThisMonth: runsThisMonth + 1,
        monthlyRunsResetAt: nextReset,
      })
      .where(eq(researchConfig.userId, userId));

    console.log(`[MonitoringRouter] Run approved for user ${userId} — run ${runsThisMonth + 1}/${monthlyLimit} this month`);

    // ── Fire research in background ────────────────────────────────────────
    (async () => {
      try {
        console.log("[MonitoringRouter] Background job research started for user:", userId);
        const jobs = await researchNewJobs(undefined, userId);
        const addedCount = await addJobsToPipeline(jobs, userId);
        console.log(`[MonitoringRouter] Background research complete: ${addedCount} jobs added`);
      } catch (err) {
        console.error("[MonitoringRouter] Background research failed:", err);
      }
    })();

    return {
      success: true,
      jobsResearched: 0,
      jobsAdded: 0,
      executionTimeMs: 0,
      message: "Job research started — your pipeline will update in 20-30 seconds",
      runsThisMonth: runsThisMonth + 1,
      monthlyLimit,
      rateLimited: false,
    };
  }),

  // Get current rate limit status
  getRateLimitStatus: protectedProcedure.query(async ({ ctx }) => {
    const { getDb } = await import("./db");
    const { researchConfig } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");

    const db = await getDb();
    if (!db) return { runsThisMonth: 0, monthlyLimit: 10, hoursUntilNextRun: 0, canRunNow: true };

    const configs = await db.select().from(researchConfig).where(eq(researchConfig.userId, ctx.user.id));
    const config = configs[0];
    const now = new Date();

    let hoursUntilNextRun = 0;
    let canRunNow = true;

    if (config?.lastRunAt) {
      const hoursSince = (now.getTime() - new Date(config.lastRunAt).getTime()) / (1000 * 60 * 60);
      if (hoursSince < 12) {
        hoursUntilNextRun = Math.ceil(12 - hoursSince);
        canRunNow = false;
      }
    }

    const runsThisMonth = config?.runsThisMonth || 0;
    const monthlyLimit = config?.monthlyRunLimit || 10;

    if (runsThisMonth >= monthlyLimit) canRunNow = false;

    return {
      runsThisMonth,
      monthlyLimit,
      hoursUntilNextRun,
      canRunNow,
      lastRunAt: config?.lastRunAt || null,
      monthlyRunsResetAt: config?.monthlyRunsResetAt || null,
    };
  }),

  /**
   * Get monitoring dashboard data (combined view)
   */
  getDashboard: publicProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(7) }))
    .query(async ({ input }) => {
      const userId = 1; // In production, get from ctx.user
      const [history, health, verification] = await Promise.all([
        getResearchMonitoringHistory(userId, input.days),
        getResearchHealthStatus(userId),
        verifySettingsApplied(userId),
      ]);

      // Calculate statistics
      const successfulExecutions = history.filter((h) => h.success).length;
      const totalJobsAdded = history.reduce((sum, h) => sum + h.jobsAdded, 0);
      const averageJobsPerExecution = history.length > 0 ? totalJobsAdded / history.length : 0;
      const totalExecutionTime = history.reduce((sum, h) => sum + h.executionTimeMs, 0);

      return {
        userId,
        period: `Last ${input.days} days`,
        summary: {
          totalExecutions: history.length,
          successfulExecutions,
          failedExecutions: history.length - successfulExecutions,
          totalJobsAdded,
          averageJobsPerExecution: averageJobsPerExecution.toFixed(1),
          totalExecutionTimeMs: totalExecutionTime,
          averageExecutionTimeMs: history.length > 0 ? (totalExecutionTime / history.length).toFixed(0) : 0,
        },
        health,
        verification,
        recentExecutions: history.slice(-5).reverse(), // Last 5 executions, most recent first
      };
    }),
});
