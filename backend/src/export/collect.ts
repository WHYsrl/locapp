/**
 * Export data collection: assembles a normalized, serializable snapshot of a
 * location / event / project that the copywriter (AI or fallback) and the
 * Google Slides builder consume. Pure repo reads — no outbound HTTP here.
 */
import type { Repos } from '../db/repos/index.js';
import type { StorageService } from '../storage/s3.js';
import { notFound } from '../lib/errors.js';
import { haversineKm } from '../lib/geo.js';

export type ExportKind = 'location' | 'event' | 'project';

export interface ExportInclude {
  photos: boolean;
  capacities: boolean;
  distances: boolean;
  prices: boolean;
  ai_texts: boolean;
}

export interface ExportCapacity {
  configuration: string;
  capacity: number;
}

export interface ExportSpace {
  name: string;
  kind: string;
  area_sqm: string | null;
  height_m: string | null;
  covered: string | null;
  capacities: ExportCapacity[];
}

export interface ExportPoiDistance {
  poi_name: string;
  poi_kind: string;
  km: number;
  minutes_car: number;
  estimated: boolean;
  /** POI coordinates (markers/routes on the export static map). */
  lon: number | null;
  lat: number | null;
}

/** A photo reference before URL resolution: `source` is an S3 key or an absolute URL. */
export interface ExportPhoto {
  media_id: string;
  source: string;
}

export interface ExportLocationCard {
  id: string;
  name: string;
  summary: string | null;
  address_line: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  google_maps_url: string | null;
  visit_status: string | null;
  logistics: Record<string, unknown> | null;
  setup: Record<string, unknown> | null;
  party: Record<string, unknown> | null;
  technical: Record<string, unknown> | null;
  accessibility_rating: number | null;
  accessibility_notes: string | null;
  availability_rules: string | null;
  smart_tags: string[] | null;
  impressions: string | null;
  has_geom: boolean;
  /** Location coordinates when known (origin of the POI route map). */
  geo: { lon: number; lat: number } | null;
  spaces: ExportSpace[];
  contacts: Array<{ name: string; role: string; phone: string | null; email: string | null }>;
  suppliers: Array<{ company_name: string; category: string; requirement: string }>;
  price_lists?: Array<{ name: string; items: Array<Record<string, unknown>> }>;
  photos: ExportPhoto[];
  /** Filled by resolveExportImages (presigned GET / absolute URLs). */
  photo_urls: string[];
  /** Filled by resolveExportImages (absolute public map-thumb route). */
  map_url: string | null;
  /** Filled by resolvePoiMaps (Google Static Map with route polylines). */
  poi_map_url: string | null;
  poi_distances?: ExportPoiDistance[];
}

export interface ExportShortlistVenue {
  event_location_id: string;
  location_id: string;
  name: string;
  city: string | null;
  summary: string | null;
  status: string;
  match_score: string | null;
  notes: string | null;
  has_geom: boolean;
  /** Venue coordinates when known (origin of the POI route map). */
  geo: { lon: number; lat: number } | null;
  capacities?: ExportCapacity[];
  quotes?: Array<{ amount: string | null; currency: string; status: string }>;
  poi_distances?: ExportPoiDistance[];
  photos: ExportPhoto[];
  photo_urls: string[];
  map_url: string | null;
  /** Filled by resolvePoiMaps (Google Static Map with route polylines). */
  poi_map_url: string | null;
}

export interface ExportEvent {
  id: string;
  name: string;
  event_type: string | null;
  date_start: string | null;
  date_end: string | null;
  pax: number | null;
  brief: string | null;
  notes: string | null;
  project: { id: string; name: string; client_name: string | null; status: string };
  shortlist: ExportShortlistVenue[];
}

export interface ExportProject {
  id: string;
  name: string;
  client_name: string | null;
  status: string;
  notes: string | null;
  events: Array<{
    id: string;
    name: string;
    event_type: string | null;
    date_start: string | null;
    date_end: string | null;
    pax: number | null;
    shortlist: ExportShortlistVenue[];
  }>;
}

export type ExportData =
  | { kind: 'location'; location: ExportLocationCard }
  | { kind: 'event'; event: ExportEvent }
  | { kind: 'project'; project: ExportProject };

/** Max photos on a full location card / per shortlist venue. */
const CARD_PHOTO_CAP = 6;
const VENUE_PHOTO_CAP = 1;

/** Fallback estimate (same as /locations/:id/poi-distances): extra-urban 50 km/h. */
const estimatedMinutes = (km: number): number => Math.round((km / 50) * 60);
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Shortlist ordering: preferred/confirmed/used venues lead the deck. */
const STATUS_RANK: Record<string, number> = {
  utilizzata: 0,
  confermata: 1,
  preferita: 2,
  in_valutazione: 3,
  sopralluogo_fissato: 4,
  proposta: 5,
  preselezionata: 6,
};

type PoiRow = { name: string; kind: string; lon: number | null; lat: number | null };

