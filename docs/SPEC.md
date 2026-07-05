# VenueScout — Technical Specification (v1, July 2026)

Source of truth for backend, web and iOS. All three components MUST follow this contract.

## 1. Stack (verified July 2026)

| Layer | Choice |
|---|---|
| Backend | Node 22 LTS, TypeScript 5.x, Fastify 5, Drizzle ORM, Zod |
| DB | Render Postgres (Basic+ plan) with **PostGIS** + **pgvector** + pg_trgm |
| AI | Claude API — `claude-sonnet-5` (extraction, brief search, proposal text), `claude-haiku-4-5-20251001` (tagging, quick ops). SDK: `@anthropic-ai/sdk` |
| Media storage | S3-compatible (Cloudflare R2) via `@aws-sdk/client-s3`; env-configured |
| Web | Next.js 16.2 LTS (App Router), React 19, Tailwind CSS 4, MapLibre GL (OSM tiles) |
| iOS | iOS 26, Swift 6.2, SwiftUI, SpeechAnalyzer (offline transcription), Foundation Models (on-device draft extraction), MapKit. Min deployment: iOS 26, iPhone 15 Pro+ |
| Hosting | Render: `render.yaml` blueprint — web service (backend), web service (Next.js), Postgres |

## 2. Domain model — key rules

1. **Project → Events (1:N).** A project (e.g. "Convention ACME 2026") contains multiple events (2 lunches, 3 dinners, 1 conference, 1 party...). Each event has its own location shortlist.
2. **Base vs specific info.** Location tables hold BASE info (true regardless of project). Event/project-specific info (client feedback, negotiated prices, availability for those dates, notes) lives in `event_locations` and `location_project_notes` — never written into the base card.
3. **Nested locations.** `locations.parent_location_id` — a hotel contains restaurants/meeting rooms. Children inherit address/logistics by default (API returns `effective_*` fields resolved from parent when null).
4. **Location status.** `visit_status`: `da_visitare` | `visitata` (base info). `proposta`/`utilizzata` are DERIVED from `event_locations` (status `proposta`+ = proposed; `utilizzata` = used) — API exposes `GET /locations/:id/usage` listing projects/events + dates.
5. **Ingestion sources.** AI extraction accepts: audio (transcript), free text, photos, PDF, PPTX, DOCX, **web URLs** (server fetches and parses). Every extraction produces a reviewable draft (`ingestion_jobs`), never writes directly.
6. **Maps.** Any project or event exposes `GET .../map` → GeoJSON FeatureCollection of its selected locations (+ optional POIs) for rendering/export.

## 3. Database schema (Drizzle / SQL, singular essentials)

