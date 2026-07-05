import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { paginated, parsePagination } from '../lib/pagination.js';
import { rowToApi, rowsToApi } from '../lib/apiMappers.js';

const IdParams = z.object({ id: z.string() });

const ContactBody = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  notes: z.string().nullish(),
});

export async function contactRoutes(app: FastifyInstance): Promise<void> {
  const { repos } = app.deps;

  app.get('/contacts', async (req) => {
    const p = parsePagination(req.query);
    const query = z.object({ q: z.string().optional() }).parse(req.query);
    const { rows, total } = await repos.registry.listContacts(p, query.q);
    return paginated(rowsToApi(rows), total, p);
  });

  app.post('/contacts', async (req, reply) => {
    const body = ContactBody.parse(req.body);
    const row = await repos.registry.createContact({
      firstName: body.first_name,
      lastName: body.last_name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      notes: body.notes ?? null,
    });
    reply.status(201);
    return rowToApi(row);
  });

  app.get('/contacts/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    const row = await repos.registry.getContact(id);
    if (!row) throw notFound('Contact');
    return rowToApi(row);
  });

  app.patch('/contacts/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    const body = ContactBody.partial().parse(req.body);
    const patch: Record<string, unknown> = {};
    if (body.first_name !== undefined) patch['firstName'] = body.first_name;
    if (body.last_name !== undefined) patch['lastName'] = body.last_name;
    if (body.email !== undefined) patch['email'] = body.email;
    if (body.phone !== undefined) patch['phone'] = body.phone;
    if (body.notes !== undefined) patch['notes'] = body.notes;
    const row = await repos.registry.updateContact(id, patch as never);
    if (!row) throw notFound('Contact');
    return rowToApi(row);
  });

  app.delete('/contacts/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const ok = await repos.registry.softDeleteContact(id);
    if (!ok) throw notFound('Contact');
    reply.status(204);
  });
}
