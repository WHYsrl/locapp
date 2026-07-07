import { describe, expect, it, vi } from 'vitest';
import { buildTestApp, auth } from './helpers.js';

const location = { id: 'loc-1', name: 'Villa Test', deletedAt: null };
const usageRow = {
  projectId: 'p1',
  projectName: 'Convention ACME',
  eventId: 'e1',
  eventName: 'Cena di gala',
  status: 'proposta',
  dateStart: null,
  dateEnd: null,
};

describe('DELETE /locations/:id rules', () => {
  it('soft-deletes an unreferenced leaf location (204)', async () => {
    const softDelete = vi.fn(async () => true);
    const ctx = await buildTestApp({
      repos: { locations: { getById: async () => location, softDelete } },
    });
    const res = await ctx.app.inject({
      method: 'DELETE',
      url: '/api/v1/locations/loc-1',
      headers: auth(ctx.tokens.editor),
    });
    expect(res.statusCode).toBe(204);
    expect(softDelete).toHaveBeenCalledWith('loc-1');
  });

  it('returns 409 LOCATION_IN_USE with project/event names when shortlisted', async () => {
    const softDelete = vi.fn(async () => true);
    const ctx = await buildTestApp({
      repos: {
        locations: { getById: async () => location, usage: async () => [usageRow], softDelete },
      },
    });
    const res = await ctx.app.inject({
      method: 'DELETE',
      url: '/api/v1/locations/loc-1',
      headers: auth(ctx.tokens.editor),
    });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error.code).toBe('LOCATION_IN_USE');
    expect(body.error.message).toContain('Convention ACME');
    expect(body.error.message).toContain('Cena di gala');
    expect(body.error.details.references).toEqual([
      { project: 'Convention ACME', event: 'Cena di gala', status: 'proposta' },
    ]);
    expect(softDelete).not.toHaveBeenCalled();
  });

  it('force=true removes shortlist references and detaches children, then soft-deletes', async () => {
    const removeShortlistReferences = vi.fn(async () => 1);
    const detachChildren = vi.fn(async () => 2);
    const softDelete = vi.fn(async () => true);
    const ctx = await buildTestApp({
      repos: {
        locations: {
          getById: async () => location,
          usage: async () => [usageRow],
          listChildren: async () => [
            { id: 'c1', name: 'Sala A' },
            { id: 'c2', name: 'Sala B' },
          ],
          removeShortlistReferences,
          detachChildren,
          softDelete,
        },
      },
    });
    const res = await ctx.app.inject({
      method: 'DELETE',
      url: '/api/v1/locations/loc-1?force=true',
      headers: auth(ctx.tokens.editor),
    });
    expect(res.statusCode).toBe(204);
    expect(removeShortlistReferences).toHaveBeenCalledWith('loc-1');
    expect(detachChildren).toHaveBeenCalledWith('loc-1');
    expect(softDelete).toHaveBeenCalledWith('loc-1');
  });

  it('returns 409 HAS_CHILDREN when the location has children and no force', async () => {
    const ctx = await buildTestApp({
      repos: {
        locations: {
          getById: async () => location,
          listChildren: async () => [{ id: 'c1', name: 'Sala A' }],
        },
      },
    });
    const res = await ctx.app.inject({
      method: 'DELETE',
      url: '/api/v1/locations/loc-1',
      headers: auth(ctx.tokens.editor),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('HAS_CHILDREN');
    expect(res.json().error.details.children).toEqual([{ id: 'c1', name: 'Sala A' }]);
  });

  it('returns 404 for unknown (or already deleted) locations', async () => {
    const ctx = await buildTestApp();
    const res = await ctx.app.inject({
      method: 'DELETE',
      url: '/api/v1/locations/ghost',
      headers: auth(ctx.tokens.editor),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /projects/:id rules', () => {
  const project = { id: 'p1', name: 'Convention ACME', deletedAt: null };
  const projectEvents = [
    { id: 'e1', name: 'Cena di gala' },
    { id: 'e2', name: 'Plenaria' },
  ];

  it('returns 409 PROJECT_HAS_EVENTS listing the event names', async () => {
    const softDelete = vi.fn(async () => true);
    const ctx = await buildTestApp({
      repos: {
        projects: { getById: async () => project, listEvents: async () => projectEvents, softDelete },
      },
    });
    const res = await ctx.app.inject({
      method: 'DELETE',
      url: '/api/v1/projects/p1',
      headers: auth(ctx.tokens.editor),
    });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error.code).toBe('PROJECT_HAS_EVENTS');
    expect(body.error.message).toContain('Cena di gala');
    expect(body.error.details.events).toEqual([
      { id: 'e1', name: 'Cena di gala' },
      { id: 'e2', name: 'Plenaria' },
    ]);
    expect(softDelete).not.toHaveBeenCalled();
  });

  it('force=true cascades the events then soft-deletes the project', async () => {
    const deleteEventsForProject = vi.fn(async () => 2);
    const softDelete = vi.fn(async () => true);
    const ctx = await buildTestApp({
      repos: {
        projects: {
          getById: async () => project,
          listEvents: async () => projectEvents,
          deleteEventsForProject,
          softDelete,
        },
      },
    });
    const res = await ctx.app.inject({
      method: 'DELETE',
      url: '/api/v1/projects/p1?force=true',
      headers: auth(ctx.tokens.editor),
    });
    expect(res.statusCode).toBe(204);
    expect(deleteEventsForProject).toHaveBeenCalledWith('p1');
    expect(softDelete).toHaveBeenCalledWith('p1');
  });

  it('soft-deletes an empty project without force', async () => {
    const softDelete = vi.fn(async () => true);
    const ctx = await buildTestApp({
      repos: { projects: { getById: async () => project, softDelete } },
    });
    const res = await ctx.app.inject({
      method: 'DELETE',
      url: '/api/v1/projects/p1',
      headers: auth(ctx.tokens.editor),
    });
    expect(res.statusCode).toBe(204);
    expect(softDelete).toHaveBeenCalledWith('p1');
  });
});

describe('DELETE /events/:id', () => {
  it('deletes the event (shortlist rows cascade at DB level) and 404s on unknown ids', async () => {
    const deleteEvent = vi.fn(async (id: string) => id === 'e1');
    const ctx = await buildTestApp({ repos: { projects: { deleteEvent } } });
    const ok = await ctx.app.inject({
      method: 'DELETE',
      url: '/api/v1/events/e1',
      headers: auth(ctx.tokens.editor),
    });
    expect(ok.statusCode).toBe(204);
    const missing = await ctx.app.inject({
      method: 'DELETE',
      url: '/api/v1/events/ghost',
      headers: auth(ctx.tokens.editor),
    });
    expect(missing.statusCode).toBe(404);
  });
});
