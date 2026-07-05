import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import { geometryPoint, vector } from './types.js';

const pk = () => uuid('id').primaryKey().$defaultFn(() => uuidv7());
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).defaultNow().notNull();
const deletedAt = () => timestamp('deleted_at', { withTimezone: true });

// ---- enum-like unions (enforced as CHECK constraints in SQL migrations) ----
export type CompanyKind = 'gestione' | 'fornitore' | 'entrambi';
export type VisitStatus = 'da_visitare' | 'visitata';
export type SpaceKind = 'interno' | 'esterno';
export type CoveredKind = 'coperto' | 'scoperto' | 'copribile';
export type CapacityConfiguration =
  | 'in_piedi'
  | 'tavoli_tondi'
  | 'tavolo_imperiale'
  | 'platea'
  | 'ferro_di_cavallo'
  | 'classroom'
  | 'cocktail';
export type SupplierRequirement = 'obbligatorio' | 'consigliato';
export type MediaKind = 'foto' | 'video' | 'planimetria' | 'documento' | 'listino';
export type PoiKind = 'hotel' | 'aeroporto' | 'stazione' | 'monumento' | 'altro';
export type ProjectStatus = 'attivo' | 'chiuso' | 'archiviato';
export type EventLocationStatus =
  | 'preselezionata'
  | 'proposta'
  | 'sopralluogo_fissato'
  | 'in_valutazione'
  | 'preferita'
  | 'scartata'
  | 'confermata'
  | 'utilizzata';
export type QuoteStatus = 'richiesto' | 'ricevuto' | 'accettato' | 'rifiutato' | 'scaduto';
export type AvailabilityStatus = 'disponibile' | 'opzionata' | 'non_disponibile';
export type FeedbackSubjectType = 'location' | 'company' | 'contact';
export type IngestionSourceType = 'audio' | 'testo' | 'url' | 'pdf' | 'pptx' | 'docx' | 'immagine';
export type IngestionStatus = 'pending' | 'processing' | 'ready' | 'applied' | 'failed';
export type UserRole = 'admin' | 'editor' | 'viewer';

export interface Logistics {
  auto?: string | null;
  pullman?: string | null;
  ztl?: { present?: boolean; hours?: string; permits?: string } | null;
  stop_difficulty?: string | null;
  private_parking?: { spots?: number } | null;
  nearby_parking?: Array<{ name?: string; distance_m?: number }> | null;
  notes?: string | null;
}

// ---- people & companies ----
export const companies = pgTable('companies', {
  id: pk(),
  name: text('name').notNull(),
  kind: text('kind').$type<CompanyKind>().notNull().default('fornitore'),
  supplierCategories: text('supplier_categories').array(),
  vatNumber: text('vat_number'),
  email: text('email'),
  phone: text('phone'),
  website: text('website'),
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt(),
});

export const contacts = pgTable('contacts', {
  id: pk(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email'),
  phone: text('phone'),
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt(),
});

export const companyContacts = pgTable(
  'company_contacts',
  {
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default(''),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.contactId, t.role] })],
);

// ---- locations ----
export const locations = pgTable(
  'locations',
  {
    id: pk(),
    parentLocationId: uuid('parent_location_id').references((): AnyPgColumn => locations.id),
    name: text('name').notNull(),
    slug: text('slug'),
    summary: text('summary'),
    addressLine: text('address_line'),
    city: text('city'),
    province: text('province'),
    postalCode: text('postal_code'),
    country: text('country').notNull().default('IT'),
    geom: geometryPoint('geom'),
    googleMapsUrl: text('google_maps_url'),
    thumbnailUrl: text('thumbnail_url'),
    visitStatus: text('visit_status').$type<VisitStatus>().notNull().default('da_visitare'),
    logistics: jsonb('logistics').$type<Logistics>(),
    setup: jsonb('setup').$type<Record<string, unknown>>(),
    party: jsonb('party').$type<Record<string, unknown>>(),
    technical: jsonb('technical').$type<Record<string, unknown>>(),
    accessibilityRating: integer('accessibility_rating'),
    accessibilityNotes: text('accessibility_notes'),
    availabilityRules: text('availability_rules'),
    smartTags: text('smart_tags').array(),
    impressions: text('impressions'),
    embedding: vector('embedding', 1024),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex('locations_slug_uq').on(t.slug),
    index('locations_geom_gist').using('gist', t.geom),
    index('locations_name_trgm').using('gin', sql`${t.name} gin_trgm_ops`),
    index('locations_embedding_hnsw').using('hnsw', sql`${t.embedding} vector_cosine_ops`),
    index('locations_parent_idx').on(t.parentLocationId),
    index('locations_city_idx').on(t.city),
  ],
);

