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

    // ── Rate limiting via Drizzle sql template ───────────────────────────────
    const { getDb } = await import("./db");
    const { sql } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const now = new Date();

    // Get rate limit state — also check user plan
    const rows = await db.execute(
      sql`SELECT lastRunAt, runsThisMonth, monthlyRunsResetAt, monthlyRunLimit FROM researchConfig WHERE userId = ${userId} LIMIT 1`
    ) as any;
    const row = Array.isArray(rows) ? rows[0] : (rows?.rows?.[0] ?? null);

    // Get user plan to determine actual limit
    // Get user plan using Drizzle select (more reliable than raw sql for TiDB)
    const { users } = await import("../drizzle/schema");
    const { eq: eqOp } = await import("drizzle-orm");
    const userPlanRows = await db.select({
      plan: users.plan,
      planStatus: users.planStatus,
      planExpiresAt: users.planExpiresAt,
    }).from(users).where(eqOp(users.id, userId)).limit(1);

    const userPlan = userPlanRows[0];
    const { isPro } = await import("./stripeService");
    const userIsPro = isPro({
      plan: userPlan?.plan,
      planStatus: userPlan?.planStatus,
      planExpiresAt: userPlan?.planExpiresAt ? new Date(userPlan.planExpiresAt) : null
    });
    console.log(`[MonitoringRouter] User ${userId} plan=${userPlan?.plan} status=${userPlan?.planStatus} isPro=${userIsPro}`);

    const lastRunAt = row?.lastRunAt ? new Date(row.lastRunAt) : null;
    const runsThisMonth = Number(row?.runsThisMonth ?? 0);
    // Pro = unlimited (100), Free = 7 runs/month
    const monthlyLimit = userIsPro ? 100 : 7;
    const resetAt = row?.monthlyRunsResetAt ? new Date(row.monthlyRunsResetAt) : null;

    // Check 20-minute cooldown — free users only, Pro can run anytime
    if (!userIsPro && lastRunAt) {
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

    // Check monthly cap — reset if new period
    let currentRuns = runsThisMonth;
    if (!resetAt || now > resetAt) {
      currentRuns = 0;
      const nextReset = new Date(now);
      nextReset.setMonth(nextReset.getMonth() + 1);
      await db.execute(sql`UPDATE researchConfig SET runsThisMonth = 0, monthlyRunsResetAt = ${nextReset} WHERE userId = ${userId}`);
    }

    if (currentRuns >= monthlyLimit) {
      const daysLeft = resetAt ? Math.ceil((resetAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 30;
      const message = userIsPro
        ? `Monthly limit reached (${monthlyLimit} runs). Resets in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`
        : `Free plan limit reached (${monthlyLimit} runs/month). Upgrade to Pro for unlimited research runs.`;
      return {
        success: false,
        jobsResearched: 0,
        jobsAdded: 0,
        executionTimeMs: 0,
        message,
        rateLimited: true,
        monthlyLimitReached: true,
        runsThisMonth: currentRuns,
        monthlyLimit,
        requiresUpgrade: !userIsPro,
      };
    }

    // Update counters before firing
    const nextReset2 = resetAt || (() => { const d = new Date(now); d.setMonth(d.getMonth() + 1); return d; })();
    await db.execute(sql`UPDATE researchConfig SET lastRunAt = ${now}, runsThisMonth = ${currentRuns + 1}, monthlyRunsResetAt = ${nextReset2} WHERE userId = ${userId}`);

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
    const { sql } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return { runsThisMonth: 0, monthlyLimit: 60, minutesUntilNextRun: 0, canRunNow: true };

    const rows = await db.execute(
      sql`SELECT lastRunAt, runsThisMonth, monthlyRunsResetAt, monthlyRunLimit FROM researchConfig WHERE userId = ${ctx.user.id} LIMIT 1`
    ) as any;

    // TiDB mysql2 format: [rows[], fields[]]
    let row: any = null;
    if (Array.isArray(rows) && Array.isArray(rows[0])) {
      row = rows[0][0] ?? null;
    } else if (Array.isArray(rows)) {
      row = rows[0] ?? null;
    } else {
      row = rows?.rows?.[0] ?? null;
    }

    // Check user plan using Drizzle select
    const { users: usersTable } = await import("../drizzle/schema");
    const { eq: eq2 } = await import("drizzle-orm");
    const planRows = await db.select({
      plan: usersTable.plan,
      planStatus: usersTable.planStatus,
      planExpiresAt: usersTable.planExpiresAt,
    }).from(usersTable).where(eq2(usersTable.id, ctx.user.id)).limit(1);
    const planRow = planRows[0];

    const { isPro } = await import("./stripeService");
    const userIsPro2 = isPro({
      plan: planRow?.plan,
      planStatus: planRow?.planStatus,
      planExpiresAt: planRow?.planExpiresAt ? new Date(planRow.planExpiresAt) : null,
    });

    const now = new Date();
    const lastRunAt = row?.lastRunAt ? new Date(row.lastRunAt) : null;
    const runsThisMonth = Number(row?.runsThisMonth ?? 0);
    const monthlyLimit = userIsPro2 ? 100 : 7;

    let minutesUntilNextRun = 0;
    let canRunNow = true;

    // 20-minute cooldown only applies to free users
    // Pro users can run anytime (they paid for unlimited)
    if (!userIsPro2 && lastRunAt) {
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
