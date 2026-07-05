# VenueScout — Backend

Fastify 5 + TypeScript API for the VenueScout venue-scouting platform. Implements the contract in `../docs/SPEC.md` (schema §3, REST API §4, ingestion §5).

## Stack

Node 22, TypeScript (strict), Fastify 5, Drizzle ORM (postgres-js), Zod, `@anthropic-ai/sdk` (claude-sonnet-5 for extraction/brief search, claude-haiku-4-5 for tagging), JWT auth (admin/editor/viewer), S3-compatible media storage (presigned uploads), PostGIS + pgvector + pg_trgm.

## Setup

```bash
npm install
cp .env.example .env   # fill DATABASE_URL, ANTHROPIC_API_KEY, JWT_SECRET, S3_*
npm run build
npm run migrate        # applies drizzle/*.sql (creates extensions + tables)
node dist/seed.js      # admin user + sample data (admin@venuescout.it / venuescout-admin)
npm run dev            # tsx watch mode on PORT (default 3000)
```

API base path: `/api/v1`. Health check: `GET /api/v1/health`.
Login: `POST /api/v1/auth/login {email,password}` → `{token,user}`; send `Authorization: Bearer <token>`.

## Environment

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres (PostGIS + pgvector + pg_trgm required) |
| `ANTHROPIC_API_KEY` | Claude API (ingestion, brief search, tagging) |
| `JWT_SECRET` | Token signing |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Media storage (R2/S3) |
| `PORT` | HTTP port (default 3000) |
| `SKIP_MIGRATE_ON_FAIL` | If `true`, `npm run migrate` exits 0 with a warning when the DB is unreachable |

## Migrations

Plain SQL files in `drizzle/`, applied in filename order by `npm run migrate` (tracked in the `_migrations` table). `drizzle/0000_init.sql` creates the extensions and the full schema.

## Tests

`npm test` — vitest unit tests: schema, serializers (effective_* inheritance, usage derivation, compare matrix), brief-criteria SQL builder, GeoJSON builder, text extraction (HTML/PPTX), and route smoke tests via `fastify.inject` with a mocked repository layer. No database needed.

## Deploy on Render

The repo root `render.yaml` blueprint provisions Postgres + this service:

- build: `npm ci && npm run build`
- start: `npm run migrate && npm start`
- health check: `/api/v1/health`

Set `ANTHROPIC_API_KEY` and the `S3_*` vars in the Render dashboard. Enable PostGIS/pgvector on the database (the migration runs `CREATE EXTENSION IF NOT EXISTS`, which works on Render Postgres Basic+).
