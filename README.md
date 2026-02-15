# Faypath Full-Stack Scaffold

Faypath is a pastel-themed, merit-first employment platform concept positioned between Indeed (job marketplace) and LinkedIn (professional network).

This repository now includes a **Next.js + TypeScript full-stack scaffold** with:

- App Router frontend in `app/page.tsx`
- API routes in `app/api/*`
- Prisma data layer (`prisma/schema.prisma`)
- NextAuth authentication (`auth.ts`)
- Role-aware candidate/employer workflows
- Persistent employer shortlist (`/api/shortlist`)

## Implemented product scope

- Roles: candidate + employer
- Auth model: mixed (email + Google + LinkedIn entry points in UI)
- Market: US-only language/workflows
- Merit formula (default): 40% work evidence, 35% skill assessment, 25% trust signals
- Features:
  - Job discovery + filtering
  - Job posting
  - Applications
  - Candidate shortlisting
  - Saved searches + job alerts (with email-ready hooks)
  - Alert delivery worker with instant + digest cadence handling
  - Recruiter pipeline automation (auto-stage + load balancing)
  - Integration ops panel (delivery/webhook health + report exports)
  - Admin webhook retry + audit tooling
  - System readiness status endpoint for production checks
  - Compliant external listing ingestion (CSV + tokenized feed)
  - Messaging (polling-based realtime, typing + seen indicators)
  - Interview scheduling
  - Moderation queue
  - Employer analytics dashboard

## API routes

- `GET/POST /api/jobs`
- `GET /api/talent`
- `GET/POST /api/applications`
- `GET/POST /api/messages`
- `PATCH /api/messages` (typing/seen presence updates)
- `GET/POST /api/interviews`
- `GET/POST /api/moderation`
- `GET/POST/DELETE /api/shortlist`
- `GET/POST/PATCH/DELETE /api/saved-searches`
- `GET/PATCH /api/alerts`
- `GET/POST /api/alerts/delivery` (worker preview + run)
- `GET /api/analytics`
- `GET/POST /api/pipeline/automation`
- `GET /api/market-intel`
- `GET /api/reliability/slo`
- `GET /api/monetization`
- `GET/PATCH /api/security/backlog`
- `GET /api/integrations/activity`
- `GET/POST /api/integrations/jobs/import`
- `POST /api/integrations/jobs/feed`
- `GET/POST /api/integrations/retry`
- `GET /api/integrations/audit`
- `POST /api/integrations/webhook` (inbound integration events)
- `GET /api/reports/summary`
- `GET /api/reports/export`
- `GET /api/system/status`

## Run locally

```bash
cd /Users/harleyames/Documents/New\ project
npm install
npm run prisma:generate
npm run prisma:push
npm run dev
```

Then open `http://localhost:3000`.

Run the full local verification suite:

```bash
npm run check
```

## Environment setup

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Defaults are SQLite-based (`DATABASE_URL="file:./dev.db"`), so no external DB is required for local development.
Set `AUTH_SECRET` to a long random string before production use.
Set `ENV_VALIDATION_STRICT="true"` to fail fast at startup when required env vars are invalid.

Optional Phase 8 integration variables:

- `EMAIL_PROVIDER` (`log` or `resend`)
- `EMAIL_FROM` (used when provider is `resend`)
- `RESEND_API_KEY` (required when provider is `resend`)
- `PUSH_PROVIDER` (`log` or `webhook`)
- `PUSH_WEBHOOK_URL` (required when push provider is `webhook`)
- `PUSH_WEBHOOK_AUTH_TOKEN` (optional Bearer token for push webhook)
- `WEBHOOK_OUTBOUND_URL` (destination for outbound integration events)
- `WEBHOOK_SHARED_SECRET` (HMAC signing key for outbound + default inbound verification)
- `WEBHOOK_INBOUND_SECRET` (optional inbound override key)
- `EXTERNAL_INGEST_TOKEN` (Bearer/x-ingest-token value for `/api/integrations/jobs/feed`)

## CI and release checks

- CI workflow: `.github/workflows/ci.yml`
- CI/local gate command: `npm run check:ci`
- Release readiness gate command: `npm run check`

## Deployment templates

- Docker image template: `Dockerfile`
- Docker ignore template: `.dockerignore`
- Vercel config template: `vercel.json`

Build and run via Docker:

```bash
npm run docker:build
npm run docker:run
```

## Integration rate limits

- `POST /api/integrations/webhook`: 60 requests/minute per client identifier
- `POST /api/integrations/jobs/feed`: 20 requests/minute per client identifier
- `POST /api/integrations/jobs/import`: 12 requests/minute per authenticated user
- `GET /api/integrations/retry`: 30 requests/minute per admin user
- `POST /api/integrations/retry`: 8 requests/minute per admin user

## Auth setup

- Email/password auth works out of the box after migration.
- Google and LinkedIn are enabled when these env vars are set:
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  - `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`

Sign-in page: `/sign-in`
Register page: `/register`

## Demo accounts

On first run, seed data creates:

- `candidate@faypath.dev`
- `employer@faypath.dev`
- `admin@faypath.dev`

Password for all: `demo12345`

## Notes

- Existing static prototype files are still present:
  - `index.html`
  - `styles.css`
  - `app.js`
- Data is now persisted in SQLite via Prisma.
