import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest } from '../lib/errors.js';
import { haversineKm, estimateMinutesByCar } from '../lib/geo.js';
import { googleRouteMatrix } from '../lib/googlemaps.js';
import type { BriefCriteria } from '../ai/criteria.js';

const BriefBody = z.object({
  brief: z.string().min(3),
  event_id: z.string().nullish(),
  near: z
    .array(
      z.object({
        poi_id: z.string().nullish(),
        address: z.string().nullish(),
        max_minutes: z.number().positive().nullish(),
      }),
    )
    .nullish(),
  limit: z.number().int().min(1).max(50).default(10),
});

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  const { repos, ai } = app.deps;

  app.post('/search/brief', async (req) => {
    const body = BriefBody.parse(req.body);

    const criteria: BriefCriteria = await ai.parseBrief(body.brief);

    if (body.event_id) {
      const event = await repos.projects.getEvent(body.event_id);
      if (event?.pax != null && criteria.pax == null) criteria.pax = event.pax;
    }

    const nearPois: Array<{ name: string; lon: number; lat: number; maxMinutes: number | null }> = [];
    for (const n of body.near ?? []) {
      if (n.poi_id) {
        const poi = await repos.registry.getPoi(n.poi_id);
        if (!poi) throw badRequest(`POI not found: ${n.poi_id}`);
        if (poi.lon != null && poi.lat != null) {
          nearPois.push({ name: poi.name, lon: poi.lon, lat: poi.lat, maxMinutes: n.max_minutes ?? null });
        }
      } else if (n.address) {
        // Address geocoding is out of scope for v1; constraint is passed to the reranker via the brief.
        continue;
      }
    }
    if (nearPois.length > 0) {
      criteria.near = nearPois.map((p) => ({
        lon: p.lon,
        lat: p.lat,
        // Rough radius from drive time at 40 km/h urban average.
        max_km: p.maxMinutes != null ? Math.max(1, (p.maxMinutes / 60) * 40) : 15,
        label: p.name,
      }));
    }

    const candidates = await repos.search.prefilterLocations(criteria, 50);
    const ranked = await ai.rerank(
      body.brief,
      candidates.map((c) => ({
        id: c.id,
        name: c.name,
        summary: c.summary,
        city: c.city,
        smartTags: c.smartTags,
        logistics: c.logistics,
        setup: c.setup,
        party: c.party,
        technical: c.technical,
        accessibilityRating: c.accessibilityRating,
        availabilityRules: c.availabilityRules,
        impressions: c.impressions,
      })),
    );

    const byId = new Map(candidates.map((c) => [c.id, c]));
    const top = ranked
      .filter((r) => byId.has(r.location_id))
      .sort((a, b) => b.score - a.score)
      .slice(0, body.limit);

    // Distances to the requested POIs: real driving km/minutes via the Google
    // Routes API when GOOGLE_MAPS_API_KEY is set; haversine + urban-speed
    // estimate otherwise (or for any pair Google could not route).
    const measured = new Map<string, { km: number; minutes: number }>();
    if (app.deps.googleMapsApiKey && nearPois.length > 0) {
      const origins = top
        .map((r) => byId.get(r.location_id)!)
        .filter((c) => c.lon != null && c.lat != null);
      const matrix = await googleRouteMatrix(
        origins.map((c) => ({ lat: c.lat!, lng: c.lon! })),
        nearPois.map((p) => ({ lat: p.lat, lng: p.lon })),
        app.deps.googleMapsApiKey,
        app.deps.fetchFn,
      );
      for (const m of matrix) {
        const c = origins[m.origin_i];
        if (c) measured.set(`${c.id}:${m.dest_i}`, { km: m.km, minutes: m.minutes });
      }
    }

    const results = top.map((r) => {
        const c = byId.get(r.location_id)!;
        const distances =
          c.lon != null && c.lat != null
            ? nearPois.map((p, j) => {
                const hit = measured.get(`${c.id}:${j}`);
                if (hit) {
                  return { poi: p.name, km: Math.round(hit.km * 10) / 10, minutes_car: hit.minutes };
                }
                const km = haversineKm({ lon: c.lon!, lat: c.lat! }, { lon: p.lon, lat: p.lat });
                return { poi: p.name, km: Math.round(km * 10) / 10, minutes_car: estimateMinutesByCar(km) };
              })
            : [];
        return {
          location: {
            id: c.id,
            name: c.name,
            city: c.city,
            summary: c.summary,
            smart_tags: c.smartTags,
            thumbnail_url: c.thumbnailUrl,
            lon: c.lon,
            lat: c.lat,
          },
          score: r.score,
          reasons: r.reasons,
          distances,
        };
      });

    return { data: results, criteria };
  });
}
