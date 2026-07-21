# SEO Health Dashboard

An internal dashboard that tracks the **on-page SEO health** of a website's key
pages over time. Each page is audited on a cadence; every audit yields a
deterministic **health score (0–100)** and a set of stateful **issues** with
first-seen / resolved dates and full time-travel to any historical run.

> "SEO score" here means an **internal health score computed from on-page
> audits** — not third-party keyword rank-tracking.

## What's implemented

| Area | Status |
| --- | --- |
| Schema + migrations (§5) | ✅ Prisma + SQLite — projects, pages, runs, page_scores, issues, issue_occurrences |
| Deterministic scorer (§2.5) | ✅ pure, unit-tested; score always explainable by open issues |
| Lifecycle diff (§5) | ✅ NEW / STILL / RESOLVED, new-row-per-regression; unit-tested first |
| Audit pipeline (§4) | ✅ Fetcher → Renderer (Playwright) → Analyzers → Scorer → Lifecycle → persist |
| Analyzer set (§6) | ✅ 13 rules across critical/warning/info, page-type aware |
| BFF endpoints (§7) | ✅ projects, scores, issues (`as_of` time-travel), issue detail, run trigger |
| Frontend (§3) | ✅ Projects Overview + Project Detail (Recharts), page filter, drill-down |
| Seed | ✅ 90 days of deterministic history driven through the real pipeline |

## Quick start

Toolchain: **yarn** (classic) · **Node 24 LTS** (`.nvmrc`).

```bash
yarn install
yarn db:push          # create the SQLite schema (dev.db)
yarn db:seed          # 90 days of demo history (3 sites × 5 page types)
yarn dev              # http://localhost:3000
```

Run the tests (lifecycle diff + score determinism + analyzers):

```bash
yarn test
```

## Deployment

Deploys to **Vercel + Turso** (both free tier) as a single Next.js app; Turso is
a SQLite-compatible libSQL database reached via the Prisma libSQL adapter, so
local dev keeps using the plain SQLite file. A daily Vercel Cron drives the
scheduled audit cadence. Full steps in **[DEPLOY.md](./DEPLOY.md)**.

## Architecture

```
Frontend (Next.js App Router, thin)
      │
BFF  = src/app/api/*  (route handlers; all aggregation in src/lib/aggregation.ts)
      │
      ├── Config / results / time-series stores  →  Prisma (SQLite)
      │
Audit pipeline (src/lib/pipeline):
   fetcher.ts  → renderer.ts (Playwright) → analyzers/* → scoring.ts
     → lifecycle.ts (diff) → runAudit.ts (persist, one transaction)
```

The `app/api/*` route handlers **are** the BFF: the frontend never aggregates,
it only renders and drives filters. The pipeline, scorer, and lifecycle diff are
plain modules so they can be unit-tested in isolation and reused by the seed,
the manual trigger, and (with `LIVE_AUDITS=1`) live crawls.

### Storage split (why three concerns)

- `page_scores` — thin, indexed time series; the 90-day graph reads only this.
- `issues` / `issue_occurrences` — full stateful detail + per-run snapshots for
  time-travel.
- `projects` / `pages` — config.

## Key design decisions

- **Score is deterministic** (`src/lib/scoring.ts`): start at 100, subtract
  config-weighted penalties (`src/lib/config.ts`) for **open** issues, clamp to
  0–100. The graph and the issue list below it are always mathematically
  consistent — a drop is always explained by the issues shown.
- **Lifecycle diff** (`src/lib/lifecycle.ts`) is a pure planner over
  fingerprints:
  `NEW = detected − open`, `STILL = detected ∩ open`, `RESOLVED = open − detected`.
- **Reopen strategy = new row per cycle** (the `[DECIDE]` in the brief). A
  regression reuses the same fingerprint on a **fresh** issue row, so every
  "fixed on X" stays factually true and the audit trail is clean.
- **Fingerprint** = `hash(project_id, page_type, rule_id, target_locator)`. It is
  **not** globally unique (that would break new-row-per-cycle). The real
  invariant — *at most one **open** issue per fingerprint at a time* — is
  enforced by the diff inside a transaction.
- **Synthetic snapshot source** (`src/lib/pipeline/synthetic.ts`): the demo
  projects use example domains, so the seed and the on-demand trigger build a
  deterministic HTML snapshot per page/day and run the **real** analyzers over
  it. Set `LIVE_AUDITS=1` to make the trigger crawl the real URL instead.

## Analyzers (§6)

Critical: missing/duplicate canonical, missing title/H1, unexpected/expected
`noindex` (flipped for cart & checkout), render gap (content post-JS but not in
raw HTML; PDP price). Warning: meta description length, heading hierarchy,
Product structured data, broken internal links, hreflang (multi-region), Core
Web Vitals. Info: image alt (per image), non-descriptive link text, image
optimization. Weights and severities live in `src/lib/config.ts`.

## API (§7)

```
GET  /api/projects
GET  /api/projects/{id}/scores?page_type=pdp&from=&to=
GET  /api/projects/{id}/issues?page_type=pdp&status=open&as_of=<date>
GET  /api/issues/{id}
POST /api/projects/{id}/runs   { page_type?, trigger }
```

`as_of` reads `issue_occurrences` at that run date, which is what makes clicking
a graph point load that day's exact issue snapshot.
