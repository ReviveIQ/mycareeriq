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

    // Fire research in background — don't await so we return before timeout
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

    // Return immediately — client polls pipeline table to see results
    return {
      success: true,
      jobsResearched: 0,
      jobsAdded: 0,
      executionTimeMs: 0,
      message: "Job research started — your pipeline will update in 20-30 seconds",
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
