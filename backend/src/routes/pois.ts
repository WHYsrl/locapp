import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { haversineKm } from '../lib/geo.js';
import { googleRouteMatrix } from '../lib/googlemaps.js';

const IdParams = z.object({ id: z.string() });

const PoiKindEnum = z.enum(['hotel', 'aeroporto', 'stazione', 'monumento', 'altro']);

const PoiBody = z.object({
  name: z.string().min(1),
  kind: PoiKindEnum.default('altro'),
  lon: z.number(),
  lat: z.number(),
  address: z.string().nullish(),
  city: z.string().nullish(),
  notes: z.string().nullish(),
});

/** Patch schema without defaults: absent fields must stay untouched. */
const PoiPatchBody = z.object({
  name: z.string().min(1).optional(),
  kind: PoiKindEnum.optional(),
  lon: z.number().optional(),
  lat: z.number().optional(),
  address: z.string().nullish(),
  city: z.string().nullish(),
  notes: z.string().nullish(),
});

const PoiListQuery = z.object({
  kind: PoiKindEnum.optional(),
  q: z.string().optional(),
});

/** Cached poi-distance responses per location+geom, cap 200 (oldest evicted). */
const POI_DISTANCE_CACHE_MAX = 200;

/** Rough fallback estimate: extra-urban average 50 km/h. */
const estimatedMinutes = (km: number): number => Math.round((km / 50) * 60);
const round1 = (n: number): number => Math.round(n * 10) / 10;

export async function poiRoutes(app: FastifyInstance): Promise<void> {
  const { repos } = app.deps;
  const distanceCache = new Map<string, unknown>();

  app.get('/pois', async (req) => {
    const query = PoiListQuery.parse(req.query);
    const rows = await repos.registry.listPois({ kind: query.kind, q: query.q });
    return { data: rows };
  });

  app.post('/pois', async (req, reply) => {
    const body = PoiBody.parse(req.body);
    const row = await repos.registry.createPoi({
      name: body.name,
      kind: body.kind,
      geom: { lon: body.lon, lat: body.lat },
      address: body.address ?? null,
      city: body.city ?? null,
      notes: body.notes ?? null,
    });
    distanceCache.clear();
    reply.status(201);
    return row;
  });

  app.patch('/pois/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    const body = PoiPatchBody.parse(req.body);
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch['name'] = body.name;
    if (body.kind !== undefined) patch['kind'] = body.kind;
    if (body.address !== undefined) patch['address'] = body.address;
    if (body.city !== undefined) patch['city'] = body.city;
    if (body.notes !== undefined) patch['notes'] = body.notes;
    if (body.lon !== undefined && body.lat !== undefined) {
      patch['geom'] = { lon: body.lon, lat: body.lat };
    }
    const row = await repos.registry.updatePoi(id, patch as never);
    if (!row) throw notFound('POI');
    distanceCache.clear();
    return row;
  });

  app.delete('/pois/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const ok = await repos.registry.deletePoi(id);
    if (!ok) throw notFound('POI');
    distanceCache.clear();
    reply.status(204);
  });

  // Driving distance from a location to every registered POI, nearest first.
  // Uses the Google Routes API matrix (1 origin x N destinations) when
  // GOOGLE_MAPS_API_KEY is set; otherwise a haversine estimate at 50 km/h
  // flagged with estimated: true (also used per-POI when Google has no route).
  app.get('/locations/:id/poi-distances', async (req) => {
    const { id } = IdParams.parse(req.params);
    const location = await repos.locations.getById(id);
    if (!location) throw notFound('Location');
    const [coord] = await repos.locations.coordinates([id]);
    if (coord?.lon == null || coord.lat == null) throw notFound('Location geometry');

    const cacheKey = `${id}:${coord.lon}:${coord.lat}`;
    const cached = distanceCache.get(cacheKey);
    if (cached) return cached;

    const allPois = (await repos.registry.listPois()).filter((p) => p.lon != null && p.lat != null);
    const origin = { lon: coord.lon, lat: coord.lat };

    const measured = new Map<number, { km: number; minutes: number }>();
    if (app.deps.googleMapsApiKey && allPois.length > 0) {
      const matrix = await googleRouteMatrix(
        [{ lat: origin.lat, lng: origin.lon }],
        allPois.map((p) => ({ lat: p.lat!, lng: p.lon! })),
        app.deps.googleMapsApiKey,
        app.deps.fetchFn,
      );
      for (const m of matrix) measured.set(m.dest_i, { km: m.km, minutes: m.minutes });
    }

    const data = allPois
      .map((p, i) => {
        const hit = measured.get(i);
        if (hit) {
          return { poi: p, km: round1(hit.km), minutes_car: hit.minutes, estimated: false };
        }
        const km = haversineKm(origin, { lon: p.lon!, lat: p.lat! });
        return { poi: p, km: round1(km), minutes_car: estimatedMinutes(km), estimated: true };
      })
      .sort((a, b) => a.km - b.km);

    const result = { data };
    if (distanceCache.size >= POI_DISTANCE_CACHE_MAX) {
      distanceCache.delete(distanceCache.keys().next().value!);
    }
    distanceCache.set(cacheKey, result);
    return result;
  });
}
