import { describe, expect, it } from 'vitest';
import { buildTestApp, auth } from './helpers.js';

const event = {
  id: 'e1',
  projectId: 'p1',
  name: 'Cena di gala',
  eventType: 'gala_dinner',
  dateStart: '2026-10-15',
  dateEnd: null,
  pax: 200,
  brief: 'Cena elegante',
  notes: null,
  sort: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('event routes', () => {
  it('GET /events/:id/map returns a GeoJSON FeatureCollection', async () => {
    const ctx = await buildTestApp({
      repos: {
        projects: {
          getEvent: async () => event,
          mapLocationsForEvents: async () => [
            { locationId: 'l1', name: 'Villa', city: 'Roma', addressLine: 'Via X 1', status: 'proposta', eventId: 'e1', lon: 12.5, lat: 41.9 },
          ],
        },
        registry: {
          listPois: async () => [{ id: 'poi1', name: 'Termini', kind: 'stazione', lon: 12.501, lat: 41.901 }],
        },
      },
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/events/e1/map?pois=true',
      headers: auth(ctx.tokens.viewer),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.type).toBe('FeatureCollection');
    expect(body.features).toHaveLength(2);
    expect(body.features[0].geometry.coordinates).toEqual([12.5, 41.9]);
    expect(body.features[1].properties.feature_type).toBe('poi');
  });

  it('GET /events/:id/compare returns the comparison matrix', async () => {
    const ctx = await buildTestApp({
      repos: {
        projects: {
          getEvent: async () => event,
          listEventLocations: async () => [
            { id: 'el1', eventId: 'e1', locationId: 'l1', status: 'proposta', matchScore: '80', matchReasons: null, clientFeedback: null, notes: null, createdAt: new Date(), locationName: 'Villa', locationCity: 'Roma', locationThumbnail: null, locationTags: null, lon: null, lat: null },
          ],
          listQuotes: async () => [{ id: 'q1', eventLocationId: 'el1', amount: '7500', currency: 'EUR', status: 'ricevuto', receivedAt: null, validUntil: null, mediaId: null, notes: null }],
          listAvailability: async () => [],
        },
        locations: {
          capacitiesForLocations: async () => [{ locationId: 'l1', configuration: 'tavoli_tondi', capacity: 180 }],
        },
      },
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/events/e1/compare',
      headers: auth(ctx.tokens.viewer),
    });
    expect(res.statusCode).toBe(200);
    const row = res.json().data[0];
    expect(row.location).toEqual({ id: 'l1', name: 'Villa' });
    expect(row.capacity_by_configuration).toEqual({ tavoli_tondi: 180 });
    expect(row.price_range).toEqual({ min: 7500, max: 7500 });
  });

  it('POST /events/:id/locations rejects duplicates in the shortlist', async () => {
    const ctx = await buildTestApp({
      repos: {
        projects: {
          getEvent: async () => event,
          listEventLocations: async () => [{ id: 'el1', locationId: 'l1' }],
        },
        locations: { getById: async () => ({ id: 'l1', name: 'Villa' }) },
      },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/events/e1/locations',
      headers: auth(ctx.tokens.editor),
      payload: { location_id: 'l1' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('already');
  });

  it('POST /events/:id/proposal returns the 501 stub with response shape', async () => {
    const ctx = await buildTestApp({ repos: { projects: { getEvent: async () => event } } });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/events/e1/proposal',
      headers: auth(ctx.tokens.editor),
      payload: { location_ids: ['l1'], include: { photos: true }, tone: 'formale' },
    });
    expect(res.statusCode).toBe(501);
    const body = res.json();
    expect(body.error.code).toBe('NOT_IMPLEMENTED');
    expect(body.shape).toEqual({ html_url: null, pdf_url: null });
  });

  it('POST /events/:id/feedback stores a batch across subject types', async () => {
    const ctx = await buildTestApp({ repos: { projects: { getEvent: async () => event } } });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/events/e1/feedback',
      headers: auth(ctx.tokens.editor),
      payload: {
        items: [
          { subject_type: 'location', subject_id: 'l1', ratings: { overall: 5, spazi: 4 }, notes: 'Ottima location' },
          { subject_type: 'company', subject_id: 'c1', ratings: { puntualita: 3 } },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({ subject_type: 'location', event_id: 'e1', created_by: 'u-editor' });
  });
});
