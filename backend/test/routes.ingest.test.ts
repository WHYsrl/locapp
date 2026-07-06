import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTestApp, auth, sampleDraft } from './helpers.js';
import { enrichDraftWithGeocoding } from '../src/ingest/process.js';
import type { GeocodeCandidate } from '../src/lib/geocode.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

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

describe('ingest photos from url ingestion', () => {
  const readyJob = (extracted: unknown) => ({
    id: 'job-1',
    locationId: 'loc-1',
    status: 'ready',
    extracted,
    sourceType: 'url',
    createdAt: new Date(),
  });

  it('url ingestion adds proposed_media candidates scraped from the page', async () => {
    const html = `<html><head><meta property="og:image" content="https://venue.example/img/hero.jpg"></head>
      <body><h1>Villa dei Pini</h1><p>Firenze</p>
      <img src="/img/sala.jpg"><img src="/img/logo.png"><img src="/img/mini.jpg" width="90"></body></html>`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })),
    );
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
      ai: { extractLocationDraft: vi.fn(async () => structuredClone(sampleDraft)) },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/ingest',
      headers: auth(ctx.tokens.editor),
      payload: { source_type: 'url', url: 'https://venue.example/location' },
    });
    expect(res.statusCode).toBe(201);
    await flush();

    const final = updates.at(-1)!;
    expect(final['status']).toBe('ready');
    expect((final['extracted'] as { proposed_media: Array<{ url: string }> }).proposed_media).toEqual([
      { url: 'https://venue.example/img/hero.jpg' },
      { url: 'https://venue.example/img/sala.jpg' },
    ]);
  });

  it('apply downloads selected_media_urls, uploads to S3 and creates foto media rows', async () => {
    const jpegBytes = Buffer.from('fake-jpeg-bytes');
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/pagina.html')) {
        return new Response('nope', { status: 200, headers: { 'content-type': 'text/html' } });
      }
      return new Response(jpegBytes, { status: 200, headers: { 'content-type': 'image/jpeg' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const mediaRows: Array<Record<string, unknown>> = [];
    const ctx = await buildTestApp({
      repos: {
        ingestion: { getById: async () => readyJob(sampleDraft) },
        locations: {
          createMedia: vi.fn(async (input: Record<string, unknown>) => {
            mediaRows.push(input);
            return { id: 'media-1', ...input };
          }),
        },
      },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/ingest/job-1/apply',
      headers: auth(ctx.tokens.editor),
      payload: {
        accept: { 'location.name': true },
        selected_media_urls: ['https://venue.example/img/sala.jpg', 'https://venue.example/pagina.html'],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // First URL imported: direct S3 PutObject with the web ingestion key layout.
    expect(ctx.storage.putObject).toHaveBeenCalledOnce();
    expect(ctx.storage.putObject).toHaveBeenCalledWith(
      'locations/loc-1/web/1.jpg',
      expect.any(Buffer),
      'image/jpeg',
    );
    expect(mediaRows).toEqual([
      {
        locationId: 'loc-1',
        kind: 'foto',
        category: null,
        url: 'locations/loc-1/web/1.jpg',
        filename: 'sala.jpg',
        mime: 'image/jpeg',
      },
    ]);
    expect(body.imported_media).toEqual(['locations/loc-1/web/1.jpg']);
    // Second URL rejected: not an image content-type — warning, not failure.
    expect(body.warnings).toHaveLength(1);
    expect(body.warnings[0]).toContain('foto non importata');
    expect(body.warnings[0]).toContain('content-type non immagine');
  });

  it('apply rejects images over the 8MB cap with a warning', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(Buffer.from('x'), {
            status: 200,
            headers: { 'content-type': 'image/jpeg', 'content-length': String(9 * 1024 * 1024) },
          }),
      ),
    );
    const ctx = await buildTestApp({
      repos: { ingestion: { getById: async () => readyJob(sampleDraft) } },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/ingest/job-1/apply',
      headers: auth(ctx.tokens.editor),
      payload: { accept: {}, selected_media_urls: ['https://venue.example/img/enorme.jpg'] },
    });
    expect(res.statusCode).toBe(200);
    expect(ctx.storage.putObject).not.toHaveBeenCalled();
    expect(res.json().warnings[0]).toContain('oltre il limite di 8MB');
  });

  it('apply with unconfigured storage skips photos with a warning instead of failing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const ctx = await buildTestApp({
      repos: { ingestion: { getById: async () => readyJob(sampleDraft) } },
      storage: { isConfigured: vi.fn(() => false) },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/ingest/job-1/apply',
      headers: auth(ctx.tokens.editor),
      payload: { accept: { 'location.name': true }, selected_media_urls: ['https://venue.example/img/sala.jpg'] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.applied_fields).toEqual(['location.name']);
    expect(body.warnings).toEqual(['storage_not_configured — foto non importate']);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ctx.repos.locations.createMedia).not.toHaveBeenCalled();
  });

  it('apply without selected_media_urls stays photo-free and warning-free', async () => {
    const ctx = await buildTestApp({
      repos: { ingestion: { getById: async () => readyJob(sampleDraft) } },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/ingest/job-1/apply',
      headers: auth(ctx.tokens.editor),
      payload: { accept: { 'location.name': true } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().warnings).toEqual([]);
    expect(res.json().imported_media).toEqual([]);
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

    // Draft has name + city but no address_line: variant fallback lands on "name, city".
    expect(geocode).toHaveBeenCalledWith('Villa dei Pini, Firenze');
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
