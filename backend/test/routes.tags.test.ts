import { describe, expect, it, vi } from 'vitest';
import { buildTestApp, auth } from './helpers.js';

const tag = { id: 't1', name: 'gala_dinner', color: '#aa00ff', createdAt: new Date() };

describe('tag routes', () => {
  it('GET /tags requires auth and lists the registry', async () => {
    const ctx = await buildTestApp({ repos: { tags: { list: async () => [tag] } } });
    const noToken = await ctx.app.inject({ method: 'GET', url: '/api/v1/tags' });
    expect(noToken.statusCode).toBe(401);

    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/tags', headers: auth(ctx.tokens.viewer) });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0]).toMatchObject({ id: 't1', name: 'gala_dinner', color: '#aa00ff' });
  });

  it('POST /tags normalizes the name and creates the tag (editor+)', async () => {
    const ctx = await buildTestApp();
    const asViewer = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: auth(ctx.tokens.viewer),
      payload: { name: 'Nuovo Tag' },
    });
    expect(asViewer.statusCode).toBe(403);

    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: auth(ctx.tokens.editor),
      payload: { name: '  Cena Aziendale ', color: '#112233' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ name: 'cena_aziendale', color: '#112233' });
  });

  it('POST /tags rejects duplicate names', async () => {
    const ctx = await buildTestApp({ repos: { tags: { findByName: async () => tag } } });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: auth(ctx.tokens.editor),
      payload: { name: 'Gala Dinner' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('already exists');
  });

  it('PATCH /tags/:id renames the tag and propagates into stored arrays', async () => {
    const renameInArrays = vi.fn(async () => undefined);
    const ctx = await buildTestApp({
      repos: {
        tags: {
          getById: async () => tag,
          update: async (_id: string, patch: Record<string, unknown>) => ({ ...tag, ...patch }),
          renameInArrays,
        },
      },
    });
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/tags/t1',
      headers: auth(ctx.tokens.editor),
      payload: { name: 'Cena di Gala' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('cena_di_gala');
    expect(renameInArrays).toHaveBeenCalledTimes(1);
    expect(renameInArrays).toHaveBeenCalledWith('gala_dinner', 'cena_di_gala');
  });

  it('PATCH /tags/:id with only a color change does not propagate', async () => {
    const renameInArrays = vi.fn(async () => undefined);
    const ctx = await buildTestApp({
      repos: {
        tags: {
          getById: async () => tag,
          update: async (_id: string, patch: Record<string, unknown>) => ({ ...tag, ...patch }),
          renameInArrays,
        },
      },
    });
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/tags/t1',
      headers: auth(ctx.tokens.editor),
      payload: { color: '#00ff00' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().color).toBe('#00ff00');
    expect(renameInArrays).not.toHaveBeenCalled();
  });

  it('PATCH /tags/:id returns 404 for unknown tags', async () => {
    const ctx = await buildTestApp();
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/tags/missing',
      headers: auth(ctx.tokens.editor),
      payload: { name: 'x' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /tags/:id is admin-only and removes from the registry only', async () => {
    const ctx = await buildTestApp();
    const asEditor = await ctx.app.inject({
      method: 'DELETE',
      url: '/api/v1/tags/t1',
      headers: auth(ctx.tokens.editor),
    });
    expect(asEditor.statusCode).toBe(403);

    const asAdmin = await ctx.app.inject({
      method: 'DELETE',
      url: '/api/v1/tags/t1',
      headers: auth(ctx.tokens.admin),
    });
    expect(asAdmin.statusCode).toBe(204);
  });

  it('PATCH /projects/:id accepts tags and auto-registers unknown names', async () => {
    const upsertMissing = vi.fn(async () => []);
    const ctx = await buildTestApp({
      repos: {
        projects: {
          update: async (id: string, patch: Record<string, unknown>) => ({ id, name: 'Convention ACME', ...patch }),
        },
        tags: { upsertMissing },
      },
    });
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/projects/p1',
      headers: auth(ctx.tokens.editor),
      payload: { tags: [' Gala Dinner ', 'conferenze'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tags).toEqual(['gala_dinner', 'conferenze']);
    expect(upsertMissing).toHaveBeenCalledWith(['gala_dinner', 'conferenze']);
  });

  it('PATCH /events/:id accepts tags and auto-registers unknown names', async () => {
    const upsertMissing = vi.fn(async () => []);
    const ctx = await buildTestApp({
      repos: {
        projects: {
          updateEvent: async (id: string, patch: Record<string, unknown>) => ({ id, name: 'Cena di gala', ...patch }),
        },
        tags: { upsertMissing },
      },
    });
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/events/e1',
      headers: auth(ctx.tokens.editor),
      payload: { tags: ['Team Building'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tags).toEqual(['team_building']);
    expect(upsertMissing).toHaveBeenCalledWith(['team_building']);
  });

  it('PATCH /locations/:id auto-registers smart tags in the registry', async () => {
    const upsertMissing = vi.fn(async () => []);
    const ctx = await buildTestApp({ repos: { tags: { upsertMissing } } });
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/locations/l1',
      headers: auth(ctx.tokens.editor),
      payload: { smart_tags: ['Shooting', ' Nuovo Uso '] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().smart_tags).toEqual(['shooting', 'nuovo_uso']);
    expect(upsertMissing).toHaveBeenCalledWith(['shooting', 'nuovo_uso']);
  });
});
