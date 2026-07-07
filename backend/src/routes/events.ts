import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound } from '../lib/errors.js';
import { rowToApi, rowsToApi } from '../lib/apiMappers.js';
import { buildFeatureCollection } from '../lib/geojson.js';
import { buildCompareMatrix } from '../lib/serializers.js';
import { registerTags } from '../lib/tagService.js';

const IdParams = z.object({ id: z.string() });

const EventBody = z.object({
  name: z.string().min(1),
  event_type: z.string().nullish(),
  date_start: z.string().nullish(),
  date_end: z.string().nullish(),
  pax: z.number().int().positive().nullish(),
  brief: z.string().nullish(),
  notes: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  sort: z.number().int().optional(),
});

const ProposalBody = z.object({
  location_ids: z.array(z.string()).min(1),
  include: z
    .object({
      photos: z.boolean().default(true),
      capacities: z.boolean().default(true),
      distances: z.boolean().default(false),
      prices: z.boolean().default(false),
    })
    .default({ photos: true, capacities: true, distances: false, prices: false }),
  tone: z.string().default('professionale'),
});

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  const { repos } = app.deps;

  const mustGetEvent = async (id: string) => {
    const event = await repos.projects.getEvent(id);
    if (!event) throw notFound('Event');
    return event;
  };

  app.get('/projects/:id/events', async (req) => {
    const { id } = IdParams.parse(req.params);
    const project = await repos.projects.getById(id);
    if (!project) throw notFound('Project');
    return { data: rowsToApi(await repos.projects.listEvents(id)) };
  });

  app.post('/projects/:id/events', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const project = await repos.projects.getById(id);
    if (!project) throw notFound('Project');
    const body = EventBody.parse(req.body);
    const row = await repos.projects.createEvent({
      projectId: id,
      name: body.name,
      eventType: body.event_type ?? null,
      dateStart: body.date_start ?? null,
      dateEnd: body.date_end ?? null,
      pax: body.pax ?? null,
      brief: body.brief ?? null,
      notes: body.notes ?? null,
      // Unknown tag names are auto-registered in the shared smart tags registry.
      tags: body.tags ? await registerTags(repos.tags, body.tags) : null,
      sort: body.sort ?? 0,
    });
    reply.status(201);
    return rowToApi(row);
  });

  app.get('/events/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    return rowToApi(await mustGetEvent(id));
  });

  app.patch('/events/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    const body = EventBody.partial().parse(req.body);
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch['name'] = body.name;
    if (body.event_type !== undefined) patch['eventType'] = body.event_type;
    if (body.date_start !== undefined) patch['dateStart'] = body.date_start;
    if (body.date_end !== undefined) patch['dateEnd'] = body.date_end;
    if (body.pax !== undefined) patch['pax'] = body.pax;
    if (body.brief !== undefined) patch['brief'] = body.brief;
    if (body.notes !== undefined) patch['notes'] = body.notes;
    if (body.tags !== undefined) {
      // Unknown tag names are auto-registered in the shared smart tags registry.
      patch['tags'] = body.tags === null ? null : await registerTags(repos.tags, body.tags);
    }
    if (body.sort !== undefined) patch['sort'] = body.sort;
    const row = await repos.projects.updateEvent(id, patch as never);
    if (!row) throw notFound('Event');
    return rowToApi(row);
  });

  // Hard delete: event_locations and their visits/quotes/availability cascade
  // at DB level (0000_init.sql ON DELETE CASCADE chain).
  app.delete('/events/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const ok = await repos.projects.deleteEvent(id);
    if (!ok) throw notFound('Event');
    reply.status(204);
  });

  // ---- shortlist ----
  app.get('/events/:id/locations', async (req) => {
    const { id } = IdParams.parse(req.params);
    await mustGetEvent(id);
    const shortlist = await repos.projects.listEventLocations(id);
    const elIds = shortlist.map((s) => s.id);
    const [visits, quoteRows, availability] = await Promise.all([
      repos.projects.listVisits(elIds),
      repos.projects.listQuotes(elIds),
      repos.projects.listAvailability(elIds),
    ]);
    return {
      data: shortlist.map((s) => ({
        ...rowToApi(s as unknown as Record<string, unknown>),
        visits: rowsToApi(visits.filter((v) => v.eventLocationId === s.id)),
        quotes: rowsToApi(quoteRows.filter((q) => q.eventLocationId === s.id)),
        availability: rowsToApi(availability.filter((a) => a.eventLocationId === s.id)),
      })),
    };
  });

  app.post('/events/:id/locations', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    await mustGetEvent(id);
    const body = z
      .object({
        location_id: z.string(),
        status: z
          .enum([
            'preselezionata',
            'proposta',
            'sopralluogo_fissato',
            'in_valutazione',
            'preferita',
            'scartata',
            'confermata',
            'utilizzata',
          ])
          .optional(),
        notes: z.string().nullish(),
      })
      .parse(req.body);
    const location = await repos.locations.getById(body.location_id);
    if (!location) throw notFound('Location');
    const existing = await repos.projects.listEventLocations(id);
    if (existing.some((e) => e.locationId === body.location_id)) {
      throw badRequest('Location is already in this event shortlist');
    }
    const row = await repos.projects.addEventLocation({
      eventId: id,
      locationId: body.location_id,
      status: body.status ?? 'preselezionata',
      notes: body.notes ?? null,
    });
    reply.status(201);
    return rowToApi(row);
  });

  // ---- compare ----
  app.get('/events/:id/compare', async (req) => {
    const { id } = IdParams.parse(req.params);
    await mustGetEvent(id);
    const shortlist = await repos.projects.listEventLocations(id);
    const elIds = shortlist.map((s) => s.id);
    const locationIds = shortlist.map((s) => s.locationId);
    const [capRows, quoteRows, availabilityRows] = await Promise.all([
      repos.locations.capacitiesForLocations(locationIds),
      repos.projects.listQuotes(elIds),
      repos.projects.listAvailability(elIds),
    ]);

    const capacities = new Map<string, Array<{ configuration: string; capacity: number }>>();
    for (const c of capRows) {
      const list = capacities.get(c.locationId) ?? [];
      list.push({ configuration: c.configuration, capacity: c.capacity });
      capacities.set(c.locationId, list);
    }
    const quotesByEl = new Map<string, Array<{ amount: string | null; status: string }>>();
    for (const q of quoteRows) {
      const list = quotesByEl.get(q.eventLocationId) ?? [];
      list.push({ amount: q.amount, status: q.status });
      quotesByEl.set(q.eventLocationId, list);
    }
    const availByEl = new Map<string, Array<{ date: string; status: string }>>();
    for (const a of availabilityRows) {
      const list = availByEl.get(a.eventLocationId) ?? [];
      list.push({ date: a.date, status: a.status });
      availByEl.set(a.eventLocationId, list);
    }

    return {
      data: buildCompareMatrix({
        shortlist: shortlist.map((s) => ({
          id: s.id,
          locationId: s.locationId,
          locationName: s.locationName,
          status: s.status,
          matchScore: s.matchScore,
        })),
        capacities,
        quotes: quotesByEl,
        availability: availByEl,
      }),
    };
  });

  // ---- map ----
  app.get('/events/:id/map', async (req) => {
    const { id } = IdParams.parse(req.params);
    await mustGetEvent(id);
    const query = z.object({ pois: z.string().optional() }).parse(req.query);
    const mapRows = await repos.projects.mapLocationsForEvents([id]);
    const poiRows = query.pois !== undefined ? await repos.registry.listPois() : [];
    return buildFeatureCollection(mapRows, poiRows);
  });

  // ---- proposals (phase 3 stub) ----
  app.post('/events/:id/proposal', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    await mustGetEvent(id);
    ProposalBody.parse(req.body);
    reply.status(501);
    return {
      error: { code: 'NOT_IMPLEMENTED', message: 'Proposal generation arrives in phase 3' },
      shape: { html_url: null, pdf_url: null },
    };
  });
}
