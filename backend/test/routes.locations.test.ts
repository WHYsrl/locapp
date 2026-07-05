import { describe, expect, it, vi } from 'vitest';
import { buildTestApp, auth } from './helpers.js';

const baseLocation = {
  id: 'loc-child',
  parentLocationId: 'loc-parent',
  name: 'Ristorante La Veranda',
  slug: 'la-veranda',
  summary: null,
  addressLine: null,
  city: null,
  province: null,
  postalCode: null,
  country: 'IT',
  geom: null,
  googleMapsUrl: null,
  thumbnailUrl: null,
  visitStatus: 'visitata',
  logistics: null,
  setup: null,
  party: null,
  technical: null,
  accessibilityRating: null,
  accessibilityNotes: null,
  availabilityRules: null,
  smartTags: ['lunch'],
  impressions: null,
  embedding: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
};

const parentLocation = {
  ...baseLocation,
  id: 'loc-parent',
  parentLocationId: null,
  name: 'Grand Hotel Aurelia',
  addressLine: 'Lungomare 12',
  city: 'Roma',
  logistics: { auto: 'Accesso diretto', private_parking: { spots: 80 } },
};

describe('location routes', () => {
  it('GET /locations returns paginated envelope with filters applied', async () => {
    let captured: unknown;
    const ctx = await buildTestApp({
      repos: {
        locations: {
          list: async (filters: unknown) => {
            captured = filters;
            return { rows: [parentLocation], total: 1 };
          },
        },
      },
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/locations?city=Roma&tags=gala_dinner,lunch&min_capacity=100&configuration=tavoli_tondi&page=2&per_page=10',
      headers: auth(ctx.tokens.viewer),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.meta).toEqual({ page: 2, per_page: 10, total: 1 });
    expect(body.data[0]).toMatchObject({ id: 'loc-parent', name: 'Grand Hotel Aurelia', visit_status: 'visitata' });
    expect(body.data[0]).not.toHaveProperty('geom');
    expect(captured).toMatchObject({
      city: 'Roma',
      tags: ['gala_dinner', 'lunch'],
      minCapacity: 100,
      configuration: 'tavoli_tondi',
    });
  });

  it('GET /locations/:id resolves effective_* fields from the parent', async () => {
    const ctx = await buildTestApp({
      repos: {
        locations: {
          getById: async (id: string) =>
            id === 'loc-child' ? baseLocation : id === 'loc-parent' ? parentLocation : null,
          usage: async () => [
            {
              projectId: 'p1',
              projectName: 'ACME',
              eventId: 'e1',
              eventName: 'Gala',
              status: 'utilizzata',
              dateStart: '2025-06-10',
              dateEnd: null,
            },
          ],
        },
      },
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/locations/loc-child',
      headers: auth(ctx.tokens.editor),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.effective_address.city).toBe('Roma');
    expect(body.effective_address.address_line).toBe('Lungomare 12');
    expect(body.effective_logistics).toEqual({ auto: 'Accesso diretto', private_parking: { spots: 80 } });
    expect(body.inherited_fields).toContain('logistics');
    expect(body.parent).toEqual({ id: 'loc-parent', name: 'Grand Hotel Aurelia' });
    expect(body.usage_summary).toMatchObject({ proposta: true, utilizzata: true });
  });

  it('GET /locations/:id/usage derives proposta/utilizzata from event_locations', async () => {
    const ctx = await buildTestApp({
      repos: {
        locations: {
          getById: async () => parentLocation,
          usage: async () => [
            { projectId: 'p1', projectName: 'ACME', eventId: 'e1', eventName: 'Plenaria', status: 'proposta', dateStart: null, dateEnd: null },
            { projectId: 'p1', projectName: 'ACME', eventId: 'e2', eventName: 'Gala', status: 'preselezionata', dateStart: null, dateEnd: null },
          ],
        },
      },
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/locations/loc-parent/usage',
      headers: auth(ctx.tokens.viewer),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.proposta).toBe(true);
    expect(body.utilizzata).toBe(false);
    expect(body.data).toHaveLength(2);
  });

  it('POST /locations validates the body and returns 400 with error envelope', async () => {
    const ctx = await buildTestApp();
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/locations',
      headers: auth(ctx.tokens.editor),
      payload: { name: '', accessibility_rating: 9 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 envelope for a missing location', async () => {
    const ctx = await buildTestApp();
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/locations/nope',
      headers: auth(ctx.tokens.viewer),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Location not found' } });
  });

  it('PATCH /locations/:id accepts geom {lat, lng} and google_maps_url from geocoding', async () => {
    const patches: Array<Record<string, unknown>> = [];
    const ctx = await buildTestApp({
      repos: {
        locations: {
          update: vi.fn(async (id: string, patch: Record<string, unknown>) => {
            patches.push(patch);
            return { ...parentLocation, id };
          }),
        },
      },
    });
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/locations/loc-parent',
      headers: auth(ctx.tokens.editor),
      payload: {
        geom: { lat: 41.9109, lng: 12.4534 },
        google_maps_url: 'https://www.google.com/maps/search/?api=1&query=41.9109,12.4534',
      },
    });
    expect(res.statusCode).toBe(200);
    // The API {lat, lng} shape is normalized to the DB GeoPoint {lon, lat}.
    expect(patches[0]).toEqual({
      geom: { lon: 12.4534, lat: 41.9109 },
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=41.9109,12.4534',
    });
  });

  it('POST /locations/:id/media creates a media row with a presigned upload', async () => {
    const ctx = await buildTestApp({
      repos: { locations: { getById: async () => parentLocation } },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/locations/loc-parent/media',
      headers: auth(ctx.tokens.editor),
      payload: { kind: 'foto', filename: 'facciata.jpg', mime: 'image/jpeg', category: 'esterni' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.upload.upload_url).toContain('https://upload.example/');
    expect(body.media.url).toContain('https://cdn.example/locations/loc-parent/');
    expect(body.media.kind).toBe('foto');
  });
});
