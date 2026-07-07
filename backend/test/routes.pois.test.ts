import { describe, expect, it, vi } from 'vitest';
import { buildTestApp, auth } from './helpers.js';

const termini = { id: 'poi-termini', name: 'Stazione Termini', kind: 'stazione', address: null, city: 'Roma', notes: null, lon: 12.501, lat: 41.901 };
const fiumicino = { id: 'poi-fco', name: 'Aeroporto Fiumicino', kind: 'aeroporto', address: null, city: 'Fiumicino', notes: null, lon: 12.25, lat: 41.8 };
const noGeom = { id: 'poi-x', name: 'Senza geom', kind: 'altro', address: null, city: null, notes: null, lon: null, lat: null };

const romeLocation = { id: 'loc-1', name: 'Palazzo Roma', deletedAt: null };
const romeCoord = { id: 'loc-1', lon: 12.5, lat: 41.9 };

describe('POI CRUD', () => {
  it('GET /pois forwards kind and q filters to the repo', async () => {
    const listPois = vi.fn(async () => [termini]);
    const ctx = await buildTestApp({ repos: { registry: { listPois } } });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/pois?kind=stazione&q=termini',
      headers: auth(ctx.tokens.viewer),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: [termini] });
    expect(listPois).toHaveBeenCalledWith({ kind: 'stazione', q: 'termini' });
  });

  it('POST /pois creates a POI with address/city/notes and coordinates', async () => {
    const createPoi = vi.fn(async () => termini);
    const ctx = await buildTestApp({ repos: { registry: { createPoi } } });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/pois',
      headers: auth(ctx.tokens.editor),
      payload: { name: 'Stazione Termini', kind: 'stazione', lon: 12.501, lat: 41.901, city: 'Roma' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: 'poi-termini', city: 'Roma' });
    expect(createPoi).toHaveBeenCalledWith({
      name: 'Stazione Termini',
      kind: 'stazione',
      geom: { lon: 12.501, lat: 41.901 },
      address: null,
      city: 'Roma',
      notes: null,
    });
  });

  it('PATCH /pois/:id updates fields and rebuilds geom only when both coords arrive', async () => {
    const updatePoi = vi.fn(async (id: string, patch: Record<string, unknown>) => ({ ...termini, id, ...patch }));
    const ctx = await buildTestApp({ repos: { registry: { updatePoi } } });
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/pois/poi-termini',
      headers: auth(ctx.tokens.editor),
      payload: { notes: 'binari alta velocita', lon: 12.502, lat: 41.902 },
    });
    expect(res.statusCode).toBe(200);
    expect(updatePoi).toHaveBeenCalledWith('poi-termini', {
      notes: 'binari alta velocita',
      geom: { lon: 12.502, lat: 41.902 },
    });

    updatePoi.mockResolvedValueOnce(null as never);
    const missing = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/pois/ghost',
      headers: auth(ctx.tokens.editor),
      payload: { name: 'X' },
    });
    expect(missing.statusCode).toBe(404);
  });

  it('DELETE /pois/:id returns 204, and 404 for unknown ids', async () => {
    const deletePoi = vi.fn(async (id: string) => id === 'poi-termini');
    const ctx = await buildTestApp({ repos: { registry: { deletePoi } } });
    const ok = await ctx.app.inject({
      method: 'DELETE',
      url: '/api/v1/pois/poi-termini',
      headers: auth(ctx.tokens.editor),
    });
    expect(ok.statusCode).toBe(204);
    const missing = await ctx.app.inject({
      method: 'DELETE',
      url: '/api/v1/pois/ghost',
      headers: auth(ctx.tokens.editor),
    });
    expect(missing.statusCode).toBe(404);
  });
});

describe('GET /locations/:id/poi-distances', () => {
  it('estimates with haversine (50 km/h) for every POI, sorted by km, when no Maps key', async () => {
    const ctx = await buildTestApp({
      repos: {
        locations: { getById: async () => romeLocation, coordinates: async () => [romeCoord] },
        registry: { listPois: async () => [fiumicino, termini, noGeom] },
      },
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/locations/loc-1/poi-distances',
      headers: auth(ctx.tokens.viewer),
    });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data).toHaveLength(2); // POI without geom excluded
    expect(data[0].poi.id).toBe('poi-termini'); // nearest first
    expect(data[0].estimated).toBe(true);
    expect(data[0].km).toBeCloseTo(0.1, 1);
    expect(data[1].poi.id).toBe('poi-fco');
    expect(data[1].km).toBeGreaterThan(20);
    expect(data[1].km).toBeLessThan(28);
    expect(data[1].minutes_car).toBe(Math.round((data[1].km / 50) * 60));
  });

  it('uses the Google route matrix (1 origin x N destinations) when the key is set', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify([
          { originIndex: 0, destinationIndex: 0, distanceMeters: 32000, duration: '2100s', condition: 'ROUTE_EXISTS' },
          { originIndex: 0, destinationIndex: 1, distanceMeters: 2200, duration: '480s', condition: 'ROUTE_EXISTS' },
        ]),
      ),
    ) as unknown as typeof fetch;
    const ctx = await buildTestApp({
      googleMapsApiKey: 'maps-key',
      fetchFn,
      repos: {
        locations: { getById: async () => romeLocation, coordinates: async () => [romeCoord] },
        registry: { listPois: async () => [fiumicino, termini] },
      },
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/locations/loc-1/poi-distances',
      headers: auth(ctx.tokens.viewer),
    });
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data).toEqual([
      { poi: termini, km: 2.2, minutes_car: 8, estimated: false },
      { poi: fiumicino, km: 32, minutes_car: 35, estimated: false },
    ]);
    const body = JSON.parse(String((fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]![1]!.body));
    expect(body.origins).toHaveLength(1);
    expect(body.destinations).toHaveLength(2);
  });

  it('caches per location and invalidates the cache on POI writes', async () => {
    const listPois = vi.fn(async () => [termini]);
    const ctx = await buildTestApp({
      repos: {
        locations: { getById: async () => romeLocation, coordinates: async () => [romeCoord] },
        registry: { listPois },
      },
    });
    const get = () =>
      ctx.app.inject({
        method: 'GET',
        url: '/api/v1/locations/loc-1/poi-distances',
        headers: auth(ctx.tokens.viewer),
      });
    await get();
    await get();
    expect(listPois).toHaveBeenCalledTimes(1); // second hit served from cache

    await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/pois',
      headers: auth(ctx.tokens.editor),
      payload: { name: 'Nuovo POI', lon: 12.4, lat: 41.85 },
    });
    await get();
    expect(listPois).toHaveBeenCalledTimes(2); // cache invalidated by the write
  });

  it('404s when the location is missing or has no geometry', async () => {
    const ctx = await buildTestApp({
      repos: {
        locations: { getById: async () => romeLocation, coordinates: async () => [{ id: 'loc-1', lon: null, lat: null }] },
      },
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/locations/loc-1/poi-distances',
      headers: auth(ctx.tokens.viewer),
    });
    expect(res.statusCode).toBe(404);
  });
});
