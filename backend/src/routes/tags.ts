import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { rowToApi, rowsToApi } from '../lib/apiMappers.js';
import { normalizeTagName } from '../lib/tagService.js';

const IdParams = z.object({ id: z.string() });

const TagBody = z.object({
  name: z.string().min(1),
  color: z.string().nullish(),
});

export async function tagRoutes(app: FastifyInstance): Promise<void> {
  const { repos } = app.deps;

  app.get('/tags', async () => {
    return { data: rowsToApi(await repos.tags.list()) };
  });

  // editor+ (viewers are already blocked from writes by the global auth hook)
  app.post('/tags', async (req, reply) => {
    const body = TagBody.parse(req.body);
    const name = normalizeTagName(body.name);
    if (!name) throw badRequest('Tag name cannot be empty');
    if (await repos.tags.findByName(name)) throw badRequest('Tag already exists');
    const row = await repos.tags.create({ name, color: body.color ?? null });
    reply.status(201);
    return rowToApi(row);
  });

  app.patch('/tags/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    const body = TagBody.partial().parse(req.body);
    const tag = await repos.tags.getById(id);
    if (!tag) throw notFound('Tag');

    const patch: Record<string, unknown> = {};
    let newName: string | null = null;
    if (body.name !== undefined) {
      newName = normalizeTagName(body.name);
      if (!newName) throw badRequest('Tag name cannot be empty');
      if (newName !== tag.name && (await repos.tags.findByName(newName))) {
        throw badRequest('Tag already exists');
      }
      patch['name'] = newName;
    }
    if (body.color !== undefined) patch['color'] = body.color;

    const row = await repos.tags.update(id, patch as never);
    if (!row) throw notFound('Tag');
    // A rename propagates into every stored tag array (locations/projects/events).
    if (newName && newName !== tag.name) await repos.tags.renameInArrays(tag.name, newName);
    return rowToApi(row);
  });

  app.delete('/tags/:id', async (req, reply) => {
    if (req.user?.role !== 'admin') throw forbidden('Only admins can delete tags');
    const { id } = IdParams.parse(req.params);
    const ok = await repos.tags.delete(id);
    if (!ok) throw notFound('Tag');
    // Registry-only removal: tag values already stored in arrays are left untouched.
    reply.status(204);
  });
}
