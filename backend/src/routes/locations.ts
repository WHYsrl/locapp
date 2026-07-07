import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { conflict, notFound } from '../lib/errors.js';
import { paginated, parsePagination } from '../lib/pagination.js';
import { rowToApi, rowsToApi } from '../lib/apiMappers.js';
import { buildHistoryTimeline, deriveUsage, resolveEffective, withGeo } from '../lib/serializers.js';
import { registerTags } from '../lib/tagService.js';
import { renderMapThumb } from '../lib/staticmap.js';
import { fetchGoogleStaticMap } from '../lib/googlemaps.js';
import type { CapacityConfiguration, VisitStatus } from '../db/schema.js';

const IdParams = z.object({ id: z.string() });

const ListQuery = z.object({
  q: z.string().optional(),
  tags: z.string().optional(),
  city: z.string().optional(),
  visit_status: z.enum(['da_visitare', 'visitata']).optional(),
  min_capacity: z.coerce.number().int().positive().optional(),
  configuration: z
    .enum(['in_piedi', 'tavoli_tondi', 'tavolo_imperiale', 'platea', 'ferro_di_cavallo', 'classroom', 'cocktail'])
    .optional(),
  accessibility_min: z.coerce.number().int().min(1).max(5).optional(),
  parent_id: z.string().optional(),
  root_only: z.coerce.boolean().optional(),
});

const LocationBody = z.object({
  parent_location_id: z.string().nullish(),
  name: z.string().min(1),
  slug: z.string().nullish(),
  summary: z.string().nullish(),
  address_line: z.string().nullish(),
  city: z.string().nullish(),
  province: z.string().nullish(),
  postal_code: z.string().nullish(),
  country: z.string().optional(),
  phone: z.string().nullish(),
  email: z.string().nullish(),
  website: z.string().nullish(),
  google_maps_url: z.string().nullish(),
  thumbnail_url: z.string().nullish(),
  visit_status: z.enum(['da_visitare', 'visitata']).optional(),
  logistics: z.record(z.string(), z.unknown()).nullish(),
  setup: z.record(z.string(), z.unknown()).nullish(),
  party: z.record(z.string(), z.unknown()).nullish(),
  technical: z.record(z.string(), z.unknown()).nullish(),
  accessibility_rating: z.number().int().min(1).max(5).nullish(),
  accessibility_notes: z.string().nullish(),
  availability_rules: z.string().nullish(),
  smart_tags: z.array(z.string()).nullish(),
  impressions: z.string().nullish(),
  lon: z.number().optional(),
  lat: z.number().optional(),
  /** Alias of lon — the web client sends lat + lng. */
  lng: z.number().optional(),
  geom: z.object({ lat: z.number(), lng: z.number() }).nullish(),
});

type LocationBodyT = z.infer<typeof LocationBody>;

function bodyToInsert(body: Partial<LocationBodyT>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const map: Record<string, string> = {
    parent_location_id: 'parentLocationId',
    name: 'name',
    slug: 'slug',
    summary: 'summary',
    address_line: 'addressLine',
    city: 'city',
    province: 'province',
    postal_code: 'postalCode',
    country: 'country',
    phone: 'phone',
    email: 'email',
    website: 'website',
    google_maps_url: 'googleMapsUrl',
    thumbnail_url: 'thumbnailUrl',
    visit_status: 'visitStatus',
    logistics: 'logistics',
    setup: 'setup',
    party: 'party',
    technical: 'technical',
    accessibility_rating: 'accessibilityRating',
    accessibility_notes: 'accessibilityNotes',
    availability_rules: 'availabilityRules',
    smart_tags: 'smartTags',
    impressions: 'impressions',
  };
  for (const [apiKey, column] of Object.entries(map)) {
    if (apiKey in body) out[column] = (body as Record<string, unknown>)[apiKey];
  }
  // Coordinates come in three shapes; precedence: geom > lat/lng > lat/lon.
  const lonValue = body.lng ?? body.lon;
  if (lonValue !== undefined && body.lat !== undefined) {
    out['geom'] = { lon: lonValue, lat: body.lat };
  }
  // Geom shape used by geocoding proposals: {lat, lng}. Wins over flat fields.
  if (body.geom) {
    out['geom'] = { lon: body.geom.lng, lat: body.geom.lat };
  }
  return out;
}