function poiDistancesFrom(
  origin: { lon: number; lat: number } | null,
  pois: PoiRow[],
): ExportPoiDistance[] {
  if (!origin) return [];
  return pois
    .filter((p) => p.lon != null && p.lat != null)
    .map((p) => {
      const km = haversineKm(origin, { lon: p.lon!, lat: p.lat! });
      return {
        poi_name: p.name,
        poi_kind: p.kind,
        km: round1(km),
        minutes_car: estimatedMinutes(km),
        estimated: true,
        lon: p.lon,
        lat: p.lat,
      };
    })
    .sort((a, b) => a.km - b.km);
}

const photoRefs = (
  mediaRows: Array<{ id: string; kind: string; url: string }>,
  cap: number,
): ExportPhoto[] =>
  mediaRows
    .filter((m) => m.kind === 'foto')
    .slice(0, cap)
    .map((m) => ({ media_id: m.id, source: m.url }));

function aggregateCapacities(
  rows: Array<{ locationId: string; configuration: string; capacity: number }>,
): Map<string, ExportCapacity[]> {
  const byLocation = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const configs = byLocation.get(r.locationId) ?? new Map<string, number>();
    configs.set(r.configuration, Math.max(configs.get(r.configuration) ?? 0, r.capacity));
    byLocation.set(r.locationId, configs);
  }
  const out = new Map<string, ExportCapacity[]>();
  for (const [locationId, configs] of byLocation) {
    out.set(
      locationId,
      [...configs.entries()].map(([configuration, capacity]) => ({ configuration, capacity })),
    );
  }
  return out;
}

async function collectShortlist(
  repos: Repos,
  eventId: string,
  include: ExportInclude,
  pois: PoiRow[],
): Promise<ExportShortlistVenue[]> {
  const rows = await repos.projects.listEventLocations(eventId);
  const kept = rows
    .filter((r) => r.status !== 'scartata')
    .sort((a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9));

  const capacityByLocation = include.capacities
    ? aggregateCapacities(await repos.locations.capacitiesForLocations(kept.map((r) => r.locationId)))
    : new Map<string, ExportCapacity[]>();
  const quoteRows = include.prices ? await repos.projects.listQuotes(kept.map((r) => r.id)) : [];

  const venues: ExportShortlistVenue[] = [];
  for (const row of kept) {
    const location = await repos.locations.getById(row.locationId);
    const mediaRows = include.photos ? await repos.locations.listMedia(row.locationId) : [];
    const origin = row.lon != null && row.lat != null ? { lon: row.lon, lat: row.lat } : null;
    const venue: ExportShortlistVenue = {
      event_location_id: row.id,
      location_id: row.locationId,
      name: row.locationName,
      city: row.locationCity ?? location?.city ?? null,
      summary: location?.summary ?? null,
      status: row.status,
      match_score: row.matchScore ?? null,
      notes: row.notes ?? null,
      has_geom: origin != null,
      geo: origin,
      photos: photoRefs(mediaRows, VENUE_PHOTO_CAP),
      photo_urls: [],
      map_url: null,
      poi_map_url: null,
    };
    if (include.capacities) venue.capacities = capacityByLocation.get(row.locationId) ?? [];
    if (include.prices) {
      venue.quotes = quoteRows
        .filter((q) => q.eventLocationId === row.id)
        .map((q) => ({ amount: q.amount, currency: q.currency, status: q.status }));
    }
    if (include.distances) venue.poi_distances = poiDistancesFrom(origin, pois);
    venues.push(venue);
  }
  return venues;
}

async function listPoisIfNeeded(repos: Repos, include: ExportInclude): Promise<PoiRow[]> {
  if (!include.distances) return [];
  return (await repos.registry.listPois()) as PoiRow[];
}

