import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { rowToApi, rowsToApi } from '../lib/apiMappers.js';

const IdParams = z.object({ id: z.string() });

const EventLocationPatch = z.object({
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
  client_feedback: z.string().nullish(),
  notes: z.string().nullish(),
  match_score: z.number().min(0).max(100).nullish(),
});

const VisitBody = z.object({
  scheduled_at: z.string(),
  duration_min: z.number().int().positive().nullish(),
  attendees: z.string().nullish(),
  with_client: z.boolean().default(false),
  outcome: z.string().nullish(),
});

const QuoteBody = z.object({
  amount: z.number().nullish(),
  currency: z.string().default('EUR'),
  status: z.enum(['richiesto', 'ricevuto', 'accettato', 'rifiutato', 'scaduto']).default('richiesto'),
  received_at: z.string().nullish(),
  valid_until: z.string().nullish(),
  media_id: z.string().nullish(),
  notes: z.string().nullish(),
});

const AvailabilityBody = z.object({
  date: z.string(),
  time_from: z.string().nullish(),
  time_to: z.string().nullish(),
  status: z.enum(['disponibile', 'opzionata', 'non_disponibile']).default('disponibile'),
  option_expires_at: z.string().nullish(),
  notes: z.string().nullish(),
});

export async function eventLocationRoutes(app: FastifyInstance): Promise<void> {
  const { repos } = app.deps;

  const mustGet = async (id: string) => {
    const row = await repos.projects.getEventLocation(id);
    if (!row) throw notFound('Event location');
    return row;
  };

  app.patch('/event-locations/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    const body = EventLocationPatch.parse(req.body);
    const patch: Record<string, unknown> = {};
    if (body.status !== undefined) patch['status'] = body.status;
    if (body.client_feedback !== undefined) patch['clientFeedback'] = body.client_feedback;
    if (body.notes !== undefined) patch['notes'] = body.notes;
    if (body.match_score !== undefined) {
      patch['matchScore'] = body.match_score == null ? null : String(body.match_score);
    }
    const row = await repos.projects.updateEventLocation(id, patch as never);
    if (!row) throw notFound('Event location');
    return rowToApi(row);
  });

  app.delete('/event-locations/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const ok = await repos.projects.deleteEventLocation(id);
    if (!ok) throw notFound('Event location');
    reply.status(204);
  });

  // ---- site visits ----
  app.get('/event-locations/:id/visits', async (req) => {
    const { id } = IdParams.parse(req.params);
    await mustGet(id);
    return { data: rowsToApi(await repos.projects.listVisits([id])) };
  });

  app.post('/event-locations/:id/visits', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    await mustGet(id);
    const body = VisitBody.parse(req.body);
    const row = await repos.projects.createVisit({
      eventLocationId: id,
      scheduledAt: new Date(body.scheduled_at),
      durationMin: body.duration_min ?? null,
      attendees: body.attendees ?? null,
      withClient: body.with_client,
      outcome: body.outcome ?? null,
    });
    reply.status(201);
    return rowToApi(row);
  });

  app.delete('/visits/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const ok = await repos.projects.deleteVisit(id);
    if (!ok) throw notFound('Site visit');
    reply.status(204);
  });

  // ---- quotes ----
  app.get('/event-locations/:id/quotes', async (req) => {
    const { id } = IdParams.parse(req.params);
    await mustGet(id);
    return { data: rowsToApi(await repos.projects.listQuotes([id])) };
  });

  app.post('/event-locations/:id/quotes', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    await mustGet(id);
    const body = QuoteBody.parse(req.body);
    const row = await repos.projects.createQuote({
      eventLocationId: id,
      amount: body.amount == null ? null : String(body.amount),
      currency: body.currency,
      status: body.status,
      receivedAt: body.received_at ? new Date(body.received_at) : null,
      validUntil: body.valid_until ?? null,
      mediaId: body.media_id ?? null,
      notes: body.notes ?? null,
    });
    reply.status(201);
    return rowToApi(row);
  });

  app.patch('/quotes/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    const body = QuoteBody.partial().parse(req.body);
    const patch: Record<string, unknown> = {};
    if (body.amount !== undefined) patch['amount'] = body.amount == null ? null : String(body.amount);
    if (body.currency !== undefined) patch['currency'] = body.currency;
    if (body.status !== undefined) patch['status'] = body.status;
    if (body.received_at !== undefined) {
      patch['receivedAt'] = body.received_at ? new Date(body.received_at) : null;
    }
    if (body.valid_until !== undefined) patch['validUntil'] = body.valid_until;
    if (body.notes !== undefined) patch['notes'] = body.notes;
    const row = await repos.projects.updateQuote(id, patch as never);
    if (!row) throw notFound('Quote');
    return rowToApi(row);
  });

  app.delete('/quotes/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const ok = await repos.projects.deleteQuote(id);
    if (!ok) throw notFound('Quote');
    reply.status(204);
  });

  // ---- availability ----
  app.get('/event-locations/:id/availability', async (req) => {
    const { id } = IdParams.parse(req.params);
    await mustGet(id);
    return { data: rowsToApi(await repos.projects.listAvailability([id])) };
  });

  app.post('/event-locations/:id/availability', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    await mustGet(id);
    const body = AvailabilityBody.parse(req.body);
    const row = await repos.projects.createAvailability({
      eventLocationId: id,
      date: body.date,
      timeFrom: body.time_from ?? null,
      timeTo: body.time_to ?? null,
      status: body.status,
      optionExpiresAt: body.option_expires_at ?? null,
      notes: body.notes ?? null,
    });
    reply.status(201);
    return rowToApi(row);
  });

  app.delete('/availability/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const ok = await repos.projects.deleteAvailability(id);
    if (!ok) throw notFound('Availability slot');
    reply.status(204);
  });
}
