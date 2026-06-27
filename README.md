# MyCareerIQ

**Your AI-powered job search pipeline.**

MyCareerIQ builds and manages your entire job search — from discovering open roles at target companies to generating cover letters, tracking applications, and managing outreach. Part of the [ReviveIQI](https://reviveiqi.com) suite.

**Live at:** [mycareeriq.reviveiqi.com](https://mycareeriq.reviveiqi.com)  
**GitHub:** `github.com/ReviveIQ/mycareeriq` (main = production)

---

## Pages

| Route | Description |
|---|---|
| `/` | Main app — pipeline table, InboxIQ tab, settings, cover letters |
| `/login` | Login page |
| `/register` | Registration page |
| `/pricing` | Pricing page ($29.99/mo · $299/yr) |
| `/sso` | Cross-product SSO landing (from ResumeIQ) |
| `/privacy` | Privacy policy |
| `/terms` | Terms of service |

---

## What it does

- Scrapes Greenhouse, Ashby, and Lever ATS career pages to surface real open roles at target companies
- Filters jobs to the last 30 days only — no stale postings
- Enriches contacts via Hunter.io (primary) — Apollo is on free plan (403 on people search), Hunter handles all contact discovery
- Runs AI job research: matches roles to target titles, filters by location (US state or remote)
- Role-aware company discovery — GPT-driven suggestions based on candidate's specific role
- 60+ standardized industry categories
- Generates cover letters via a 3-stage GPT pipeline: Narrative Brief → Cover Letter → Quality Scoring
- 6 cover letter modes auto-selected from job title; scores every letter on Authenticity, Relevance, Readability (1–10)
- Pipeline table sorted by date added (newest first) with relative timestamps
- Daily cron at 8am EST runs research automatically for all active users
- Duplicate run prevention — in-memory lock per user

## InboxIQ (built-in tab)

Live inside MyCareerIQ. No separate deployment.

- Gmail OAuth — scans inbox for replies from pipeline companies
- Two-phase scan: pipeline company email detection + inbound opportunity detection
- GPT-4o-mini classification — detects interview invites, rejections, offers, follow-ups
- Auto-advances pipeline stage on classification (e.g. reply → Outreach, invite → Interviewing)
- Dismiss buttons with persistence to `inbox_events` table
- Google OAuth verification in progress (`gmail.modify` scope — required for dismiss/archive write-back)

## Pipeline stages

```
Research → Outreach → Applied → Interviewing → Offer → Rejected
```

Auto-advances: Outreach when "Contact on LinkedIn" clicked, Applied when "Mark as Applied" clicked.

## Onboarding checklist (5 steps)

| Step | Completion signal |
|---|---|
| 1 — Upload Resume | `user.resumeIQKey` present OR pipeline has jobs |
| 2 — Choose Target Roles | Pipeline has jobs |
| 3 — Set Location | Pipeline has jobs |
| 4 — Find First Opportunities | Pipeline has jobs |
| 5 — Connect InboxIQ | `user.gmailConnected === true` (returned from `/api/auth/me`) |

Step 5 checks `gmailConnected` from the user object — this field is included in the `/api/auth/me` response.

## Cross-product SSO from ResumeIQ

Users arriving from ResumeIQ done screen land on `/sso`:
1. Verifies signed cross-app token (HMAC-SHA256, 10-min expiry)
2. Creates or finds MyCareerIQ account (no password needed)
3. Starts 7-day free trial (`trialStartedAt` stored on user)
4. Syncs resume from ResumeIQ — queries `riq_resumes` by email, pre-populates Settings target roles
5. Full page reload forces AuthContext re-initialization with new token

Trial banner shows days remaining. Hidden for `plan = pro` or `enterprise`.

## Pricing

| Plan | Price |
|---|---|
| 7-day free trial | Free (via ResumeIQ SSO) |
| Pro Monthly | $29.99/month |
| Pro Annual | $299/year |

## Stack

React · TypeScript · Vite · Tailwind · Node.js · Express · tRPC · Drizzle ORM · TiDB Cloud · GPT-4o · GPT-4o-mini · Stripe · Hunter.io · Apollo (degraded — free plan) · Cloudflare R2 · Gmail SMTP port 587 STARTTLS · Railway

## Fonts

**Montserrat 700/800** (headings) · **DM Sans 300–800** (body) · **Inter 400/500/600** (UI elements)

## Infrastructure

| Layer | Detail |
|---|---|
| Hosting | Railway — auto-deploys from `main` (~60–90s) |
| Database | TiDB Cloud · cluster: `pipeline-production` · database: `pipeline` |
| Auth | jose JWT · stored as `reviveiq_auth_token` in localStorage |
| Email | Gmail SMTP · port 587 STARTTLS · `family: 4` (IPv4 forced — Railway blocks 465) |
| Storage | Cloudflare R2 — resumes, DOCX, cover letters |

## Key files

| File | Purpose |
|---|---|
| `client/src/pages/Home.tsx` | Full pipeline UI, table, filters, cover letter modal, InboxIQ tab |
| `client/src/pages/SSO.tsx` | Cross-product SSO landing |
| `client/src/pages/InboxIQ.tsx` | Gmail inbox scanning UI |
| `client/src/components/GettingStarted.tsx` | 5-step onboarding checklist |
| `server/_core/index.ts` | Express server, auth routes, SSO receiver, migrations |
| `server/_core/auth.ts` | JWT auth · `/api/auth/me` returns: id, email, name, plan, gmailConnected, gmailEmail |
| `server/_core/notification.ts` | Owner alerts (port 587 STARTTLS) |
| `server/pipelineRouter.ts` | getCompanies, stage mutations, contact enrichment |
| `server/jobResearchService.ts` | Full research pipeline (fetch → score → enrich → save) |
| `server/jobResearchCron.ts` | Daily 8am EST cron + morning notification |
| `server/inboxIQRouter.ts` | Gmail OAuth, inbox scan, classification, stage advancement |
| `server/emailService.ts` | Application emails (port 587 STARTTLS) |
| `server/applicationGenerator.ts` | 3-stage cover letter GPT pipeline |
| `server/hunterService.ts` | Primary contact enrichment (Apollo fallback broken on free plan) |
| `server/apolloService.ts` | Apollo contact search (403 on free plan — Hunter handles fallback) |
| `server/companyDiscoveryService.ts` | GPT-driven role-aware company suggestions |
| `drizzle/schema.ts` | Full TiDB schema |

## Key engineering notes

- **SMTP port 587** — all nodemailer transports use `host: smtp.gmail.com`, `port: 587`, `secure: false`, `family: 4`. Railway blocks port 465 (SSL). Never use `service: "gmail"` shorthand.
- **Apollo on free plan** — `api/v1/mixed_people/api_search` returns 403. Hunter.io handles all contact discovery. Do not attempt to upgrade Apollo logic without upgrading the plan.
- **Drizzle ORM only** — never mix raw mysql2 `.execute()` with Drizzle. Use `sql` template tag for raw queries.
- **TiDB column casing** — columns stored in creation casing. Use `DESCRIBE tablename` before querying.
- **`USE pipeline;`** must run before any TiDB SQL Editor query — no database auto-selected.
- **`gmailConnected`** — returned in `/api/auth/me`. Used by GettingStarted step 5 completion check.

## Workflow rules

1. Push directly to `main` — Railway auto-deploys (~60–90s). No dev branch.
2. Drizzle ORM for all DB operations — no raw mysql2
3. Revoke GitHub tokens immediately after use
4. `CROSS_APP_SECRET` must match in both ResumeIQ and MyCareerIQ Railway env vars
5. Bryan's userId: `30001` · monthlyRunLimit: `60` (testing)

---

*Part of the ReviveIQI suite · [reviveiqi.com](https://reviveiqi.com)*
