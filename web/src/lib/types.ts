// Domain types derived from docs/SPEC.md (§2–§5). All API payloads the web app consumes.

export type VisitStatus = "da_visitare" | "visitata";
/** Base visit_status plus the derived states (from event_locations, SPEC §2.4). */
export type EffectiveStatus = VisitStatus | "proposta" | "utilizzata";

export type Configuration =
  | "in_piedi"
  | "tavoli_tondi"
  | "tavolo_imperiale"
  | "platea"
  | "ferro_di_cavallo"
  | "classroom"
  | "cocktail";

export type EventLocationStatus =
  | "preselezionata"
  | "proposta"
  | "sopralluogo_fissato"
  | "in_valutazione"
  | "preferita"
  | "scartata"
  | "confermata"
  | "utilizzata";

export type QuoteStatus = "richiesto" | "ricevuto" | "accettato" | "rifiutato" | "scaduto";
export type AvailabilityStatus = "disponibile" | "opzionata" | "non_disponibile";
export type ProjectStatus = "attivo" | "chiuso" | "archiviato";
export type CompanyKind = "gestione" | "fornitore" | "entrambi";
export type Cooking = "fiamma" | "induzione" | "rigenerazione" | "no";

// ---- jsonb sections -------------------------------------------------------

export interface Logistics {
  auto?: string;
  pullman?: string;
  ztl?: { present?: boolean; hours?: string; permits?: string };
  stop_difficulty?: string;
  private_parking?: { spots?: number };
  nearby_parking?: { name: string; distance_m: number }[];
  notes?: string;
}

export interface Setup {
  furniture?: string;
  lights?: string;
  projections?: string;
  stage?: string;
  audio?: string;
  constraints?: string[];
}

export interface Party {
  indoor?: { allowed?: boolean; music_until?: string };
  outdoor?: { allowed?: boolean; music_until?: string };
  structural_constraints?: string[];
  db_limit?: number | string;
}

export interface Technical {
  max_kw?: number;
  generators?: boolean;
  aerial_ladder?: boolean;
  cooking?: Cooking;
  heavy_vehicle_access?: boolean;
  notes?: string;
}

export interface SpaceFeatures {
  foyer?: boolean;
  guardaroba?: boolean;
  bagni?: { count?: number; accessible?: boolean };
  cucina?: boolean;
  ascensore?: boolean;
  scale?: boolean;
  arredi?: string[];
}

// ---- smart tags -------------------------------------------------------------

export interface SmartTag {
  id: string;
  name: string;
  color?: string | null;
}

// ---- registry -------------------------------------------------------------

export interface Company {
  id: string;
  name: string;
  kind: CompanyKind;
  supplier_categories?: string[];
  vat_number?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  notes?: string | null;
}

export interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export interface CompanyDetail extends Company {
  contacts: { contact: Contact; role?: string | null }[];
  linked_locations?: { id: string; name: string; category?: string; requirement?: string }[];
}

export interface ContactDetail extends Contact {
  companies?: { company: Company; role?: string | null }[];
  linked_locations?: { id: string; name: string; role?: string }[];
}

// ---- locations ------------------------------------------------------------

