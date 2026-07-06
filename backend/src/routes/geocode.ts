import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest } from '../lib/errors.js';
import { geocodeAddress, geocodeBestWith, googleMapsUrl } from '../lib/geocode.js';

const GeocodeQuery = z.object({
  q: z.string().min(1).optional(),
  name: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postal_code: z.string().optional(),
  province: z.string().optional(),
});

export async function geocodeRoutes(app: FastifyInstance): Promise<void> {
  // Deps may inject a geocoder (tests do); production falls back to OSM Nominatim.
  const geocode = app.deps.geocode ?? geocodeAddress;

  app.get('/geocode', async (req) => {
    const query = GeocodeQuery.parse(req.query);
    const hasParts = Boolean(query.name || query.address || query.city || query.postal_code || query.province);
    if (!query.q && !hasParts) {
      throw badRequest('Provide q or at least one of name/address/city/postal_code/province');
    }
    // Structured parts win: they enable the variant fallback (SPEC §4 Geocoding).
    const candidates = hasParts
      ? await geocodeBestWith(
          {
            name: query.name,
            address_line: query.address,
            city: query.city,
            postal_code: query.postal_code,
            province: query.province,
          },
          geocode,
        )
      : await geocode(query.q!);
    return {
      data: candidates.map((c) => ({ ...c, google_maps_url: googleMapsUrl(c.lat, c.lon) })),
    };
  });
}
