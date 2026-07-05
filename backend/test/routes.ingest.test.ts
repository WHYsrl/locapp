import { describe, expect, it, vi } from 'vitest';
import { buildTestApp, auth, sampleDraft } from './helpers.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 10));

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
