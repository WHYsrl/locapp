# VenueScout — Web

Desktop web app (Italian UI) for the VenueScout venue-scouting platform. Built with Next.js 16 (App Router, TypeScript strict), Tailwind CSS 4, TanStack Query and MapLibre GL JS (OpenStreetMap raster tiles, no API key).

The app talks to the VenueScout backend described in `../docs/SPEC.md` (§4, REST `/api/v1`, JWT Bearer).

## Run

```bash
npm install
npm run dev        # http://localhost:3000

npm run build      # production build
npm start          # serve production build
npm run typecheck  # tsc --noEmit
```

## Environment

Copy `.env.example` to `.env.local`:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of the backend (e.g. `http://localhost:4000`). The client calls `${NEXT_PUBLIC_API_URL}/api/v1/...` |
| `NEXT_PUBLIC_DEMO` | Set to `1` to force demo mode (no backend, no login). |

## Demo mode

Every API call goes through a typed client (`src/lib/api.ts`). If the backend is unreachable (network error), the client transparently switches to an **in-memory demo store** (`src/lib/demo.ts`) backed by realistic Italian fixture data (`src/lib/fixtures.ts`) — 6 locations (hotel with 2 nested venues, villa, palazzo, industrial space), 2 projects, shortlists, quotes, site visits and availability — and stays in demo mode for the session. `NEXT_PUBLIC_DEMO=1` forces this behaviour from the start. The login page also offers an explicit "Entra in modalità demo" button.

Mutations in demo mode (create/edit locations, shortlist changes, quotes, ingestion apply, …) work against the in-memory store and persist for the browser session.

## Routes

| Route | Purpose |
|---|---|
| `/login` | JWT login (skipped in demo mode) |
| `/` | Dashboard: counts, recent projects, locations by status |
| `/locations` | List with filters (search, city, tag, stato, capienza min, configurazione) + table/map toggle |
| `/locations/new`, `/locations/[id]/edit` | Base-card form with structured jsonb subforms (logistica, tecnica, allestimenti, party) |
| `/locations/[id]` | Full card: spazi/capienze, logistica (with inheritance badge), tecnica, fornitori, referenti, media, listini, utilizzo, note progetto, cronologia, nested children |
| `/ingest` | AI ingestion: URL/text/file → job polling → per-field draft review → apply (SPEC §5) |
| `/search` | AI brief search with score %, matched/unmatched/to-verify reasons, distances, add-to-event picker |
| `/projects`, `/projects/[id]` | Projects; events with shortlist counts by status + project map |
| `/projects/[id]/events/[eventId]` | Shortlist board: status, client feedback, sopralluoghi, preventivi, disponibilità + compare matrix + event map |
| `/contatti` | Companies & people registry with linked locations |
