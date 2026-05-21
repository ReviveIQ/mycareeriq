import { getDb } from "./db";
import { applications, researchConfig } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";

export interface ResearchMonitoringData {
  timestamp: Date;
  userId: number;
  targetRoles: string;
  targetCategories: string;
  rolesPerDay: number;
  jobsResearched: number;
  jobsAdded: number;
  topJobTitles: string[];
  success: boolean;
  errorMessage?: string;
  executionTimeMs: number;
}

// In-memory store for monitoring data (last 30 days)
const monitoringHistory: ResearchMonitoringData[] = [];

export async function logResearchExecution(
  userId: number,
  jobsResearched: number,
  jobsAdded: number,
  topJobTitles: string[],
  executionTimeMs: number,
  success: boolean = true,
  errorMessage?: string
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[ResearchMonitoring] Database not available for logging");
      return;
    }

    // Fetch current config for logging
    const configs = await db.select().from(researchConfig).where(eq(researchConfig.userId, userId));
    const config = configs[0];

    const monitoringData: ResearchMonitoringData = {
      timestamp: new Date(),
      userId,
      targetRoles: config?.targetRoles?.toString() || "Unknown",
      targetCategories: config?.targetCategories?.toString() || "Unknown",
      rolesPerDay: config?.rolesPerDay ? parseInt(config.rolesPerDay.toString()) : 30,
      jobsResearched,
      jobsAdded,
      topJobTitles,
      success,
      errorMessage,
      executionTimeMs,
    };

    // Add to in-memory history
    monitoringHistory.push(monitoringData);

    // Keep only last 30 days of data
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const filteredHistory = monitoringHistory.filter((entry) => entry.timestamp > thirtyDaysAgo);
    monitoringHistory.length = 0;
    monitoringHistory.push(...filteredHistory);

    // Log to console for debugging
    console.log(
      `[ResearchMonitoring] Research execution logged for user ${userId}:`,
      JSON.stringify(
        {
          timestamp: monitoringData.timestamp.toISOString(),
          targetRoles: monitoringData.targetRoles,
          jobsAdded: monitoringData.jobsAdded,
          executionTimeMs: monitoringData.executionTimeMs,
          success: monitoringData.success,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error("[ResearchMonitoring] Error logging research execution:", error);
  }
}

export async function getResearchMonitoringHistory(userId: number, days: number = 7): Promise<ResearchMonitoringData[]> {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return monitoringHistory.filter((entry) => entry.userId === userId && entry.timestamp > cutoffDate);
}

export async function getResearchHealthStatus(userId: number): Promise<{
  isHealthy: boolean;
  lastExecution?: ResearchMonitoringData;
  consecutiveFailures: number;
  averageExecutionTimeMs: number;
  successRate: number;
  warnings: string[];
}> {
  const history = await getResearchMonitoringHistory(userId, 7);

  if (history.length === 0) {
    return {
      isHealthy: false,
      consecutiveFailures: 0,
      averageExecutionTimeMs: 0,
      successRate: 0,
      warnings: ["No research executions found in the last 7 days"],
    };
  }

  const lastExecution = history[history.length - 1];
  const successfulExecutions = history.filter((h) => h.success);
  const successRate = (successfulExecutions.length / history.length) * 100;

  // Count consecutive failures from the end
  let consecutiveFailures = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (!history[i].success) {
      consecutiveFailures++;
    } else {
      break;
    }
  }

  const averageExecutionTimeMs = history.reduce((sum, h) => sum + h.executionTimeMs, 0) / history.length;

  const warnings: string[] = [];

  // Check for configuration changes
  const uniqueRoles = new Set(history.map((h) => h.targetRoles));
  if (uniqueRoles.size > 1) {
    warnings.push(`Target roles changed ${uniqueRoles.size} times in the last 7 days`);
  }

  // Check for low success rate
  if (successRate < 80) {
    warnings.push(`Success rate is ${successRate.toFixed(1)}% (below 80% threshold)`);
  }

  // Check for slow execution
  if (averageExecutionTimeMs > 30000) {
    warnings.push(`Average execution time is ${averageExecutionTimeMs.toFixed(0)}ms (above 30s threshold)`);
  }

  // Check if last execution was too long ago
  const hoursSinceLastExecution = (Date.now() - lastExecution.timestamp.getTime()) / (1000 * 60 * 60);
  if (hoursSinceLastExecution > 25) {
    warnings.push(`Last execution was ${hoursSinceLastExecution.toFixed(1)} hours ago (expected daily)`);
  }

  return {
    isHealthy: consecutiveFailures === 0 && successRate >= 80 && warnings.length === 0,
    lastExecution,
    consecutiveFailures,
    averageExecutionTimeMs,
    successRate,
    warnings,
  };
}

export async function verifySettingsApplied(userId: number): Promise<{
  settingsCorrect: boolean;
  expectedRoles: string;
  expectedCategories: string;
  expectedRolesPerDay: number;
  lastJobTitles: string[];
  issues: string[];
}> {
  try {
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    // Fetch current config
    const configs = await db.select().from(researchConfig).where(eq(researchConfig.userId, userId));
    const config = configs[0];

    if (!config) {
      return {
        settingsCorrect: false,
        expectedRoles: "",
        expectedCategories: "",
        expectedRolesPerDay: 30,
        lastJobTitles: [],
        issues: ["No research configuration found for user"],
      };
    }

    const expectedRoles = config.targetRoles?.toString() || "";
    const expectedCategories = config.targetCategories?.toString() || "";
    const expectedRolesPerDay = config.rolesPerDay ? parseInt(config.rolesPerDay.toString()) : 30;

    // Get last research execution
    const history = await getResearchMonitoringHistory(userId, 1);
    const lastExecution = history[0];

    const issues: string[] = [];

    // Verify settings match
    if (lastExecution) {
      if (lastExecution.targetRoles !== expectedRoles) {
        issues.push(
          `Target roles mismatch: expected "${expectedRoles}", but last execution used "${lastExecution.targetRoles}"`
        );
      }

      if (lastExecution.targetCategories !== expectedCategories) {
        issues.push(
          `Target categories mismatch: expected "${expectedCategories}", but last execution used "${lastExecution.targetCategories}"`
        );
      }

      if (lastExecution.rolesPerDay !== expectedRolesPerDay) {
        issues.push(
          `Roles per day mismatch: expected ${expectedRolesPerDay}, but last execution used ${lastExecution.rolesPerDay}`
        );
      }
    }

    return {
      settingsCorrect: issues.length === 0,
      expectedRoles,
      expectedCategories,
      expectedRolesPerDay,
      lastJobTitles: lastExecution?.topJobTitles || [],
      issues,
    };
  } catch (error) {
    return {
      settingsCorrect: false,
      expectedRoles: "",
      expectedCategories: "",
      expectedRolesPerDay: 30,
      lastJobTitles: [],
      issues: [`Error verifying settings: ${error instanceof Error ? error.message : "Unknown error"}`],
    };
  }
}
