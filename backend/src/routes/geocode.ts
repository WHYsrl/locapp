import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { geocodeAddress, googleMapsUrl } from '../lib/geocode.js';

const GeocodeQuery = z.object({
  q: z.string().min(1),
});

export async function geocodeRoutes(app: FastifyInstance): Promise<void> {
  // Deps may inject a geocoder (tests do); production falls back to OSM Nominatim.
  const geocode = app.deps.geocode ?? geocodeAddress;

  app.get('/geocode', async (req) => {
    const { q } = GeocodeQuery.parse(req.query);
    const candidates = await geocode(q);
    return {
      data: candidates.map((c) => ({ ...c, google_maps_url: googleMapsUrl(c.lat, c.lon) })),
    };
  });
}
