import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { paginated, parsePagination, PaginationQuery } from '../lib/pagination.js';
import type { Repos } from '../db/repos/index.js';
import type { ExportJobRow } from '../db/schema.js';
import type { ExportKind } from '../export/collect.js';
import { processExportJob } from '../export/process.js';

const IncludeSchema = z
  .object({
    photos: z.boolean().default(true),
    capacities: z.boolean().default(true),
    distances: z.boolean().default(true),
    prices: z.boolean().default(false),
    ai_texts: z.boolean().default(true),
  })
  .default({ photos: true, capacities: true, distances: true, prices: false, ai_texts: true });

const ExportSlidesBody = z.object({
  /**
   * Google OAuth access token (scope https://www.googleapis.com/auth/drive.file)
   * obtained by the browser. Handed to the async processor IN MEMORY ONLY and
   * used solely as a Bearer header towards the Slides API — NEVER logged and
   * NEVER persisted (not on the export_jobs row, not anywhere else).
   */
  access_token: z.string().min(1),
  kind: z.enum(['location', 'event', 'project']),
  id: z.string().min(1),
  include: IncludeSchema,
});

const JobsListQuery = PaginationQuery.extend({
  kind: z.enum(['location', 'event', 'project']).optional(),
  q: z.string().optional(),
});

/** Resolves the display name of the export target; 404 when the id is unknown. */
async function resolveTargetName(repos: Repos, kind: ExportKind, id: string): Promise<string> {
  if (kind === 'location') {
    const location = await repos.locations.getById(id);
    if (!location) throw notFound('Location');
    return location.name;
  }
  if (kind === 'event') {
    const event = await repos.projects.getEvent(id);
    if (!event) throw notFound('Event');
    return event.name;
  }
  const project = await repos.projects.getById(id);
  if (!project) throw notFound('Project');
  return project.name;
}

/** Job row → API shape (contract agreed with web; token never present on rows). */
const jobToApi = (job: ExportJobRow) => ({
  id: job.id,
  kind: job.kind,
  target_id: job.targetId,
  target_name: job.targetName,
  status: job.status,
  url: job.url,
  presentation_id: job.presentationId,
  warnings: job.warnings ?? [],
  error: job.error,
  created_at: job.createdAt instanceof Date ? job.createdAt.toISOString() : job.createdAt,
  finished_at: job.finishedAt instanceof Date ? job.finishedAt.toISOString() : (job.finishedAt ?? null),
});

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  const { repos } = app.deps;

  // AI → Google Slides export, async job: validate → insert export_jobs row →
  // fire-and-forget processing (like /ingest) → 202 {job_id}; poll /export/jobs/:id.
  app.post('/export/slides', async (req, reply) => {
    const body = ExportSlidesBody.parse(req.body);
    const targetName = await resolveTargetName(repos, body.kind, body.id);

    const job = await repos.exportJobs.create({
      kind: body.kind,
      targetId: body.id,
      targetName,
      status: 'pending',
      include: body.include as Record<string, unknown>,
      requestedBy: req.user?.id ?? null,
    });

    // The access token travels only as a function argument (in memory), never on the row.
    void processExportJob(
      job.id,
      { kind: body.kind, id: body.id, include: body.include },
      body.access_token,
      {
        repos,
        ai: app.deps.ai,
        storage: app.deps.storage,
        fetchFn: app.deps.fetchFn,
        publicBaseUrl: app.deps.publicBaseUrl,
        googleMapsApiKey: app.deps.googleMapsApiKey,
      },
    ).catch((err) => app.log.error(err));

    reply.status(202);
    return { job_id: job.id };
  });

  app.get('/export/jobs/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const job = await repos.exportJobs.getById(id);
    if (!job) throw notFound('Export job');
    return jobToApi(job);
  });

  // Export repository: newest first, ?kind= filter, ?q= on target_name (ilike).
  app.get('/export/jobs', async (req) => {
    const query = JobsListQuery.parse(req.query);
    const p = parsePagination(query);
    const { rows, total } = await repos.exportJobs.list({
      kind: query.kind,
      q: query.q,
      offset: p.offset,
      limit: p.limit,
    });
    return paginated(rows.map(jobToApi), total, p);
  });
}
