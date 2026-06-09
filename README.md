# MyCareerIQ

**Your AI-powered job search pipeline.**

MyCareerIQ builds and manages your entire job search — from discovering open roles at target companies to generating cover letters, tracking applications, and managing outreach. Part of the [ReviveIQI](https://reviveiqi.com) suite.

**Live at:** [mycareeriq.reviveiqi.com](https://mycareeriq.reviveiqi.com)

---

## What it does

- Scrapes Greenhouse and Lever ATS career pages via Firecrawl to surface real open roles at target companies
- Enriches contacts via Apollo — finds the right person to reach out to at each company
- Runs AI job research: matches roles to your target titles, filters by location and freshness (last 30 days)
- Generates cover letters via a 3-stage GPT pipeline: Narrative Brief → Cover Letter → Quality Scoring
- 6 cover letter modes: Traditional, Executive Narrative, Achievement-Based, Career Transition, Startup, Human-Centered — auto-selected from job title
- Scores every letter on Authenticity, Relevance, and Readability (1–10) with auto-retry below 7
- Pipeline table: Research → Cover Letter → Outreach → Applied → Interviewing → Offer → Rejected
- LinkedIn OAuth — "Contact on LinkedIn" opens the contact's profile directly
- Salary resolution: ATS field + regex extraction + GPT estimate
- Cross-sell from ResumeIQ Career Launch Bundle (60 days included)

## Pipeline stages

```
Research → Cover Letter → Outreach → Applied → Interviewing → Offer
```

Auto-advances: Outreach on LinkedIn click, Applied on "Mark as Applied"

## Pricing

| Plan | Price |
|---|---|
| Free | 7 runs/month |
| Pro Monthly | $49.99/month |
| Pro Annual | $299/year |

## Stack

React · TypeScript · Vite · Tailwind · Node.js · Express · tRPC · Drizzle · TiDB Cloud · GPT-4o · GPT-4o-mini · Stripe · Firecrawl · Apollo · Cloudflare R2 · Gmail SMTP · Railway

## Repo

`github.com/ReviveIQ/mycareeriq` — main branch = production. Auto-deploys on push.

---

*Part of the ReviveIQI suite · [reviveiqi.com](https://reviveiqi.com)*
