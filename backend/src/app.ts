import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { env } from './config.js';
import { HttpError } from './lib/errors.js';
import { verifyToken, type AuthUser } from './auth/jwt.js';
import type { Repos } from './db/repos/index.js';
import type { AiService } from './ai/service.js';
import type { StorageService } from './storage/s3.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { locationRoutes } from './routes/locations.js';
import { locationSubRoutes } from './routes/locationSub.js';
import { ingestRoutes } from './routes/ingest.js';
import { searchRoutes } from './routes/search.js';
import { poiRoutes } from './routes/pois.js';
import { tagRoutes } from './routes/tags.js';
import { projectRoutes } from './routes/projects.js';
import { eventRoutes } from './routes/events.js';
import { eventLocationRoutes } from './routes/eventLocations.js';
import { feedbackRoutes } from './routes/feedback.js';
import { companyRoutes } from './routes/companies.js';
import { contactRoutes } from './routes/contacts.js';
import { geocodeRoutes } from './routes/geocode.js';
import type { GeocodeFn } from './lib/geocode.js';
import type { MapThumbRenderer } from './lib/staticmap.js';

export interface AppDeps {
  repos: Repos;
  ai: AiService;
  storage: StorageService;
  jwtSecret: string;
  /** Optional geocoder override (tests); defaults to OSM Nominatim. */
  geocode?: GeocodeFn;
  /** Optional map thumbnail renderer override (tests); defaults to OSM tiles + sharp. */
  renderMapThumb?: MapThumbRenderer;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
  interface FastifyRequest {
    user: AuthUser | null;
  }
  interface FastifyContextConfig {
    public?: boolean;
  }
}

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: env.NODE_ENV !== 'test' });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.decorate('deps', deps);
  app.decorateRequest('user', null);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      const message = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message } });
    }
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }
    const e = err as { statusCode?: unknown; code?: unknown; message?: unknown };
    const status = typeof e.statusCode === 'number' ? e.statusCode : 500;
    const code = status >= 500 ? 'INTERNAL_ERROR' : typeof e.code === 'string' ? e.code : 'BAD_REQUEST';
    if (status >= 500) app.log.error(err);
    return reply.status(status).send({
      error: {
        code,
        message: status >= 500 ? 'Internal server error' : String(e.message ?? 'Request failed'),
      },
    });
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.addHook('onRequest', async (req) => {
    if (req.routeOptions.config?.public) return;
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Missing bearer token');
    }
    try {
      req.user = verifyToken(header.slice(7), deps.jwtSecret);
    } catch {
      throw new HttpError(401, 'UNAUTHORIZED', 'Invalid or expired token');
    }
    if (req.user.role === 'viewer' && WRITE_METHODS.has(req.method)) {
      throw new HttpError(403, 'FORBIDDEN', 'Viewers have read-only access');
    }
  });

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes);
      await api.register(locationRoutes);
      await api.register(locationSubRoutes);
      await api.register(ingestRoutes);
      await api.register(searchRoutes);
      await api.register(poiRoutes);
      await api.register(tagRoutes);
      await api.register(projectRoutes);
      await api.register(eventRoutes);
      await api.register(eventLocationRoutes);
      await api.register(feedbackRoutes);
      await api.register(companyRoutes);
      await api.register(contactRoutes);
      await api.register(geocodeRoutes);
    },
    { prefix: '/api/v1' },
  );

  return app;
}
