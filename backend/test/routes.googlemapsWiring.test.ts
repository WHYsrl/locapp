import { describe, expect, it, vi } from 'vitest';
import { buildTestApp, auth } from './helpers.js';

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status });

const googleGeocodePayload = {
  status: 'OK',
  results: [
    {
      formatted_address: 'Via Roma 1, Roma, Italia',
      geometry: { location: { lat: 41.9, lng: 12.5 } },
      types: ['street_address'],
    },
  ],
};

describe('GET /geocode with GOOGLE_MAPS_API_KEY', () => {
  it('prefers Google Geocoding and skips the Nominatim fallback on success', async () => {
    const fallback = vi.fn(async () => []);
    const fetchFn = vi.fn(async () => jsonResponse(googleGeocodePayload)) as unknown as typeof fetch;
    const ctx = await buildTestApp({ googleMapsApiKey: 'maps-key', fetchFn, geocode: fallback });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/geocode?q=Via%20Roma%201',
      headers: auth(ctx.tokens.viewer),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0]).toMatchObject({
      display_name: 'Via Roma 1, Roma, Italia',
      lat: 41.9,
      lon: 12.5,
      google_maps_url: 'https://www.google.com/maps/search/?api=1&query=41.9,12.5',
    });
    expect(fallback).not.toHaveBeenCalled();
  });

  it('falls back to the Nominatim geocoder when Google returns nothing', async () => {
    const fallback = vi.fn(async () => [
      { display_name: 'OSM result', lat: 45.4, lon: 9.19, type: 'city', importance: 0.7 },
    ]);
    const fetchFn = vi.fn(async () => jsonResponse({ status: 'ZERO_RESULTS', results: [] })) as unknown as typeof fetch;
    const ctx = await buildTestApp({ googleMapsApiKey: 'maps-key', fetchFn, geocode: fallback });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/geocode?address=Via%20Ignota%209&city=Milano',
      headers: auth(ctx.tokens.viewer),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].display_name).toBe('OSM result');
    expect(fallback).toHaveBeenCalled();
  });
});

