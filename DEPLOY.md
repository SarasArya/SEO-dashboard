# Deploying to Vercel + Turso (free tier)

The app is a single Next.js deployment (frontend + BFF API routes together). In
production the database is **Turso** (libSQL — SQLite-compatible), reached
through the Prisma libSQL driver adapter. Locally you keep using the SQLite file
with no changes.

**Toolchain:** yarn (classic) · Node 24 LTS (`.nvmrc`). Prisma client is
generated during `yarn build` (`prisma generate && next build`).

## How the datasource switches
`src/lib/db.ts` picks the connection at runtime:
- `TURSO_DATABASE_URL` set → Prisma uses the libSQL adapter (Turso).
- not set → Prisma uses the local SQLite file from `DATABASE_URL` (`file:./dev.db`).

So local dev and production share one codebase; only env vars differ.

---

## 1. Create the Turso database
Install the CLI (`brew install tursodatabase/tap/turso` or see turso.tech), then:

```bash
turso auth login
turso db create seo-dashboard
turso db show --url seo-dashboard        # -> libsql://seo-dashboard-<org>.turso.io
turso db tokens create seo-dashboard     # -> the auth token
```

## 2. Load schema + seed data into Turso
Seed locally first (fast — one file, ~30s), then import the result into Turso.
This avoids running 1,350 audit transactions over the network.

```bash
yarn install
yarn db:push          # create local dev.db schema
yarn db:seed          # 90 days of demo history into dev.db

# dump local SQLite and import into Turso (schema + data in one shot)
sqlite3 prisma/dev.db .dump > dump.sql
turso db shell seo-dashboard < dump.sql
```

> Prefer an empty prod DB? Run only the schema: `yarn db:push` then dump/import,
> and let the daily cron (below) accumulate real history over time.

## 3. Deploy on Vercel
1. Push to GitHub (already on `main`) and **Import Project** in Vercel.
2. Framework preset: **Next.js** (auto-detected). Build command stays the
   default `yarn build`; install command `yarn install`.
3. Add **Environment Variables** (Production + Preview):

   | Name | Value |
   | --- | --- |
   | `TURSO_DATABASE_URL` | `libsql://seo-dashboard-<org>.turso.io` |
   | `TURSO_AUTH_TOKEN` | the token from `turso db tokens create` |
   | `CRON_SECRET` | any long random string (protects the cron route) |
   | `DATABASE_URL` | `file:./dev.db` (placeholder; unused when Turso is set, but Prisma expects it) |

4. Deploy. Node version: set the project's Node.js version to **22.x or 24.x**
   in Vercel → Settings → General if you want to match `.nvmrc`.

## 4. Daily scheduled audits
`vercel.json` registers a cron that hits `/api/cron/audit` daily at 03:00 UTC —
this is the "scheduled" cadence from the brief. Vercel automatically sends
`Authorization: Bearer $CRON_SECRET`, which the route verifies. Manual and
deploy-triggered audits use `POST /api/projects/{id}/runs` and share the same
pipeline.

> Vercel Hobby cron runs once per day, which matches the daily cadence. For live
> crawling (Playwright) instead of the built-in synthetic snapshots, set
> `LIVE_AUDITS=1` — note serverless functions can't launch a browser, so real
> crawls should run from a host with Chromium (e.g. a small worker or Fly.io),
> not Vercel's serverless runtime.

## Notes
- `@libsql/client`, `@prisma/adapter-libsql`, and `playwright` are marked as
  `serverExternalPackages` in `next.config.js` so webpack doesn't try to bundle
  their native/Node bits.
- The free Turso tier is generous (multiple DBs, billions of row reads/month) —
  ample for this dashboard.