```sql
-- People & companies (shared registry, requirement: insert once, reuse)
companies(id uuid pk, name, kind text check in ('gestione','fornitore','entrambi'),
  supplier_categories text[], vat_number, email, phone, website, notes, created_at, updated_at)
contacts(id uuid pk, first_name, last_name, email, phone, notes, created_at, updated_at)
company_contacts(company_id fk, contact_id fk, role text, primary key(company_id, contact_id, role))

locations(id uuid pk, parent_location_id uuid fk locations null,
  name text not null, slug unique, summary text,
  address_line, city, province, postal_code, country default 'IT',
  geom geometry(Point,4326), google_maps_url, thumbnail_url,
  visit_status text default 'da_visitare' check in ('da_visitare','visitata'),
  logistics jsonb,          -- {auto,bus/pullman,ztl:{present,hours,permits},stop_difficulty,private_parking:{spots},nearby_parking:[{name,distance_m}],notes}
  setup jsonb,              -- {furniture,lights,projections,stage,audio,constraints[]}
  party jsonb,              -- {indoor:{allowed,music_until},outdoor:{allowed,music_until},structural_constraints[],db_limit}
  technical jsonb,          -- {max_kw,generators,aerial_ladder,cooking:('fiamma'|'induzione'|'rigenerazione'|'no'),heavy_vehicle_access,notes}
  accessibility_rating int 1..5, accessibility_notes text,
  availability_rules text,  -- e.g. "solo weekend ottobre-aprile"
  smart_tags text[],        -- conferenze, gala_dinner, lunch, coffee, feste, lancio, shooting, wedding
  impressions text, embedding vector(1024),
  created_at, updated_at)

spaces(id uuid pk, location_id fk, kind check in ('interno','esterno'),
  name, area_sqm numeric, height_m numeric, covered text check in ('coperto','scoperto','copribile') null,
  features jsonb,           -- {foyer,guardaroba,bagni:{count,accessible},cucina,ascensore,scale,arredi[]}
  sort int)
space_capacities(space_id fk, configuration text check in
  ('in_piedi','tavoli_tondi','tavolo_imperiale','platea','ferro_di_cavallo','classroom','cocktail'),
  capacity int, primary key(space_id, configuration))

location_contacts(location_id fk, contact_id fk, company_id fk null, role text)  -- referenti per ruolo
location_suppliers(id uuid pk, location_id fk, company_id fk, contact_id fk null,
  category text,            -- catering, service_avl, allestimenti, arredi, fiori, vigilanza
  requirement check in ('obbligatorio','consigliato'), conditions text, rating numeric null)

media(id uuid pk, location_id fk, space_id fk null, kind check in ('foto','video','planimetria','documento','listino'),
  category text,            -- esterni, interni, sala, servizi, setup
  url, filename, mime, ai_tags text[], created_at)

price_lists(id uuid pk, location_id fk, source_media_id fk null, name, valid_from date, valid_to date,
  items jsonb,              -- [{voce, prezzo, unita, note, stagionalita}]
  payment_terms jsonb,      -- {acconto_pct, saldo, metodi[]}
  extracted_by_ai bool, created_at)

pois(id uuid pk, name, kind check in ('hotel','aeroporto','stazione','monumento','altro'), geom geometry(Point,4326))

projects(id uuid pk, name, client_name, status check in ('attivo','chiuso','archiviato') default 'attivo',
  notes, created_at, updated_at)
events(id uuid pk, project_id fk, name, event_type text, date_start date null, date_end date null,
  pax int null, brief text, notes, sort int, created_at, updated_at)

event_locations(id uuid pk, event_id fk, location_id fk, unique(event_id, location_id),
  status check in ('preselezionata','proposta','sopralluogo_fissato','in_valutazione','preferita','scartata','confermata','utilizzata') default 'preselezionata',
  match_score numeric null, match_reasons jsonb null,   -- from AI search
  client_feedback text, notes text, created_at, updated_at)

site_visits(id uuid pk, event_location_id fk, scheduled_at timestamptz, duration_min int,
  attendees text, with_client bool, outcome text, created_at)
quotes(id uuid pk, event_location_id fk, amount numeric, currency default 'EUR',
  status check in ('richiesto','ricevuto','accettato','rifiutato','scaduto'), received_at, valid_until, media_id fk null, notes)
availability_slots(id uuid pk, event_location_id fk, date date, time_from time null, time_to time null,
  status check in ('disponibile','opzionata','non_disponibile'), option_expires_at date null, notes)

location_project_notes(id uuid pk, location_id fk, project_id fk, event_id fk null,
  overrides jsonb,          -- event/project-specific values that differ from base card
  notes text, created_at, updated_at)

post_event_feedback(id uuid pk, event_id fk, subject_type check in ('location','company','contact'),
  subject_id uuid, ratings jsonb,  -- {overall:1..5, spazi, referente, puntualita, qualita ...}
  notes text, created_by, created_at)

ingestion_jobs(id uuid pk, location_id fk null, source_type check in ('audio','testo','url','pdf','pptx','docx','immagine'),
  source_url text null, source_media_id fk null, raw_text text,
  status check in ('pending','processing','ready','applied','failed') default 'pending',
  extracted jsonb,          -- ExtractedLocationDraft (see §5)
  error text, created_at, applied_at)

users(id uuid pk, email unique, name, password_hash, role check in ('admin','editor','viewer'), created_at)
```

Indexes: GiST on `locations.geom`, `pois.geom`; ivfflat/hnsw on `embedding`; trgm on `locations.name`.

## 4. REST API — `/api/v1` (JSON, JWT Bearer auth)

Errors: `{error:{code,message}}`. Pagination: `?page=1&per_page=25` → `{data:[...],meta:{page,per_page,total}}`.

### Auth
- `POST /auth/login {email,password}` → `{token,user}`
- `POST /auth/register` (admin only)

### Locations
- `GET /locations` — filters: `q, tags, city, visit_status, min_capacity, configuration, accessibility_min, parent_id, root_only=true`
- `POST /locations` / `GET|PATCH|DELETE /locations/:id`
  - GET returns: base card + `children[]`, `effective_logistics` (inherited), `spaces[]+capacities`, `contacts[]`, `suppliers[]`, `media[]`, `price_lists[]`, `usage_summary`
