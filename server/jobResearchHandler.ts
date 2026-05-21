import { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { runDailyJobResearch } from "./jobResearchCron";

export async function jobResearchHandler(req: Request, res: Response) {
  try {
    // Authenticate as cron
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    console.log(`[JobResearchHandler] Running for task ${user.taskUid}`);

    // Run the job research
    const result = await runDailyJobResearch();

    res.json({
      ok: true,
      addedCount: result.addedCount,
      jobsResearched: result.jobs.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[JobResearchHandler] Error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      context: {
        url: req.url,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
