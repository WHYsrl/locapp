# VenueScout (locapp)

Piattaforma per censire, ricercare e proporre location per eventi. Monorepo:

| Cartella | Contenuto | Stato |
|---|---|---|
| `backend/` | API Fastify 5 + TypeScript, Drizzle ORM, Postgres (PostGIS + pgvector), Claude API (`claude-sonnet-5` / `claude-haiku-4-5`) | ✅ build + 44 test verdi |
| `web/` | Next.js 16.2 LTS, Tailwind 4, MapLibre. Modalità demo integrata (funziona senza backend) | ✅ build verde |
| `ios/` | App SwiftUI iOS 26 (iPhone 15 Pro+), SpeechAnalyzer per trascrizione offline, Foundation Models on-device, MapKit | ⚠️ da compilare in Xcode 26 (vedi `ios/README.md`) |
| `docs/SPEC.md` | Contratto vincolante: modello dati, API, formato estrazione AI | — |
| `render.yaml` | Blueprint Render: api + web + Postgres | — |

## Requisiti coperti (incluse le aggiunte di luglio 2026)

- Progetto → più eventi, ognuno con la propria shortlist di location (stati, sopralluoghi, preventivi, disponibilità, feedback cliente)
- Ingestion AI da: voce (trascritta on-device su iPhone), testo, foto, PDF/PPTX/DOCX e **link web**; sempre come bozza da rivedere campo per campo
- Separazione info **base** della location vs info **specifiche** di progetto/evento (`event_locations`, `location_project_notes`)
- Mappa GeoJSON per progetto e per evento con tutte le location selezionate
- Stati location: da visitare / visitata (base) + **proposta / utilizzata derivati** dagli eventi, con elenco progetti/eventi e date (`GET /locations/:id/usage`)
- Location annidate (ristorante/sala dentro hotel) con ereditarietà di indirizzo e logistica
- Anagrafiche centralizzate riusabili: società, referenti per ruolo, fornitori con referente per location

## Avvio rapido in locale

```bash
# Backend (serve un Postgres con PostGIS; oppure usa subito la demo web)
cd backend && cp .env.example .env && npm ci && npm run build && npm run migrate && npm start

# Web (senza backend: parte in modalità demo con dati finti)
cd web && npm ci && npm run dev

# iOS
cd ios && brew install xcodegen && xcodegen generate && open VenueScout.xcodeproj
```

## Deploy su Render

1. Push del repo su GitHub (vedi sotto)
2. Render Dashboard → **Blueprints → New Blueprint Instance** → seleziona questo repo: crea `venuescout-api`, `venuescout-web` e il Postgres
3. Imposta a mano in dashboard: `ANTHROPIC_API_KEY` e le variabili `S3_*` (Cloudflare R2 o altro S3-compatibile per i media)
4. Sul database, le estensioni (postgis, vector, pg_trgm) vengono create dalla prima migrazione

Credenziali seed: `admin@venuescout.it` / `venuescout-admin` — **da cambiare subito**.

## Prossimi passi suggeriti

1. Compilazione iOS in Xcode 26 (rischi noti e localizzati: nomi esatti API SpeechAnalyzer/FoundationModels — vedi report in `ios/README.md`)
2. Collegare web ↔ backend su Render e caricare le prime location reali via `/ingest`
3. Fase 3: generatore presentazioni clienti (endpoint già stubbato: `POST /events/:id/proposal`)