export async function collectExportData(
  repos: Repos,
  kind: ExportKind,
  id: string,
  include: ExportInclude,
): Promise<ExportData> {
  if (kind === 'location') {
    const location = await repos.locations.getById(id);
    if (!location) throw notFound('Location');
    const [relations, coords, pois] = await Promise.all([
      repos.locations.getRelations(id),
      repos.locations.coordinates([id]),
      listPoisIfNeeded(repos, include),
    ]);
    const capsBySpace = new Map<string, ExportCapacity[]>();
    for (const c of relations.capacityRows) {
      const list = capsBySpace.get(c.spaceId) ?? [];
      list.push({ configuration: c.configuration, capacity: c.capacity });
      capsBySpace.set(c.spaceId, list);
    }
    const coord = coords[0];
    const origin = coord?.lon != null && coord.lat != null ? { lon: coord.lon, lat: coord.lat } : null;

    const card: ExportLocationCard = {
      id: location.id,
      name: location.name,
      summary: location.summary,
      address_line: location.addressLine,
      city: location.city,
      province: location.province,
      country: location.country,
      phone: location.phone,
      email: location.email,
      website: location.website,
      google_maps_url: location.googleMapsUrl,
      visit_status: location.visitStatus,
      logistics: (location.logistics ?? null) as Record<string, unknown> | null,
      setup: location.setup ?? null,
      party: location.party ?? null,
      technical: location.technical ?? null,
      accessibility_rating: location.accessibilityRating,
      accessibility_notes: location.accessibilityNotes,
      availability_rules: location.availabilityRules,
      smart_tags: location.smartTags,
      impressions: location.impressions,
      has_geom: origin != null,
      geo: origin,
      spaces: relations.spaceRows.map((s) => ({
        name: s.name,
        kind: s.kind,
        area_sqm: s.areaSqm,
        height_m: s.heightM,
        covered: s.covered,
        capacities: include.capacities ? (capsBySpace.get(s.id) ?? []) : [],
      })),
      contacts: relations.contactRows.map((c) => ({
        name: `${c.firstName} ${c.lastName}`.trim(),
        role: c.role,
        phone: c.phone,
        email: c.email,
      })),
      suppliers: relations.supplierRows.map((s) => ({
        company_name: s.companyName,
        category: s.category,
        requirement: s.requirement,
      })),
      photos: include.photos ? photoRefs(relations.mediaRows, CARD_PHOTO_CAP) : [],
      photo_urls: [],
      map_url: null,
      poi_map_url: null,
    };
    if (include.prices) {
      card.price_lists = relations.priceListRows.map((p) => ({ name: p.name, items: p.items ?? [] }));
    }
    if (include.distances) card.poi_distances = poiDistancesFrom(origin, pois);
    return { kind, location: card };
  }

  if (kind === 'event') {
    const event = await repos.projects.getEvent(id);
    if (!event) throw notFound('Event');
    const project = await repos.projects.getById(event.projectId);
    const pois = await listPoisIfNeeded(repos, include);
    return {
      kind,
      event: {
        id: event.id,
        name: event.name,
        event_type: event.eventType,
        date_start: event.dateStart,
        date_end: event.dateEnd,
        pax: event.pax,
        brief: event.brief,
        notes: event.notes,
        project: {
          id: project?.id ?? event.projectId,
          name: project?.name ?? '',
          client_name: project?.clientName ?? null,
          status: project?.status ?? 'attivo',
        },
        shortlist: await collectShortlist(repos, event.id, include, pois),
      },
    };
  }

  const project = await repos.projects.getById(id);
  if (!project) throw notFound('Project');
  const [eventRows, pois] = await Promise.all([
    repos.projects.listEvents(id),
    listPoisIfNeeded(repos, include),
  ]);
  const eventExports = [];
  for (const e of eventRows) {
    eventExports.push({
      id: e.id,
      name: e.name,
      event_type: e.eventType,
      date_start: e.dateStart,
      date_end: e.dateEnd,
      pax: e.pax,
      shortlist: await collectShortlist(repos, e.id, include, pois),
    });
  }
  return {
    kind: 'project',
    project: {
      id: project.id,
      name: project.name,
      client_name: project.clientName,
      status: project.status,
      notes: project.notes,
      events: eventExports,
    },
  };
}

export interface ImageBearingCard {
  has_geom: boolean;
  geo: { lon: number; lat: number } | null;
  photos: ExportPhoto[];
  photo_urls: string[];
  map_url: string | null;
  poi_map_url: string | null;
  poi_distances?: ExportPoiDistance[];
}

/** Every venue-like card in the export data (uniform photo/map handling). */
export function venueCards(data: ExportData): Array<{ locationId: string; card: ImageBearingCard }> {
  if (data.kind === 'location') {
    return [{ locationId: data.location.id, card: data.location }];
  }
  const shortlist =
    data.kind === 'event' ? data.event.shortlist : data.project.events.flatMap((e) => e.shortlist);
  return shortlist.map((v) => ({ locationId: v.location_id, card: v }));
}

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

/**
 * Resolves photo references into publicly fetchable URLs (S3 presigned GET, 1h)
 * and sets the absolute public map-thumb URL when a public base URL is known.
 * Mutates `data` in place; returns warnings (never throws).
 */
export async function resolveExportImages(
  data: ExportData,
  opts: { storage: StorageService; publicBaseUrl?: string; include: ExportInclude },
): Promise<string[]> {
  const warnings = new Set<string>();
  const base = opts.publicBaseUrl?.replace(/\/+$/, '');
  for (const { locationId, card } of venueCards(data)) {
    if (opts.include.photos) {
      for (const photo of card.photos) {
        if (isHttpUrl(photo.source)) {
          card.photo_urls.push(photo.source);
        } else if (opts.storage.isConfigured()) {
          try {
            card.photo_urls.push(await opts.storage.presignGet(photo.source));
          } catch {
            warnings.add('photos_unavailable');
          }
        } else {
          warnings.add('photos_unavailable');
        }
      }
    }
    if (card.has_geom && base) {
      // Public route (no auth) so the Slides API can fetch the image directly.
      card.map_url = `${base}/api/v1/locations/${locationId}/map-thumb.png`;
    }
  }
  return [...warnings];
}
