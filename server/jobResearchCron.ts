import { researchNewJobs, addJobsToPipeline } from "./jobResearchService";
import { notifyOwner } from "./_core/notification";
import { logResearchExecution } from "./jobResearchMonitoring";

export async function runDailyJobResearch(userId: number = 1) {
  const startTime = Date.now();
  try {
    console.log("[JobResearchCron] Starting daily job research for user:", userId);

    // Research new jobs using user's configuration
    const jobs = await researchNewJobs(undefined, userId);
    console.log(`[JobResearchCron] Researched ${jobs.length} new jobs`);

    // Add them to the pipeline
    const addedCount = await addJobsToPipeline(jobs, userId);
    console.log(`[JobResearchCron] Added ${addedCount} jobs to pipeline`);

    // Log monitoring data
    const topJobTitles = jobs.slice(0, 5).map((j) => j.jobTitle);
    const executionTimeMs = Date.now() - startTime;
    await logResearchExecution(userId, jobs.length, addedCount, topJobTitles, executionTimeMs, true);

    // Build comprehensive morning notification with job research
    const jobSummary = jobs.slice(0, 5).map((j) => `${j.companyName} - ${j.jobTitle}`).join("\n");
    const newJobTitles = jobs.slice(0, 5).map((j) => j.jobTitle).join(", ");
    
    // Calculate pipeline stats from researched jobs
    const highPriorityCount = jobs.filter((j) => j.priority === "High").length;
    const remoteCount = jobs.filter((j) => j.remote).length;

    const content = `Good morning! Here's your daily job search update:\n\n📊 NEW JOBS RESEARCHED\nAdded ${addedCount} new jobs matching your target roles: ${newJobTitles}\n\nTop 5 opportunities:\n${jobSummary}\n\n📈 PIPELINE UPDATE\nHigh priority roles: ${highPriorityCount}\nRemote opportunities: ${remoteCount}\n\nVisit your dashboard to generate applications and track progress.`;

    await notifyOwner({
      title: "☀️ Morning Job Search Update",
      content,
    });

    console.log("[JobResearchCron] Morning notification sent successfully");
    return { success: true, addedCount, jobs, notificationSent: true, userId, executionTimeMs };
  } catch (error) {
    console.error("[JobResearchCron] Error:", error);

    // Log failure
    const executionTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await logResearchExecution(userId, 0, 0, [], executionTimeMs, false, errorMessage);

    // Notify owner of failure
    await notifyOwner({
      title: "Daily Job Research Failed",
      content: `Error: ${errorMessage}\n\nUser ID: ${userId}`,
    });

    throw error;
  }
}
