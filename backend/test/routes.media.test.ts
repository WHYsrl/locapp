import { describe, expect, it, vi } from 'vitest';
import { buildTestApp, auth } from './helpers.js';

const location = { id: 'loc-1', name: 'Grand Hotel Aurelia', deletedAt: null };

const mediaRow = {
  id: 'media-1',
  locationId: 'loc-1',
  spaceId: null,
  kind: 'foto',
  category: 'esterni',
  url: 'locations/loc-1/abc-facciata.jpg',
  filename: 'facciata.jpg',
  mime: 'image/jpeg',
  aiTags: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const STORAGE_ERROR = {
  error: {
    code: 'storage_not_configured',
    message: 'Storage media non configurato: impostare le variabili S3_* su Render',
  },
};

describe('media routes', () => {
  it('POST /locations/:id/media presigns a Content-Type-bound PUT and stores the S3 key in url', async () => {
    const ctx = await buildTestApp({
      repos: { locations: { getById: async () => location } },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/locations/loc-1/media',
      headers: auth(ctx.tokens.editor),
      payload: {
        kind: 'planimetria',
        category: 'sala',
        space_id: 'space-9',
        filename: 'pianta sala.pdf',
        mime: 'application/pdf',
      },
    });
    expect(res.statusCode).toBe(201);

    const presignPut = ctx.storage.presignPut as ReturnType<typeof vi.fn>;
    expect(presignPut).toHaveBeenCalledTimes(1);
    const [key, mime] = presignPut.mock.calls[0] as [string, string];
    expect(key).toMatch(/^locations\/loc-1\/.+-pianta_sala\.pdf$/);
    expect(mime).toBe('application/pdf');

    const body = res.json();
    expect(body.data.upload_url).toContain('sig=put');
    expect(body.data.media).toMatchObject({
      kind: 'planimetria',
      category: 'sala',
      space_id: 'space-9',
      url: key,
      filename: 'pianta sala.pdf',
      mime: 'application/pdf',
    });
  });

  it('POST /locations/:id/media rejects an unknown category', async () => {
    const ctx = await buildTestApp({
      repos: { locations: { getById: async () => location } },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/locations/loc-1/media',
      headers: auth(ctx.tokens.editor),
      payload: { kind: 'foto', category: 'giardino', filename: 'a.jpg', mime: 'image/jpeg' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /locations/:id/media returns 503 storage_not_configured when S3 env is missing', async () => {
    const ctx = await buildTestApp({
      repos: { locations: { getById: async () => location } },
      storage: { isConfigured: () => false },
    });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/locations/loc-1/media',
      headers: auth(ctx.tokens.editor),
      payload: { kind: 'foto', filename: 'a.jpg', mime: 'image/jpeg' },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual(STORAGE_ERROR);
  });

  it('GET /media/:id/url presigns a GET for the stored key', async () => {
    const ctx = await buildTestApp({
      repos: { locations: { getMedia: async () => mediaRow } },
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/media/media-1/url',
      headers: auth(ctx.tokens.viewer),
    });
    expect(res.statusCode).toBe(200);
    expect(ctx.storage.presignGet).toHaveBeenCalledWith('locations/loc-1/abc-facciata.jpg');
    expect(res.json().data.url).toContain('sig=get');
  });

  it('GET /media/:id/url returns 503 when unconfigured and 404 for missing media', async () => {
    const unconfigured = await buildTestApp({ storage: { isConfigured: () => false } });
    const res503 = await unconfigured.app.inject({
      method: 'GET',
      url: '/api/v1/media/media-1/url',
      headers: auth(unconfigured.tokens.viewer),
    });
    expect(res503.statusCode).toBe(503);
    expect(res503.json()).toEqual(STORAGE_ERROR);

    const ctx = await buildTestApp();
    const res404 = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/media/nope/url',
      headers: auth(ctx.tokens.viewer),
    });
    expect(res404.statusCode).toBe(404);
  });

  it('PATCH /media/:id recatalogs kind/category/space_id', async () => {
    const updateMedia = vi.fn(async (id: string, patch: Record<string, unknown>) => ({
      ...mediaRow,
      id,
      ...patch,
    }));
    const ctx = await buildTestApp({ repos: { locations: { updateMedia } } });
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/media/media-1',
      headers: auth(ctx.tokens.editor),
      payload: { kind: 'documento', category: 'servizi', space_id: null },
    });
    expect(res.statusCode).toBe(200);
    expect(updateMedia).toHaveBeenCalledWith('media-1', {
      kind: 'documento',
      category: 'servizi',
      spaceId: null,
    });
    expect(res.json().data).toMatchObject({ kind: 'documento', category: 'servizi', space_id: null });
  });

  it('DELETE /media/:id removes the row and best-effort deletes the S3 object', async () => {
    const deleteMedia = vi.fn(async () => true);
    const ctx = await buildTestApp({
      repos: { locations: { getMedia: async () => mediaRow, deleteMedia } },
    });
    const res = await ctx.app.inject({
      method: 'DELETE',
      url: '/api/v1/media/media-1',
      headers: auth(ctx.tokens.editor),
    });
    expect(res.statusCode).toBe(204);
    expect(deleteMedia).toHaveBeenCalledWith('media-1');
    expect(ctx.storage.deleteObject).toHaveBeenCalledWith('locations/loc-1/abc-facciata.jpg');
  });

  it('DELETE /media/:id still succeeds when the S3 delete fails or storage is unconfigured', async () => {
    const failing = await buildTestApp({
      repos: { locations: { getMedia: async () => mediaRow } },
      storage: {
        deleteObject: vi.fn(async () => {
          throw new Error('boom');
        }),
      },
    });
    const res1 = await failing.app.inject({
      method: 'DELETE',
      url: '/api/v1/media/media-1',
      headers: auth(failing.tokens.editor),
    });
    expect(res1.statusCode).toBe(204);

    const unconfigured = await buildTestApp({
      repos: { locations: { getMedia: async () => mediaRow } },
      storage: { isConfigured: () => false },
    });
    const res2 = await unconfigured.app.inject({
      method: 'DELETE',
      url: '/api/v1/media/media-1',
      headers: auth(unconfigured.tokens.editor),
    });
    expect(res2.statusCode).toBe(204);
    expect(unconfigured.storage.deleteObject).not.toHaveBeenCalled();
  });

  it('GET /locations/:id returns media[] entries with kind/category/filename/mime', async () => {
    const ctx = await buildTestApp({
      repos: {
        locations: {
          getById: async () => ({ ...location, parentLocationId: null }),
          getRelations: async () => ({
            children: [],
            spaceRows: [],
            capacityRows: [],
            contactRows: [],
            supplierRows: [],
            mediaRows: [mediaRow],
            priceListRows: [],
          }),
        },
      },
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/locations/loc-1',
      headers: auth(ctx.tokens.viewer),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().media[0]).toMatchObject({
      id: 'media-1',
      kind: 'foto',
      category: 'esterni',
      filename: 'facciata.jpg',
      mime: 'image/jpeg',
      url: 'locations/loc-1/abc-facciata.jpg',
    });
  });
});
