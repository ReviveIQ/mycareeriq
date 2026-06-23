# MyCareerIQ

**Your AI-powered job search pipeline.**

MyCareerIQ builds and manages your entire job search — from discovering open roles at target companies to generating cover letters, tracking applications, and managing outreach. Part of the [ReviveIQI](https://reviveiqi.com) suite.

**Live at:** [mycareeriq.reviveiqi.com](https://mycareeriq.reviveiqi.com)

---

## What it does

- Scrapes Greenhouse and Ashby ATS career pages to surface real open roles at target companies
- Filters jobs to the last 30 days only — no stale postings
- Enriches contacts via Apollo (two-step: search → enrich) — finds recruiters and TA first, falls back to department leaders
- LinkedIn search URL fallback when Apollo returns a contact name but no profile URL
- Hunter.io secondary fallback for contact discovery when Apollo finds nothing
- Runs AI job research: matches roles to your target titles, filters by location (US state or remote)
- Role-aware company discovery — suggests companies that actually hire for the candidate's specific role (admin roles → healthcare, government, enterprise; sales roles → cross-industry)
- 60+ standardized industry categories: Healthcare, Government, Education, Financial Services, Logistics, Retail, Staffing, Distribution, and more
- Generates cover letters via a 3-stage GPT pipeline: Narrative Brief → Cover Letter → Quality Scoring
- 6 cover letter modes: Traditional, Executive Narrative, Achievement-Based, Career Transition, Startup, Human-Centered — auto-selected from job title
- Scores every letter on Authenticity, Relevance, and Readability (1–10) with auto-retry below 7
- First name only salutation: "Dear Rob," not "Dear Rob Pappalardo,"
- Cover letters stored in history only — do not auto-add to pipeline
- Pipeline table sorted by date added (newest first) with "Added" column showing relative time
- Duplicate run prevention — in-memory lock per user prevents concurrent research jobs
- Daily cron at 8am EST runs research automatically for all active users

## Pipeline stages

```
Research → Outreach → Applied → Interviewing → Offer → Rejected
```

Auto-advances: Outreach when "Contact on LinkedIn" clicked, Applied when "Mark as Applied" clicked

## Cross-product SSO from ResumeIQ

Users arriving from ResumeIQ done screen land on `/sso`:
1. Verifies signed cross-app token (HMAC-SHA256, 10-min expiry)
2. Creates or finds MyCareerIQ account (no password needed)
3. Starts 7-day free trial (`trialStartedAt` stored on user)
4. Syncs resume from ResumeIQ — queries `riq_resumes` by email, extracts job title, pre-populates Settings target roles
5. Full page reload forces AuthContext re-initialization with new token

Trial banner shows days remaining for trial users. Hidden for `plan = pro` or `enterprise`.

## Pricing

| Plan | Price |
|---|---|
| 7-day free trial | Free (via ResumeIQ SSO) |
| Pro Monthly | $29.99/month |
| Pro Annual | $299/year |

## Stack

React · TypeScript · Vite · Tailwind · Node.js · Express · tRPC · Drizzle ORM · TiDB Cloud · GPT-4o · GPT-4o-mini · Stripe · Apollo · Hunter.io · Cloudflare R2 · Gmail SMTP (IPv4 forced) · Railway

## Repo

`github.com/ReviveIQ/mycareeriq` — main branch = production. Auto-deploys on push. No dev branch.

## Key files

| File | Purpose |
|---|---|
| `client/src/pages/Home.tsx` | Full pipeline UI, table, filters, cover letter modal |
| `client/src/pages/SSO.tsx` | Cross-product SSO landing page |
| `server/_core/index.ts` | Express server, auth routes, SSO receiver, migrations |
| `server/_core/auth.ts` | JWT auth, session tokens, /api/auth/me |
| `server/pipelineRouter.ts` | getCompanies, stage mutations, contact enrichment |
| `server/jobResearchService.ts` | Full research pipeline (fetch → score → enrich → save) |
| `server/apolloService.ts` | Apollo two-step search + enrich |
| `server/companyDiscoveryService.ts` | GPT-driven role-aware company suggestions |
| `server/applicationGenerator.ts` | 3-stage cover letter GPT pipeline |
| `server/monitoringRouter.ts` | runNow mutation, rate limiting, duplicate lock |
| `drizzle/schema.ts` | Full TiDB schema |

## Key engineering notes

- **Drizzle ORM only** — never mix raw mysql2 `.execute()` with Drizzle. Use `sql` template tag for raw queries when needed.
- **IPv4 forced on SMTP** — all nodemailer transports use `family: 4` to avoid Railway IPv6 ENETUNREACH errors
- **Apollo endpoint** — correct: `/api/v1/mixed_people/api_search` (query params). Wrong: `/v1/mixed_people/search` (returns 403 on Basic plan)
- **TiDB column casing** — columns are stored in the casing they were created with. Use `DESCRIBE tablename` to verify before querying.
- **`USE pipeline;`** must be run before any TiDB SQL Editor query — no database is auto-selected
- **mycareeriq-production** is the TiDB cluster. Database: `pipeline`. Same cluster as ResumeIQ (`riq_*` tables coexist).

## Workflow rules

1. Push directly to `main` — Railway auto-deploys (~60s)
2. Drizzle ORM for all DB operations — no raw mysql2
3. Revoke GitHub tokens immediately after use
4. CROSS_APP_SECRET must match in both ResumeIQ and MyCareerIQ Railway env vars
5. Bryan's userId: `30001` | monthlyRunLimit: `60` (for testing)

---

*Part of the ReviveIQI suite · [reviveiqi.com](https://reviveiqi.com)*