- `GET /locations/:id/usage` → `[{project,event,status,dates}]` (proposta/utilizzata per requirement §2.4)
- `GET /locations/:id/history` → timeline (site visits, events, quotes, feedback)
- Sub-resources CRUD: `/locations/:id/spaces`, `/spaces/:id/capacities`, `/locations/:id/contacts`, `/locations/:id/suppliers`, `/locations/:id/media` (returns presigned upload URL), `/locations/:id/price-lists`, `/locations/:id/notes` (project notes)

### Ingestion (AI)
- `POST /ingest` `{location_id?, source_type, url?, text?, media_id?}` → creates job, async processing
- `GET /ingest/:jobId` → status + `extracted` draft
- `POST /ingest/:jobId/apply` `{accept: {fieldPath: bool}}` → merges accepted fields into location (creates location if `location_id` null)

### Search
- `POST /search/brief` `{brief, event_id?, near?: [{poi_id|address, max_minutes?}], limit=10}`
  → `[{location, score:0..100, reasons:{matched[],unmatched[],to_verify[]}, distances:[{poi,km,minutes_car}]}]`
  Implementation: Claude parses brief → structured criteria; SQL prefilter (capacity, tags, geo radius via PostGIS); Claude reranks top-N with explanations; optional pgvector semantic boost.
- `GET /pois` / `POST /pois`

### Projects & events
- CRUD `/projects`, `/projects/:id/events`, `/events/:id`
- `GET /projects/:id` includes `events[]` with `location_counts by status`
- Shortlist: `POST /events/:id/locations {location_id}`, `PATCH /event-locations/:id` (status, feedback, notes), `DELETE /event-locations/:id`
- `GET /events/:id/locations` → shortlist with location summaries, visits, quotes, availability
- Sub-CRUD: `/event-locations/:id/visits`, `/quotes`, `/availability`
- `GET /events/:id/compare` → side-by-side matrix (capacity, price ranges, distances, status)
- **Maps (req. §2.6):** `GET /events/:id/map` and `GET /projects/:id/map` → GeoJSON FeatureCollection (locations + optional `?pois=`)

### Feedback & registry
- `POST /events/:id/feedback` (batch: location + suppliers + contacts), `GET /locations/:id/feedback`, `GET /companies/:id/feedback`
- CRUD `/companies` (+ `?kind=fornitore&category=catering`), `/contacts`, `/companies/:id/contacts`

### Proposals (phase 3 stub)
- `POST /events/:id/proposal` `{location_ids[], include:{photos,capacities,distances,prices}, tone}` → `{html_url,pdf_url}` (returns 501 + shape for now)

## 5. ExtractedLocationDraft (ingestion contract, shared by all clients)

```json
{
  "confidence": 0.87,
  "location": { "...any locations column...": "value" },
  "spaces": [{ "kind":"interno","name":"Sala Grande","area_sqm":420,
               "capacities":{"tavoli_tondi":180,"in_piedi":300} }],
  "contacts": [{ "first_name":"","last_name":"","role":"","phone":"","email":"","company_name":"" }],
  "suppliers": [{ "company_name":"","category":"catering","requirement":"obbligatorio" }],
  "price_items": [{ "voce":"","prezzo":0,"unita":"","note":"" }],
  "open_questions": ["Chiedere potenza massima disponibile"],
  "field_sources": { "locations.technical.max_kw": "audio 02:47" }
}
```

Claude prompt requirements: extract ONLY stated facts, mark uncertain values in `open_questions`, output valid JSON via tool-use (strict schema), Italian field content.

## 6. Repo layout

```
venuescout/
  docs/SPEC.md
  render.yaml            # blueprint: backend + web + postgres
  backend/               # Fastify app (src/routes, src/db/schema.ts, src/ai/, drizzle/, tests)
  web/                   # Next.js 16 app
  ios/                   # XcodeGen project.yml + VenueScout/ Swift sources
```

## 7. Environment

Backend: `DATABASE_URL, ANTHROPIC_API_KEY, JWT_SECRET, S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, PORT`
Web: `NEXT_PUBLIC_API_URL`, iOS: `APIBaseURL` in Config.

## 8. Conventions

- IDs: uuid v7. Dates ISO 8601. Language of data/UI: Italian; code/comments: English.
- All AI writes are drafts requiring human apply (no silent mutations).
- Soft delete via `deleted_at` on locations, projects, companies, contacts.
