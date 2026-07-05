import { describe, expect, it, vi } from 'vitest';
import { buildTestApp, auth, sampleDraft } from './helpers.js';
import { enrichDraftWithGeocoding } from '../src/ingest/process.js';
import type { GeocodeCandidate } from '../src/lib/geocode.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

const CANDIDATE: GeocodeCandidate = {
  display_name: 'Villa dei Pini, Firenze, Toscana, Italia',
  lat: 43.7696,
  lon: 11.2558,
  type: 'house',
  importance: 0.62,
};

describe('ingest routes', () => {
  it('POST /ingest with testo creates a job and processes it to ready', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const ctx = await buildTestApp({
      repos: {
        ingestion: {
          update: vi.fn(async (id: string, patch: Record<string, unknown>) => {
            updates.push(patch);
            return { id, ...patch };
          }),
        },
      },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/ingest',
      headers: auth(ctx.tokens.editor),
      payload: { source_type: 'testo', text: 'Villa dei Pini, Firenze. Salone da 300 mq per 150 persone a tavoli tondi.' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: 'job-1', status: 'pending', source_type: 'testo' });

    await flush();
    expect(ctx.ai.extractLocationDraft).toHaveBeenCalledOnce();
    const finalUpdate = updates.at(-1)!;
    expect(finalUpdate['status']).toBe('ready');
    expect(finalUpdate['extracted']).toMatchObject({ confidence: 0.9 });
  });

  it('POST /ingest with an audio file and no transcript returns 501', async () => {
    const ctx = await buildTestApp();
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/ingest',
      headers: auth(ctx.tokens.editor),
      payload: { source_type: 'audio', media_id: 'm1' },
    });
    expect(res.statusCode).toBe(501);
    expect(res.json().error.code).toBe('NOT_IMPLEMENTED');
  });

  it('POST /ingest/:jobId/apply merges only accepted fields and marks job applied', async () => {
    const locationPatches: Array<Record<string, unknown>> = [];
    const ctx = await buildTestApp({
      repos: {
        ingestion: {
          getById: async () => ({
            id: 'job-1',
            locationId: 'loc-1',
            status: 'ready',
            extracted: sampleDraft,
            sourceType: 'testo',
            createdAt: new Date(),
          }),
        },
        locations: {
          update: vi.fn(async (id: string, patch: Record<string, unknown>) => {
            locationPatches.push(patch);
            return { id, ...patch };
          }),
        },
      },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/ingest/job-1/apply',
      headers: auth(ctx.tokens.editor),
      payload: { accept: { 'location.name': true, 'location.city': false, spaces: true } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.applied_fields).toEqual(['location.name', 'spaces']);
    expect(locationPatches[0]).toEqual({ name: 'Villa dei Pini' });
    expect(ctx.repos.locations.createSpace).toHaveBeenCalledOnce();
    expect(ctx.repos.locations.setCapacities).toHaveBeenCalledWith('space-1', [
      { configuration: 'tavoli_tondi', capacity: 150 },
      { configuration: 'in_piedi', capacity: 250 },
    ]);
  });

  it('POST /ingest/:jobId/apply writes an accepted geocoded geom as {lon, lat}', async () => {
    const locationPatches: Array<Record<string, unknown>> = [];
    const draft = structuredClone(sampleDraft);
    draft.location['geom'] = { lat: 43.7696, lng: 11.2558 };
    draft.location['google_maps_url'] = 'https://www.google.com/maps/search/?api=1&query=43.7696,11.2558';
    const ctx = await buildTestApp({
      repos: {
        ingestion: {
          getById: async () => ({
            id: 'job-1',
            locationId: 'loc-1',
            status: 'ready',
            extracted: draft,
            sourceType: 'testo',
            createdAt: new Date(),
          }),
        },
        locations: {
          update: vi.fn(async (id: string, patch: Record<string, unknown>) => {
            locationPatches.push(patch);
            return { id, ...patch };
          }),
        },
      },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/ingest/job-1/apply',
      headers: auth(ctx.tokens.editor),
      payload: { accept: { 'location.geom': true, 'location.google_maps_url': true } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().applied_fields).toContain('location.geom');
    expect(locationPatches[0]).toEqual({
      geom: { lon: 11.2558, lat: 43.7696 },
      googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=43.7696,11.2558',
    });
  });
});

describe('ingest geocoding enrichment', () => {
  it('pipeline proposes geom + maps link in the draft when an address is found', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const draft = structuredClone(sampleDraft);
    const geocode = vi.fn(async () => [CANDIDATE]);
    const ctx = await buildTestApp({
      repos: {
        ingestion: {
          update: vi.fn(async (id: string, patch: Record<string, unknown>) => {
            updates.push(patch);
            return { id, ...patch };
          }),
        },
      },
      ai: { extractLocationDraft: vi.fn(async () => draft) },
      geocode,
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/ingest',
      headers: auth(ctx.tokens.editor),
      payload: { source_type: 'testo', text: 'Villa dei Pini, Firenze.' },
    });
    expect(res.statusCode).toBe(201);
    await flush();

    // Draft has name + city but no address_line: query falls back to name, city, country.
    expect(geocode).toHaveBeenCalledWith('Villa dei Pini, Firenze, Italia');
    const final = updates.at(-1)!;
    expect(final['status']).toBe('ready');
    const extracted = final['extracted'] as {
      location: Record<string, unknown>;
      field_sources: Record<string, string>;
    };
    expect(extracted.location['geom']).toEqual({ lat: 43.7696, lng: 11.2558 });
    expect(extracted.location['google_maps_url']).toBe(
      'https://www.google.com/maps/search/?api=1&query=43.7696,11.2558',
    );
    expect(extracted.field_sources['locations.geom']).toBe(
      'geocoding OSM: Villa dei Pini, Firenze, Toscana, Italia',
    );
  });

  it('skips geocoding when the draft already has a geom or lacks address data', async () => {
    const geocode = vi.fn(async () => [CANDIDATE]);

    const withGeom = structuredClone(sampleDraft);
    withGeom.location['geom'] = { lat: 1, lng: 2 };
    await enrichDraftWithGeocoding(withGeom, geocode);
    expect(withGeom.location['geom']).toEqual({ lat: 1, lng: 2 });

    const noAddress = structuredClone(sampleDraft);
    delete noAddress.location['city'];
    await enrichDraftWithGeocoding(noAddress, geocode);
    expect(noAddress.location['geom']).toBeUndefined();

    expect(geocode).not.toHaveBeenCalled();
  });

  it('is non-fatal: no candidates or geocoder failure leaves the draft untouched', async () => {
    const draft = structuredClone(sampleDraft);
    await enrichDraftWithGeocoding(draft, vi.fn(async () => []));
    expect(draft.location['geom']).toBeUndefined();

    const failing = vi.fn(async () => {
      throw new Error('nominatim down');
    });
    await enrichDraftWithGeocoding(draft, failing);
    expect(draft.location['geom']).toBeUndefined();
    expect(draft.field_sources['locations.geom']).toBeUndefined();
  });

  it('keeps an extracted google_maps_url instead of overwriting it', async () => {
    const draft = structuredClone(sampleDraft);
    draft.location['google_maps_url'] = 'https://maps.app.goo.gl/original';
    await enrichDraftWithGeocoding(draft, vi.fn(async () => [CANDIDATE]));
    expect(draft.location['geom']).toEqual({ lat: 43.7696, lng: 11.2558 });
    expect(draft.location['google_maps_url']).toBe('https://maps.app.goo.gl/original');
  });
});

describe('search route', () => {
  it('POST /search/brief runs parse -> prefilter -> rerank and returns scored results', async () => {
    const candidate = {
      id: 'l1',
      name: 'Villa dei Pini',
      summary: 'Villa storica',
      city: 'Firenze',
      smartTags: ['gala_dinner'],
      logistics: null,
      setup: null,
      party: null,
      technical: null,
      accessibilityRating: 4,
      availabilityRules: null,
      impressions: null,
      thumbnailUrl: null,
      lon: 11.25,
      lat: 43.77,
    };
    const ctx = await buildTestApp({
      repos: { search: { prefilterLocations: async () => [candidate] } },
      ai: {
        parseBrief: vi.fn(async () => ({ pax: 150, city: 'Firenze', tags: ['gala_dinner'] })),
        rerank: vi.fn(async () => [
          {
            location_id: 'l1',
            score: 88,
            reasons: { matched: ['capienza ok'], unmatched: [], to_verify: ['musica fino alle 2'] },
          },
        ]),
      },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/search/brief',
      headers: auth(ctx.tokens.editor),
      payload: { brief: 'Cena di gala per 150 persone a Firenze', limit: 5 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].score).toBe(88);
    expect(body.data[0].location.id).toBe('l1');
    expect(body.data[0].reasons.to_verify).toEqual(['musica fino alle 2']);
    expect(body.criteria).toMatchObject({ pax: 150, city: 'Firenze' });
  });
});
