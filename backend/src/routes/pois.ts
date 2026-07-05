import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { rowToApi } from '../lib/apiMappers.js';

const PoiBody = z.object({
  name: z.string().min(1),
  kind: z.enum(['hotel', 'aeroporto', 'stazione', 'monumento', 'altro']).default('altro'),
  lon: z.number(),
  lat: z.number(),
});

export async function poiRoutes(app: FastifyInstance): Promise<void> {
  const { repos } = app.deps;

  app.get('/pois', async () => {
    const rows = await repos.registry.listPois();
    return { data: rows };
  });

  app.post('/pois', async (req, reply) => {
    const body = PoiBody.parse(req.body);
    const row = await repos.registry.createPoi({
      name: body.name,
      kind: body.kind,
      geom: { lon: body.lon, lat: body.lat },
    });
    reply.status(201);
    return { ...rowToApi(row), lon: body.lon, lat: body.lat };
  });
}