export interface LocationBase {
  id: string;
  parent_location_id: string | null;
  name: string;
  slug?: string;
  summary?: string | null;
  address_line?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string;
  lng?: number | null;
  /** Alias di lng emesso dal backend (list/detail emettono lat, lon E lng). */
  lon?: number | null;
  lat?: number | null;
  /** GeoJSON point as returned by some backends. */
  geom?: { type: "Point"; coordinates: [number, number] } | null;
  google_maps_url?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  thumbnail_url?: string | null;
  visit_status: VisitStatus;
  logistics?: Logistics | null;
  setup?: Setup | null;
  party?: Party | null;
  technical?: Technical | null;
  accessibility_rating?: number | null;
  accessibility_notes?: string | null;
  availability_rules?: string | null;
  smart_tags?: string[];
  impressions?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface LocationListItem extends LocationBase {
  effective_status?: EffectiveStatus;
  max_capacity?: number | null;
  capacities?: Partial<Record<Configuration, number>>;
  parent_name?: string | null;
}

export interface Space {
  id: string;
  location_id: string;
  kind: "interno" | "esterno";
  name: string;
  area_sqm?: number | null;
  height_m?: number | null;
  covered?: "coperto" | "scoperto" | "copribile" | null;
  features?: SpaceFeatures | null;
  capacities: Partial<Record<Configuration, number>>;
  sort?: number;
}

export interface LocationContactEntry {
  contact: Contact;
  company?: Company | null;
  role: string;
}

export interface SupplierEntry {
  id: string;
  company: Company;
  contact?: Contact | null;
  category: string;
  requirement: "obbligatorio" | "consigliato";
  conditions?: string | null;
  rating?: number | null;
}

export type MediaKind = "foto" | "video" | "planimetria" | "documento" | "listino";
export type MediaCategory = "esterni" | "interni" | "sala" | "servizi" | "setup";

export interface Media {
  id: string;
  kind: MediaKind;
  category?: MediaCategory | null;
  space_id?: string | null;
  url?: string | null;
  filename?: string | null;
  mime?: string | null;
  created_at?: string;
}

export interface PriceListItem {
  voce: string;
  prezzo: number;
  unita?: string;
  note?: string;
  stagionalita?: string;
}

export interface PriceList {
  id: string;
  name: string;
  valid_from?: string | null;
  valid_to?: string | null;
  items: PriceListItem[];
  payment_terms?: { acconto_pct?: number; saldo?: string; metodi?: string[] } | null;
  extracted_by_ai?: boolean;
}

export interface LocationDetail extends LocationBase {
  parent?: { id: string; name: string } | null;
  children: LocationListItem[];
  effective_logistics?: Logistics | null;
  /** true when logistics is inherited from the parent location */
  logistics_inherited?: boolean;
  /** Contact fields resolved with parent fallback (if the API provides them). */
  effective_phone?: string | null;
  effective_email?: string | null;
  effective_website?: string | null;
  spaces: Space[];
  contacts: LocationContactEntry[];
  suppliers: SupplierEntry[];
  media: Media[];
  price_lists: PriceList[];
  usage_summary?: { proposta: number; utilizzata: number };
  effective_status?: EffectiveStatus;
  project_notes?: { project_name: string; event_name?: string; notes: string }[];
}

export interface UsageEntry {
  project: { id: string; name: string };
  event: { id: string; name: string; date_start?: string | null; date_end?: string | null };
  status: EventLocationStatus;
  dates?: string | null;
}

export interface HistoryEntry {
  id: string;
  date: string;
  type: "sopralluogo" | "evento" | "preventivo" | "feedback" | "nota" | "creazione";
  title: string;
  description?: string;
}

// ---- projects & events ----------------------------------------------------

export interface Project {
  id: string;
  name: string;
  client_name?: string | null;
  status: ProjectStatus;
  notes?: string | null;
  tags?: string[];
  created_at?: string;
  events_count?: number;
}

export interface EventItem {
  id: string;
  project_id: string;
  name: string;
  event_type?: string | null;
  date_start?: string | null;
  date_end?: string | null;
  pax?: number | null;
  brief?: string | null;
  notes?: string | null;
  tags?: string[];
  sort?: number;
}

export interface EventWithCounts extends EventItem {
  location_counts: Partial<Record<EventLocationStatus, number>>;
}

export interface ProjectDetail extends Project {
  events: EventWithCounts[];
}

export interface SiteVisit {
  id: string;
  scheduled_at: string;
  duration_min?: number | null;
  attendees?: string | null;
  with_client?: boolean;
  outcome?: string | null;
}

export interface Quote {
  id: string;
  amount: number;
  currency: string;
  status: QuoteStatus;
  received_at?: string | null;
  valid_until?: string | null;
  notes?: string | null;
}

export interface AvailabilitySlot {
  id: string;
  date: string;
  time_from?: string | null;
  time_to?: string | null;
  status: AvailabilityStatus;
  option_expires_at?: string | null;
  notes?: string | null;
}

export interface MatchReasons {
  matched: string[];
  unmatched: string[];
  to_verify: string[];
}

export interface EventLocationEntry {
  id: string;
  event_id: string;
  location: LocationListItem;
  status: EventLocationStatus;
  match_score?: number | null;
  match_reasons?: MatchReasons | null;
  client_feedback?: string | null;
  notes?: string | null;
  visits: SiteVisit[];
  quotes: Quote[];
  availability: AvailabilitySlot[];
}

export interface CompareMatrix {
  locations: { id: string; name: string; status: EventLocationStatus }[];
  rows: { label: string; values: (string | number | null)[] }[];
}

// ---- search ---------------------------------------------------------------

export type PoiKind = "hotel" | "aeroporto" | "stazione" | "monumento" | "altro";

export interface Poi {
  id: string;
  name: string;
  kind: PoiKind;
  lng: number;
  lat: number;
  address?: string | null;
  city?: string | null;
  notes?: string | null;
}

/** Row of GET /locations/:id/poi-distances (sorted by km on the backend). */
export interface PoiDistance {
  poi: Poi;
  km: number;
  minutes_car: number;
  /** true when the backend estimated the drive time (no routing provider). */
  estimated?: boolean;
}

export interface SearchResult {
  location: LocationListItem;
  score: number;
  reasons: MatchReasons;
  distances: { poi: string; km: number; minutes_car: number }[];
}

// ---- geocoding --------------------------------------------------------------

/** Structured params for GET /api/v1/geocode (better hit rate than plain q). */
export interface GeocodeParams {
  q?: string;
  name?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  province?: string;
}

/** Candidate returned by GET /api/v1/geocode?q=… */
export interface GeocodeCandidate {
  display_name: string;
  lat: number;
  lon: number;
  google_maps_url: string;
  type?: string;
  importance?: number;
}

// ---- ingestion (SPEC §5) --------------------------------------------------

export type IngestSourceType = "audio" | "testo" | "url" | "pdf" | "pptx" | "docx" | "immagine";
export type IngestStatus = "pending" | "processing" | "ready" | "applied" | "failed";

export interface ExtractedDraft {
  confidence: number;
  location?: Record<string, unknown>;
  spaces?: {
    kind?: string;
    name: string;
    area_sqm?: number;
    capacities?: Partial<Record<Configuration, number>>;
  }[];
  contacts?: {
    first_name?: string;
    last_name?: string;
    role?: string;
    phone?: string;
    email?: string;
    company_name?: string;
  }[];
  suppliers?: { company_name: string; category?: string; requirement?: string }[];
  price_items?: PriceListItem[];
  /** Foto individuate sulla pagina sorgente; importabili via selected_media_urls. */
  proposed_media?: { url: string }[];
  open_questions?: string[];
  field_sources?: Record<string, string>;
}

export interface IngestionJob {
  id: string;
  location_id?: string | null;
  source_type: IngestSourceType;
  source_url?: string | null;
  status: IngestStatus;
  extracted?: ExtractedDraft | null;
  error?: string | null;
  created_at: string;
  applied_location_id?: string | null;
}

// ---- misc -----------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "editor" | "viewer";
}

export interface MapFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    id: string;
    name: string;
    kind?: "location" | "poi";
    status?: string;
    event_name?: string;
    city?: string;
  };
}

export interface MapFeatureCollection {
  type: "FeatureCollection";
  features: MapFeature[];
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; per_page: number; total: number };
}

export interface LocationFilters {
  q?: string;
  city?: string;
  tag?: string;
  status?: EffectiveStatus | "";
  min_capacity?: number;
  configuration?: Configuration | "";
  root_only?: boolean;
}

/** Resolve [lng,lat] from either flat fields (lng or lon alias) or GeoJSON geom. */
export function lngLatOf(loc: LocationBase): [number, number] | null {
  const lng = typeof loc.lng === "number" ? loc.lng : typeof loc.lon === "number" ? loc.lon : null;
  if (lng != null && typeof loc.lat === "number") return [lng, loc.lat];
  if (loc.geom?.coordinates) return loc.geom.coordinates;
  return null;
}