export const spaces = pgTable(
  'spaces',
  {
    id: pk(),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<SpaceKind>().notNull(),
    name: text('name').notNull(),
    areaSqm: numeric('area_sqm'),
    heightM: numeric('height_m'),
    covered: text('covered').$type<CoveredKind>(),
    features: jsonb('features').$type<Record<string, unknown>>(),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [index('spaces_location_idx').on(t.locationId)],
);

export const spaceCapacities = pgTable(
  'space_capacities',
  {
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    configuration: text('configuration').$type<CapacityConfiguration>().notNull(),
    capacity: integer('capacity').notNull(),
  },
  (t) => [primaryKey({ columns: [t.spaceId, t.configuration] })],
);

export const locationContacts = pgTable(
  'location_contacts',
  {
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id').references(() => companies.id),
    role: text('role').notNull().default(''),
  },
  (t) => [primaryKey({ columns: [t.locationId, t.contactId, t.role] })],
);

export const locationSuppliers = pgTable(
  'location_suppliers',
  {
    id: pk(),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id),
    contactId: uuid('contact_id').references(() => contacts.id),
    category: text('category').notNull(),
    requirement: text('requirement').$type<SupplierRequirement>().notNull().default('consigliato'),
    conditions: text('conditions'),
    rating: numeric('rating'),
  },
  (t) => [index('location_suppliers_location_idx').on(t.locationId)],
);

export const media = pgTable(
  'media',
  {
    id: pk(),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    spaceId: uuid('space_id').references(() => spaces.id),
    kind: text('kind').$type<MediaKind>().notNull(),
    category: text('category'),
    url: text('url').notNull(),
    filename: text('filename'),
    mime: text('mime'),
    aiTags: text('ai_tags').array(),
    createdAt: createdAt(),
  },
  (t) => [index('media_location_idx').on(t.locationId)],
);

export const priceLists = pgTable(
  'price_lists',
  {
    id: pk(),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    sourceMediaId: uuid('source_media_id').references(() => media.id),
    name: text('name').notNull(),
    validFrom: date('valid_from'),
    validTo: date('valid_to'),
    items: jsonb('items').$type<Array<Record<string, unknown>>>(),
    paymentTerms: jsonb('payment_terms').$type<Record<string, unknown>>(),
    extractedByAi: boolean('extracted_by_ai').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('price_lists_location_idx').on(t.locationId)],
);

export const pois = pgTable(
  'pois',
  {
    id: pk(),
    name: text('name').notNull(),
    kind: text('kind').$type<PoiKind>().notNull().default('altro'),
    geom: geometryPoint('geom'),
  },
  (t) => [index('pois_geom_gist').using('gist', t.geom)],
);

// ---- smart tags registry (shared, referenced by name from tag arrays) ----
export const smartTags = pgTable('smart_tags', {
  id: pk(),
  name: text('name').notNull().unique(),
  color: text('color'),
  createdAt: createdAt(),
});

// ---- projects & events ----
export const projects = pgTable('projects', {
  id: pk(),
  name: text('name').notNull(),
  clientName: text('client_name'),
  status: text('status').$type<ProjectStatus>().notNull().default('attivo'),
  tags: text('tags').array(),
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt(),
});

