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

    // ── Rate limiting via raw SQL (avoids Drizzle schema column name issues) ────
    const { getDb } = await import("./db");
    const conn = await getDb();
    if (!conn) throw new Error("Database not available");

    const now = new Date();

    // Get rate limit state via raw SQL
    const [rows] = await (conn as any).execute(
      "SELECT lastRunAt, runsThisMonth, monthlyRunsResetAt, monthlyRunLimit FROM researchConfig WHERE userId = ? LIMIT 1",
      [userId]
    ) as any[];

    const row = rows?.[0];
    const lastRunAt = row?.lastRunAt ? new Date(row.lastRunAt) : null;
    const runsThisMonth = row?.runsThisMonth || 0;
    const monthlyLimit = row?.monthlyRunLimit || 60;
    const resetAt = row?.monthlyRunsResetAt ? new Date(row.monthlyRunsResetAt) : null;

    // Check 20-minute cooldown
    if (lastRunAt) {
      const minutesSince = (now.getTime() - lastRunAt.getTime()) / (1000 * 60);
      if (minutesSince < 20) {
        const minutesLeft = Math.ceil(20 - minutesSince);
        return {
          success: false,
          jobsResearched: 0,
          jobsAdded: 0,
          executionTimeMs: 0,
          message: `Please wait ${minutesLeft} more minute${minutesLeft === 1 ? "" : "s"} before running again`,
          rateLimited: true,
          minutesUntilNextRun: minutesLeft,
          hoursUntilNextRun: 0,
          runsThisMonth,
          monthlyLimit,
        };
      }
    }

    // Check monthly cap
    let currentRuns = runsThisMonth;
    if (!resetAt || now > resetAt) {
      currentRuns = 0;
      const nextReset = new Date(now);
      nextReset.setMonth(nextReset.getMonth() + 1);
      await (conn as any).execute(
        "UPDATE researchConfig SET runsThisMonth = 0, monthlyRunsResetAt = ? WHERE userId = ?",
        [nextReset, userId]
      );
    }

    if (currentRuns >= monthlyLimit) {
      const daysLeft = resetAt ? Math.ceil((resetAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 30;
      return {
        success: false,
        jobsResearched: 0,
        jobsAdded: 0,
        executionTimeMs: 0,
        message: `Monthly limit reached (${monthlyLimit} runs). Resets in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`,
        rateLimited: true,
        monthlyLimitReached: true,
        runsThisMonth: currentRuns,
        monthlyLimit,
      };
    }

    // Update counters before firing
    const nextReset = resetAt || (() => { const d = new Date(now); d.setMonth(d.getMonth() + 1); return d; })();
    await (conn as any).execute(
      "UPDATE researchConfig SET lastRunAt = ?, runsThisMonth = ?, monthlyRunsResetAt = ? WHERE userId = ?",
      [now, currentRuns + 1, nextReset, userId]
    );

    console.log(`[MonitoringRouter] Run approved for user ${userId} — run ${currentRuns + 1}/${monthlyLimit} this month`);

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
    const conn = await getDb();
    if (!conn) return { runsThisMonth: 0, monthlyLimit: 60, minutesUntilNextRun: 0, canRunNow: true };

    const [rows] = await (conn as any).execute(
      "SELECT lastRunAt, runsThisMonth, monthlyRunsResetAt, monthlyRunLimit FROM researchConfig WHERE userId = ? LIMIT 1",
      [ctx.user.id]
    ) as any[];

    const row = rows?.[0];
    const now = new Date();
    const lastRunAt = row?.lastRunAt ? new Date(row.lastRunAt) : null;
    const runsThisMonth = row?.runsThisMonth || 0;
    const monthlyLimit = row?.monthlyRunLimit || 60;

    let minutesUntilNextRun = 0;
    let canRunNow = true;

    if (lastRunAt) {
      const minsSince = (now.getTime() - lastRunAt.getTime()) / (1000 * 60);
      if (minsSince < 20) {
        minutesUntilNextRun = Math.ceil(20 - minsSince);
        canRunNow = false;
      }
    }

    if (runsThisMonth >= monthlyLimit) canRunNow = false;

    return {
      runsThisMonth,
      monthlyLimit,
      minutesUntilNextRun,
      hoursUntilNextRun: 0,
      canRunNow,
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
