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

## Error handling

Every API call goes through a typed client (`src/lib/api.ts`). If the backend is unreachable, calls throw a `NetworkError` which surfaces as visible error states on each page plus a global "Impossibile raggiungere il server — riprova" banner (with retry) in the shell. A `401` response clears the stored token and redirects to `/login` with a "Sessione scaduta" notice. There is no demo/fixture fallback: the app always talks to the real backend.

## Routes

| Route | Purpose |
|---|---|
| `/login` | JWT login |
| `/` | Dashboard: counts, recent projects, locations by status |
| `/locations` | List with filters (search, city, tag, stato, capienza min, configurazione) + table/map toggle |
| `/locations/new`, `/locations/[id]/edit` | Base-card form with structured jsonb subforms (logistica, tecnica, allestimenti, party) |
| `/locations/[id]` | Full card: spazi/capienze, logistica (with inheritance badge), tecnica, fornitori, referenti, media, listini, utilizzo, note progetto, cronologia, nested children |
| `/ingest` | AI ingestion: URL/text/file → job polling → per-field draft review → apply (SPEC §5) |
| `/search` | AI brief search with score %, matched/unmatched/to-verify reasons, distances, add-to-event picker |
| `/projects`, `/projects/[id]` | Projects; events with shortlist counts by status + project map |
| `/projects/[id]/events/[eventId]` | Shortlist board: status, client feedback, sopralluoghi, preventivi, disponibilità + compare matrix + event map |
| `/contatti` | Companies & people registry with linked locations |
