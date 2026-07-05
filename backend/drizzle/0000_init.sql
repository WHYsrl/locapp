-- VenueScout initial schema (SPEC.md §3)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'fornitore' CHECK (kind IN ('gestione','fornitore','entrambi')),
  supplier_categories text[],
  vat_number text,
  email text,
  phone text,
  website text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS company_contacts (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT '',
  PRIMARY KEY (company_id, contact_id, role)
);

CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_location_id uuid REFERENCES locations(id),
  name text NOT NULL,
  slug text,
  summary text,
  address_line text,
  city text,
  province text,
  postal_code text,
  country text NOT NULL DEFAULT 'IT',
  geom geometry(Point,4326),
  google_maps_url text,
  thumbnail_url text,
  visit_status text NOT NULL DEFAULT 'da_visitare' CHECK (visit_status IN ('da_visitare','visitata')),
  logistics jsonb,
  setup jsonb,
  party jsonb,
  technical jsonb,
  accessibility_rating int CHECK (accessibility_rating BETWEEN 1 AND 5),
  accessibility_notes text,
  availability_rules text,
  smart_tags text[],
  impressions text,
  embedding vector(1024),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS locations_slug_uq ON locations (slug);
CREATE INDEX IF NOT EXISTS locations_geom_gist ON locations USING gist (geom);
CREATE INDEX IF NOT EXISTS locations_name_trgm ON locations USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS locations_embedding_hnsw ON locations USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS locations_parent_idx ON locations (parent_location_id);
CREATE INDEX IF NOT EXISTS locations_city_idx ON locations (city);

CREATE TABLE IF NOT EXISTS spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('interno','esterno')),
  name text NOT NULL,
  area_sqm numeric,
  height_m numeric,
  covered text CHECK (covered IN ('coperto','scoperto','copribile')),
  features jsonb,
  sort int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS spaces_location_idx ON spaces (location_id);

CREATE TABLE IF NOT EXISTS space_capacities (
  space_id uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  configuration text NOT NULL CHECK (configuration IN
    ('in_piedi','tavoli_tondi','tavolo_imperiale','platea','ferro_di_cavallo','classroom','cocktail')),
  capacity int NOT NULL,
  PRIMARY KEY (space_id, configuration)
);

CREATE TABLE IF NOT EXISTS location_contacts (
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id),
  role text NOT NULL DEFAULT '',
  PRIMARY KEY (location_id, contact_id, role)
);

CREATE TABLE IF NOT EXISTS location_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id),
  contact_id uuid REFERENCES contacts(id),
  category text NOT NULL,
  requirement text NOT NULL DEFAULT 'consigliato' CHECK (requirement IN ('obbligatorio','consigliato')),
  conditions text,
  rating numeric
);
CREATE INDEX IF NOT EXISTS location_suppliers_location_idx ON location_suppliers (location_id);

CREATE TABLE IF NOT EXISTS media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  space_id uuid REFERENCES spaces(id),
  kind text NOT NULL CHECK (kind IN ('foto','video','planimetria','documento','listino')),
  category text,
  url text NOT NULL,
  filename text,
  mime text,
  ai_tags text[],
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_location_idx ON media (location_id);

CREATE TABLE IF NOT EXISTS price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  source_media_id uuid REFERENCES media(id),
  name text NOT NULL,
  valid_from date,
  valid_to date,
  items jsonb,
  payment_terms jsonb,
  extracted_by_ai boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS price_lists_location_idx ON price_lists (location_id);

CREATE TABLE IF NOT EXISTS pois (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'altro' CHECK (kind IN ('hotel','aeroporto','stazione','monumento','altro')),
  geom geometry(Point,4326)
);
CREATE INDEX IF NOT EXISTS pois_geom_gist ON pois USING gist (geom);

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  client_name text,
  status text NOT NULL DEFAULT 'attivo' CHECK (status IN ('attivo','chiuso','archiviato')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  event_type text,
  date_start date,
  date_end date,
  pax int,
  brief text,
  notes text,
  sort int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_project_idx ON events (project_id);

CREATE TABLE IF NOT EXISTS event_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'preselezionata' CHECK (status IN
    ('preselezionata','proposta','sopralluogo_fissato','in_valutazione','preferita','scartata','confermata','utilizzata')),
  match_score numeric,
  match_reasons jsonb,
  client_feedback text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, location_id)
);
CREATE INDEX IF NOT EXISTS event_locations_location_idx ON event_locations (location_id);

CREATE TABLE IF NOT EXISTS site_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_location_id uuid NOT NULL REFERENCES event_locations(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  duration_min int,
  attendees text,
  with_client boolean NOT NULL DEFAULT false,
  outcome text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS site_visits_el_idx ON site_visits (event_location_id);

CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_location_id uuid NOT NULL REFERENCES event_locations(id) ON DELETE CASCADE,
  amount numeric,
  currency text NOT NULL DEFAULT 'EUR',
  status text NOT NULL DEFAULT 'richiesto' CHECK (status IN ('richiesto','ricevuto','accettato','rifiutato','scaduto')),
  received_at timestamptz,
  valid_until date,
  media_id uuid REFERENCES media(id),
  notes text
);
CREATE INDEX IF NOT EXISTS quotes_el_idx ON quotes (event_location_id);

CREATE TABLE IF NOT EXISTS availability_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_location_id uuid NOT NULL REFERENCES event_locations(id) ON DELETE CASCADE,
  date date NOT NULL,
  time_from time,
  time_to time,
  status text NOT NULL DEFAULT 'disponibile' CHECK (status IN ('disponibile','opzionata','non_disponibile')),
  option_expires_at date,
  notes text
);
CREATE INDEX IF NOT EXISTS availability_slots_el_idx ON availability_slots (event_location_id);

CREATE TABLE IF NOT EXISTS location_project_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id),
  overrides jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lpn_location_idx ON location_project_notes (location_id);
CREATE INDEX IF NOT EXISTS lpn_project_idx ON location_project_notes (project_id);

CREATE TABLE IF NOT EXISTS post_event_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('location','company','contact')),
  subject_id uuid NOT NULL,
  ratings jsonb,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pef_event_idx ON post_event_feedback (event_id);
CREATE INDEX IF NOT EXISTS pef_subject_idx ON post_event_feedback (subject_type, subject_id);

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES locations(id),
  source_type text NOT NULL CHECK (source_type IN ('audio','testo','url','pdf','pptx','docx','immagine')),
  source_url text,
  source_media_id uuid REFERENCES media(id),
  raw_text text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','applied','failed')),
  extracted jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','editor','viewer')),
  created_at timestamptz NOT NULL DEFAULT now()
);
