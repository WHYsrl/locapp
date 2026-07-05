import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { rowsToApi } from '../lib/apiMappers.js';

const IdParams = z.object({ id: z.string() });

const FeedbackBatchBody = z.object({
  items: z
    .array(
      z.object({
        subject_type: z.enum(['location', 'company', 'contact']),
        subject_id: z.string(),
        ratings: z.record(z.string(), z.number().min(1).max(5)).nullish(),
        notes: z.string().nullish(),
      }),
    )
    .min(1),
});

export async function feedbackRoutes(app: FastifyInstance): Promise<void> {
  const { repos } = app.deps;

  app.post('/events/:id/feedback', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const event = await repos.projects.getEvent(id);
    if (!event) throw notFound('Event');
    const body = FeedbackBatchBody.parse(req.body);
    const rows = await repos.projects.createFeedback(
      body.items.map((item) => ({
        eventId: id,
        subjectType: item.subject_type,
        subjectId: item.subject_id,
        ratings: item.ratings ?? null,
        notes: item.notes ?? null,
        createdBy: req.user?.id ?? null,
      })),
    );
    reply.status(201);
    return { data: rowsToApi(rows) };
  });

  app.get('/events/:id/feedback', async (req) => {
    const { id } = IdParams.parse(req.params);
    const event = await repos.projects.getEvent(id);
    if (!event) throw notFound('Event');
    return { data: rowsToApi(await repos.projects.listFeedbackByEvent(id)) };
  });

  app.get('/locations/:id/feedback', async (req) => {
    const { id } = IdParams.parse(req.params);
    const location = await repos.locations.getById(id);
    if (!location) throw notFound('Location');
    return { data: rowsToApi(await repos.projects.listFeedbackForSubject('location', id)) };
  });

  app.get('/companies/:id/feedback', async (req) => {
    const { id } = IdParams.parse(req.params);
    const company = await repos.registry.getCompany(id);
    if (!company) throw notFound('Company');
    return { data: rowsToApi(await repos.projects.listFeedbackForSubject('company', id)) };
  });
}