/** Rendered map thumbnails cached in memory, capped (oldest entry evicted). */
const THUMB_CACHE_MAX = 200;

export async function locationRoutes(app: FastifyInstance): Promise<void> {
  const { repos } = app.deps;
  const thumbCache = new Map<string, Buffer>();

  // Public (no auth, like /health): consumed via <img src> which cannot send headers.
  app.get('/locations/:id/map-thumb.png', { config: { public: true } }, async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const location = await repos.locations.getById(id);
    if (!location) throw notFound('Location');
    const [coord] = await repos.locations.coordinates([id]);
    if (coord?.lon == null || coord.lat == null) throw notFound('Location geometry');

    const cacheKey = `${id}:${coord.lon}:${coord.lat}`;
    let png = thumbCache.get(cacheKey);
    if (!png) {
      // With GOOGLE_MAPS_API_KEY set the thumbnail is proxied from the Maps
      // Static API (key stays server-side); otherwise (or on Google failure)
      // it is stitched from OSM raster tiles as before.
      if (app.deps.googleMapsApiKey) {
        png =
          (await fetchGoogleStaticMap(coord.lat, coord.lon, app.deps.googleMapsApiKey, app.deps.fetchFn)) ??
          undefined;
      }
      if (!png) {
        const render = app.deps.renderMapThumb ?? renderMapThumb;
        png = await render(coord.lat, coord.lon);
      }
      if (thumbCache.size >= THUMB_CACHE_MAX) {
        thumbCache.delete(thumbCache.keys().next().value!);
      }
      thumbCache.set(cacheKey, png);
    }
    reply.header('cache-control', 'public, max-age=86400').type('image/png');
    return reply.send(png);
  });

  app.get('/locations', async (req) => {
    const q = ListQuery.parse(req.query);
    const p = parsePagination(req.query);
    const { rows, total } = await repos.locations.list(
      {
        q: q.q,
        tags: q.tags ? q.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        city: q.city,
        visitStatus: q.visit_status as VisitStatus | undefined,
        minCapacity: q.min_capacity,
        configuration: q.configuration as CapacityConfiguration | undefined,
        accessibilityMin: q.accessibility_min,
        parentId: q.parent_id,
        rootOnly: q.root_only,
      },
      p,
    );
    // Emit lon/lng/lat (and the map-thumb fallback) on every list item.
    const coords = await repos.locations.coordinates(rows.map((r) => r.id));
    const coordById = new Map(coords.map((c) => [c.id, c]));
    const data = rows.map((r) => withGeo(rowToApi(r), coordById.get(r.id)));
    return paginated(data, total, p);
  });

  app.post('/locations', async (req, reply) => {
    const body = LocationBody.parse(req.body);
    const insert = bodyToInsert(body);
    // Unknown smart tags are auto-registered in the shared registry (normalized names persisted).
    if (Array.isArray(insert['smartTags'])) {
      insert['smartTags'] = await registerTags(repos.tags, insert['smartTags'] as string[]);
    }
    const row = await repos.locations.create(insert as never);
    reply.status(201);
    return rowToApi(row);
  });

  app.get('/locations/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    const location = await repos.locations.getById(id);
    if (!location) throw notFound('Location');

    const parent = location.parentLocationId
      ? await repos.locations.getById(location.parentLocationId)
      : null;
    const [relations, usageRows, coords] = await Promise.all([
      repos.locations.getRelations(id),
      repos.locations.usage(id),
      repos.locations.coordinates([id]),
    ]);

    const capsBySpace = new Map<string, Array<{ configuration: string; capacity: number }>>();
    for (const c of relations.capacityRows) {
      const list = capsBySpace.get(c.spaceId) ?? [];
      list.push({ configuration: c.configuration, capacity: c.capacity });
      capsBySpace.set(c.spaceId, list);
    }

    const effective = resolveEffective(location, parent);
    const coord = coords[0];

    return {
      ...withGeo(rowToApi(location), coord),
      parent: parent ? { id: parent.id, name: parent.name } : null,
      children: rowsToApi(relations.children),
      effective_logistics: effective.effective_logistics,
      effective_address: effective.effective_address,
      effective_contact: effective.effective_contact,
      inherited_fields: effective.inherited_fields,
      spaces: relations.spaceRows.map((s) => ({
        ...rowToApi(s),
        capacities: capsBySpace.get(s.id) ?? [],
      })),
      contacts: rowsToApi(relations.contactRows),
      suppliers: rowsToApi(relations.supplierRows),
      media: rowsToApi(relations.mediaRows),
      price_lists: rowsToApi(relations.priceListRows),
      usage_summary: deriveUsage(usageRows),
    };
  });

  app.patch('/locations/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    const body = LocationBody.partial().parse(req.body);
    const patch = bodyToInsert(body);
    // Unknown smart tags are auto-registered in the shared registry (normalized names persisted).
    if (Array.isArray(patch['smartTags'])) {
      patch['smartTags'] = await registerTags(repos.tags, patch['smartTags'] as string[]);
    }
    const row = await repos.locations.update(id, patch as never);
    if (!row) throw notFound('Location');
    return rowToApi(row);
  });

  // Soft delete with clear rules: 409 LOCATION_IN_USE when referenced by any
  // shortlist (event_locations), 409 HAS_CHILDREN when it has child venues.
  // ?force=true removes the shortlist references and detaches the children
  // (parent_location_id = null) before soft-deleting.
  app.delete('/locations/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const { force } = z.object({ force: z.coerce.boolean().optional() }).parse(req.query);
    const location = await repos.locations.getById(id);
    if (!location) throw notFound('Location');

    const [usageRows, children] = await Promise.all([
      repos.locations.usage(id),
      repos.locations.listChildren(id),
    ]);
    if (!force) {
      if (usageRows.length > 0) {
        const references = usageRows.map((u) => ({
          project: u.projectName,
          event: u.eventName,
          status: u.status,
        }));
        const names = [...new Set(usageRows.map((u) => `${u.projectName} / ${u.eventName}`))];
        throw conflict(
          'LOCATION_IN_USE',
          `Location usata in: ${names.join(', ')}. Rimuoverla dalle shortlist o ripetere con force=true`,
          { references },
        );
      }
      if (children.length > 0) {
        throw conflict(
          'HAS_CHILDREN',
          `La location ha ${children.length} location figlie: ripetere con force=true per scollegarle`,
          { children: children.map((c) => ({ id: c.id, name: c.name })) },
        );
      }
    } else {
      if (usageRows.length > 0) await repos.locations.removeShortlistReferences(id);
      if (children.length > 0) await repos.locations.detachChildren(id);
    }
    const ok = await repos.locations.softDelete(id);
    if (!ok) throw notFound('Location');
    reply.status(204);
  });

  app.get('/locations/:id/usage', async (req) => {
    const { id } = IdParams.parse(req.params);
    const location = await repos.locations.getById(id);
    if (!location) throw notFound('Location');
    const usage = deriveUsage(await repos.locations.usage(id));
    return { data: usage.entries, proposta: usage.proposta, utilizzata: usage.utilizzata };
  });

  app.get('/locations/:id/history', async (req) => {
    const { id } = IdParams.parse(req.params);
    const location = await repos.locations.getById(id);
    if (!location) throw notFound('Location');
    const history = await repos.locations.history(id);
    return { data: buildHistoryTimeline(history) };
  });
}
