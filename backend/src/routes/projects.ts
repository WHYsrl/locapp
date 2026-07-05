import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { paginated, parsePagination } from '../lib/pagination.js';
import { rowToApi, rowsToApi } from '../lib/apiMappers.js';
import { buildFeatureCollection } from '../lib/geojson.js';

const IdParams = z.object({ id: z.string() });

const ProjectBody = z.object({
  name: z.string().min(1),
  client_name: z.string().nullish(),
  status: z.enum(['attivo', 'chiuso', 'archiviato']).optional(),
  notes: z.string().nullish(),
});

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  const { repos } = app.deps;

  app.get('/projects', async (req) => {
    const p = parsePagination(req.query);
    const query = z.object({ status: z.enum(['attivo', 'chiuso', 'archiviato']).optional() }).parse(req.query);
    const { rows, total } = await repos.projects.list(p, query.status);
    return paginated(rowsToApi(rows), total, p);
  });

  app.post('/projects', async (req, reply) => {
    const body = ProjectBody.parse(req.body);
    const row = await repos.projects.create({
      name: body.name,
      clientName: body.client_name ?? null,
      status: body.status ?? 'attivo',
      notes: body.notes ?? null,
    });
    reply.status(201);
    return rowToApi(row);
  });

  app.get('/projects/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    const project = await repos.projects.getById(id);
    if (!project) throw notFound('Project');
    const [eventRows, counts] = await Promise.all([
      repos.projects.listEvents(id),
      repos.projects.locationCountsByEvent(id),
    ]);
    const countsByEvent = new Map<string, Record<string, number>>();
    for (const c of counts) {
      const bucket = countsByEvent.get(c.eventId) ?? {};
      bucket[c.status] = c.count;
      countsByEvent.set(c.eventId, bucket);
    }
    return {
      ...rowToApi(project),
      events: eventRows.map((e) => ({
        ...rowToApi(e),
        location_counts: countsByEvent.get(e.id) ?? {},
      })),
    };
  });

  app.patch('/projects/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    const body = ProjectBody.partial().parse(req.body);
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch['name'] = body.name;
    if (body.client_name !== undefined) patch['clientName'] = body.client_name;
    if (body.status !== undefined) patch['status'] = body.status;
    if (body.notes !== undefined) patch['notes'] = body.notes;
    const row = await repos.projects.update(id, patch as never);
    if (!row) throw notFound('Project');
    return rowToApi(row);
  });

  app.delete('/projects/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const ok = await repos.projects.softDelete(id);
    if (!ok) throw notFound('Project');
    reply.status(204);
  });

  app.get('/projects/:id/map', async (req) => {
    const { id } = IdParams.parse(req.params);
    const project = await repos.projects.getById(id);
    if (!project) throw notFound('Project');
    const query = z.object({ pois: z.string().optional() }).parse(req.query);
    const eventRows = await repos.projects.listEvents(id);
    const mapRows = await repos.projects.mapLocationsForEvents(eventRows.map((e) => e.id));
    const poiRows = query.pois !== undefined ? await repos.registry.listPois() : [];
    return buildFeatureCollection(mapRows, poiRows);
  });
}