describe('GET /locations/:id/map-thumb.png with GOOGLE_MAPS_API_KEY', () => {
  const location = { id: 'loc-1', name: 'Villa', deletedAt: null };
  const coord = { id: 'loc-1', lon: 12.5, lat: 41.9 };

  it('proxies the Google Static Map bytes (key stays server-side) and caches them', async () => {
    const pngBytes = Buffer.from('google-png-bytes');
    const fetchFn = vi.fn(async () => new Response(pngBytes)) as unknown as typeof fetch;
    const renderMapThumb = vi.fn(async () => Buffer.from('osm-png'));
    const ctx = await buildTestApp({
      googleMapsApiKey: 'maps-key',
      fetchFn,
      renderMapThumb,
      repos: { locations: { getById: async () => location, coordinates: async () => [coord] } },
    });
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/locations/loc-1/map-thumb.png' });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.equals(pngBytes)).toBe(true);
    const url = String((fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(url).toContain('maps.googleapis.com/maps/api/staticmap');
    expect(url).toContain('key=maps-key');
    expect(renderMapThumb).not.toHaveBeenCalled();

    // Second hit is served from the in-memory cache: no extra outbound fetch.
    await ctx.app.inject({ method: 'GET', url: '/api/v1/locations/loc-1/map-thumb.png' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('passes maptype through to the Static Maps URL and defaults to roadmap', async () => {
    const fetchFn = vi.fn(async () => new Response(Buffer.from('png'))) as unknown as typeof fetch;
    const ctx = await buildTestApp({
      googleMapsApiKey: 'maps-key',
      fetchFn,
      repos: { locations: { getById: async () => location, coordinates: async () => [coord] } },
    });
    await ctx.app.inject({ method: 'GET', url: '/api/v1/locations/loc-1/map-thumb.png' });
    await ctx.app.inject({ method: 'GET', url: '/api/v1/locations/loc-1/map-thumb.png?maptype=satellite' });
    const calls = (fetchFn as ReturnType<typeof vi.fn>).mock.calls;
    expect(String(calls[0]![0])).toContain('maptype=roadmap');
    expect(String(calls[1]![0])).toContain('maptype=satellite');
  });

  it('caches per maptype: switching style never serves the other style bytes', async () => {
    // Distinct bytes per maptype so cache mixups would be visible in the payload.
    const fetchFn = vi.fn(async (url: string) =>
      new Response(Buffer.from(url.includes('maptype=hybrid') ? 'hybrid-png' : 'roadmap-png')),
    ) as unknown as typeof fetch;
    const ctx = await buildTestApp({
      googleMapsApiKey: 'maps-key',
      fetchFn,
      repos: { locations: { getById: async () => location, coordinates: async () => [coord] } },
    });
    const roadmap = await ctx.app.inject({ method: 'GET', url: '/api/v1/locations/loc-1/map-thumb.png' });
    const hybrid = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/locations/loc-1/map-thumb.png?maptype=hybrid',
    });
    expect(roadmap.rawPayload.toString()).toBe('roadmap-png');
    expect(hybrid.rawPayload.toString()).toBe('hybrid-png');
    expect(fetchFn).toHaveBeenCalledTimes(2);

    // Each style now hits its own cache entry: no extra outbound fetches.
    const roadmapAgain = await ctx.app.inject({ method: 'GET', url: '/api/v1/locations/loc-1/map-thumb.png' });
    const hybridAgain = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/locations/loc-1/map-thumb.png?maptype=hybrid',
    });
    expect(roadmapAgain.rawPayload.toString()).toBe('roadmap-png');
    expect(hybridAgain.rawPayload.toString()).toBe('hybrid-png');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('rejects an invalid maptype with 400 before any outbound fetch', async () => {
    const fetchFn = vi.fn(async () => new Response(Buffer.from('png'))) as unknown as typeof fetch;
    const ctx = await buildTestApp({
      googleMapsApiKey: 'maps-key',
      fetchFn,
      repos: { locations: { getById: async () => location, coordinates: async () => [coord] } },
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/locations/loc-1/map-thumb.png?maptype=streetview',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('?refresh=1 bypasses the cache and replaces the entry with fresh bytes', async () => {
    let hit = 0;
    const fetchFn = vi.fn(async () => new Response(Buffer.from(`png-v${++hit}`))) as unknown as typeof fetch;
    const ctx = await buildTestApp({
      googleMapsApiKey: 'maps-key',
      fetchFn,
      repos: { locations: { getById: async () => location, coordinates: async () => [coord] } },
    });
    const first = await ctx.app.inject({ method: 'GET', url: '/api/v1/locations/loc-1/map-thumb.png' });
    const cached = await ctx.app.inject({ method: 'GET', url: '/api/v1/locations/loc-1/map-thumb.png' });
    expect(first.rawPayload.toString()).toBe('png-v1');
    expect(cached.rawPayload.toString()).toBe('png-v1');

    const refreshed = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/locations/loc-1/map-thumb.png?refresh=1',
    });
    expect(refreshed.rawPayload.toString()).toBe('png-v2');
    // The refreshed bytes replaced the cache entry for subsequent plain requests.
    const after = await ctx.app.inject({ method: 'GET', url: '/api/v1/locations/loc-1/map-thumb.png' });
    expect(after.rawPayload.toString()).toBe('png-v2');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('falls back to OSM tile stitching when the Google fetch fails', async () => {
    const fetchFn = vi.fn(async () => new Response('quota', { status: 403 })) as unknown as typeof fetch;
    const renderMapThumb = vi.fn(async () => Buffer.from('osm-png'));
    const ctx = await buildTestApp({
      googleMapsApiKey: 'maps-key',
      fetchFn,
      renderMapThumb,
      repos: { locations: { getById: async () => location, coordinates: async () => [coord] } },
    });
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/locations/loc-1/map-thumb.png' });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.toString()).toBe('osm-png');
    expect(renderMapThumb).toHaveBeenCalledWith(41.9, 12.5);
  });
});

describe('POST /search/brief distances', () => {
  const poi = { id: 'poi-1', name: 'Stazione Termini', kind: 'stazione', address: null, city: 'Roma', notes: null, lon: 12.501, lat: 41.901 };
  const candidate = {
    id: 'loc-1',
    name: 'Palazzo Roma',
    summary: null,
    city: 'Roma',
    smartTags: null,
    logistics: null,
    setup: null,
    party: null,
    technical: null,
    accessibilityRating: null,
    availabilityRules: null,
    impressions: null,
    thumbnailUrl: null,
    lon: 12.5,
    lat: 41.9,
  };
  const reposOverrides = {
    registry: { getPoi: async () => poi },
    search: { prefilterLocations: async () => [candidate] },
  };
  const aiOverrides = {
    parseBrief: vi.fn(async () => ({})),
    rerank: vi.fn(async () => [
      { location_id: 'loc-1', score: 90, reasons: { matched: [], unmatched: [], to_verify: [] } },
    ]),
  };
  const payload = { brief: 'Cena di gala per 100 persone', near: [{ poi_id: 'poi-1', max_minutes: 30 }] };

  it('uses real driving km/minutes from the Routes API matrix when the key is set', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse([
        { originIndex: 0, destinationIndex: 0, distanceMeters: 3400, duration: '660s', condition: 'ROUTE_EXISTS' },
      ]),
    ) as unknown as typeof fetch;
    const ctx = await buildTestApp({
      googleMapsApiKey: 'maps-key',
      fetchFn,
      repos: reposOverrides,
      ai: aiOverrides,
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/search/brief',
      headers: auth(ctx.tokens.editor),
      payload,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].distances).toEqual([
      { poi: 'Stazione Termini', km: 3.4, minutes_car: 11 },
    ]);
  });

  it('keeps the haversine estimate when no key is configured', async () => {
    const ctx = await buildTestApp({ repos: reposOverrides, ai: aiOverrides });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/search/brief',
      headers: auth(ctx.tokens.editor),
      payload,
    });
    expect(res.statusCode).toBe(200);
    const [d] = res.json().data[0].distances;
    expect(d.poi).toBe('Stazione Termini');
    expect(d.km).toBeCloseTo(0.1, 1);
    expect(d.minutes_car).toBe(0); // 0.14 km at 40 km/h rounds to 0 minutes
  });
});