export const events = pgTable(
  'events',
  {
    id: pk(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    eventType: text('event_type'),
    dateStart: date('date_start'),
    dateEnd: date('date_end'),
    pax: integer('pax'),
    brief: text('brief'),
    notes: text('notes'),
    tags: text('tags').array(),
    sort: integer('sort').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('events_project_idx').on(t.projectId)],
);

export const eventLocations = pgTable(
  'event_locations',
  {
    id: pk(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    status: text('status').$type<EventLocationStatus>().notNull().default('preselezionata'),
    matchScore: numeric('match_score'),
    matchReasons: jsonb('match_reasons').$type<Record<string, unknown>>(),
    clientFeedback: text('client_feedback'),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('event_locations_event_location_uq').on(t.eventId, t.locationId),
    index('event_locations_location_idx').on(t.locationId),
  ],
);

export const siteVisits = pgTable(
  'site_visits',
  {
    id: pk(),
    eventLocationId: uuid('event_location_id')
      .notNull()
      .references(() => eventLocations.id, { onDelete: 'cascade' }),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    durationMin: integer('duration_min'),
    attendees: text('attendees'),
    withClient: boolean('with_client').notNull().default(false),
    outcome: text('outcome'),
    createdAt: createdAt(),
  },
  (t) => [index('site_visits_el_idx').on(t.eventLocationId)],
);

export const quotes = pgTable(
  'quotes',
  {
    id: pk(),
    eventLocationId: uuid('event_location_id')
      .notNull()
      .references(() => eventLocations.id, { onDelete: 'cascade' }),
    amount: numeric('amount'),
    currency: text('currency').notNull().default('EUR'),
    status: text('status').$type<QuoteStatus>().notNull().default('richiesto'),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    validUntil: date('valid_until'),
    mediaId: uuid('media_id').references(() => media.id),
    notes: text('notes'),
  },
  (t) => [index('quotes_el_idx').on(t.eventLocationId)],
);

export const availabilitySlots = pgTable(
  'availability_slots',
  {
    id: pk(),
    eventLocationId: uuid('event_location_id')
      .notNull()
      .references(() => eventLocations.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    timeFrom: time('time_from'),
    timeTo: time('time_to'),
    status: text('status').$type<AvailabilityStatus>().notNull().default('disponibile'),
    optionExpiresAt: date('option_expires_at'),
    notes: text('notes'),
  },
  (t) => [index('availability_slots_el_idx').on(t.eventLocationId)],
);

export const locationProjectNotes = pgTable(
  'location_project_notes',
  {
    id: pk(),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').references(() => events.id),
    overrides: jsonb('overrides').$type<Record<string, unknown>>(),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('lpn_location_idx').on(t.locationId), index('lpn_project_idx').on(t.projectId)],
);

export const postEventFeedback = pgTable(
  'post_event_feedback',
  {
    id: pk(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    subjectType: text('subject_type').$type<FeedbackSubjectType>().notNull(),
    subjectId: uuid('subject_id').notNull(),
    ratings: jsonb('ratings').$type<Record<string, number>>(),
    notes: text('notes'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    index('pef_event_idx').on(t.eventId),
    index('pef_subject_idx').on(t.subjectType, t.subjectId),
  ],
);

export const ingestionJobs = pgTable('ingestion_jobs', {
  id: pk(),
  locationId: uuid('location_id').references(() => locations.id),
  sourceType: text('source_type').$type<IngestionSourceType>().notNull(),
  sourceUrl: text('source_url'),
  sourceMediaId: uuid('source_media_id').references(() => media.id),
  rawText: text('raw_text'),
  status: text('status').$type<IngestionStatus>().notNull().default('pending'),
  extracted: jsonb('extracted').$type<Record<string, unknown>>(),
  error: text('error'),
  createdAt: createdAt(),
  appliedAt: timestamp('applied_at', { withTimezone: true }),
});

export const users = pgTable('users', {
  id: pk(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').$type<UserRole>().notNull().default('viewer'),
  createdAt: createdAt(),
});

// ---- inferred row types ----
export type CompanyRow = typeof companies.$inferSelect;
export type ContactRow = typeof contacts.$inferSelect;
export type LocationRow = typeof locations.$inferSelect;
export type SpaceRow = typeof spaces.$inferSelect;
export type SpaceCapacityRow = typeof spaceCapacities.$inferSelect;
export type LocationContactRow = typeof locationContacts.$inferSelect;
export type LocationSupplierRow = typeof locationSuppliers.$inferSelect;
export type MediaRow = typeof media.$inferSelect;
export type PriceListRow = typeof priceLists.$inferSelect;
export type PoiRow = typeof pois.$inferSelect;
export type SmartTagRow = typeof smartTags.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type EventLocationRow = typeof eventLocations.$inferSelect;
export type SiteVisitRow = typeof siteVisits.$inferSelect;
export type QuoteRow = typeof quotes.$inferSelect;
export type AvailabilitySlotRow = typeof availabilitySlots.$inferSelect;
export type LocationProjectNoteRow = typeof locationProjectNotes.$inferSelect;
export type PostEventFeedbackRow = typeof postEventFeedback.$inferSelect;
export type IngestionJobRow = typeof ingestionJobs.$inferSelect;
export type UserRow = typeof users.$inferSelect;
