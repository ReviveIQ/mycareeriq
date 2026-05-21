import { getDb } from './server/db.ts';
import { researchNewJobs } from './server/jobResearchService.ts';

async function testResearch() {
  try {
    console.log('[Test] Starting job research...');
    const jobs = await researchNewJobs(30);
    console.log(`[Test] Researched ${jobs.length} jobs`);
    console.log('[Test] Sample job:', JSON.stringify(jobs[0], null, 2));
  } catch (error) {
    console.error('[Test] Error:', error);
  }
}

testResearch();
