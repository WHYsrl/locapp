import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest, notFound, notImplemented } from '../lib/errors.js';
import { rowToApi } from '../lib/apiMappers.js';
import { processIngestionJob } from '../ingest/process.js';
import { applyDraft, type AcceptMap } from '../ingest/apply.js';
import { ExtractedLocationDraftSchema } from '../ai/extraction.js';

const IngestBody = z.object({
  location_id: z.string().nullish(),
  source_type: z.enum(['audio', 'testo', 'url', 'pdf', 'pptx', 'docx', 'immagine']),
  url: z.string().nullish(),
  text: z.string().nullish(),
  media_id: z.string().nullish(),
});

const ApplyBody = z.object({
  accept: z.record(z.string(), z.boolean()),
});

export async function ingestRoutes(app: FastifyInstance): Promise<void> {
  const { repos, ai } = app.deps;

  app.post('/ingest', async (req, reply) => {
    const body = IngestBody.parse(req.body);

    if (body.source_type === 'url' && !body.url) throw badRequest('url is required for source_type=url');
    if (body.source_type === 'testo' && !body.text) throw badRequest('text is required for source_type=testo');
    if (body.source_type === 'audio' && !body.text) {
      // iOS transcribes on-device; server-side transcription is a later phase.
      throw notImplemented('Server-side audio transcription is not implemented yet; send the transcript in `text`');
    }
    if (['pdf', 'docx', 'pptx', 'immagine'].includes(body.source_type) && !body.media_id && !body.text) {
      throw badRequest('media_id (or pre-extracted text) is required for document ingestion');
    }
    if (body.location_id) {
      const location = await repos.locations.getById(body.location_id);
      if (!location) throw notFound('Location');
    }

    const job = await repos.ingestion.create({
      locationId: body.location_id ?? null,
      sourceType: body.source_type,
      sourceUrl: body.url ?? null,
      sourceMediaId: body.media_id ?? null,
      rawText: body.text ?? null,
      status: 'pending',
    });

    // Fire-and-forget async processing; job status is polled via GET /ingest/:jobId.
    void processIngestionJob(job, repos, ai, app.deps.geocode).catch((err) => app.log.error(err));

    reply.status(201);
    return rowToApi(job);
  });

  app.get('/ingest/:jobId', async (req) => {
    const { jobId } = z.object({ jobId: z.string() }).parse(req.params);
    const job = await repos.ingestion.getById(jobId);
    if (!job) throw notFound('Ingestion job');
    return rowToApi(job);
  });

  app.post('/ingest/:jobId/apply', async (req) => {
    const { jobId } = z.object({ jobId: z.string() }).parse(req.params);
    const body = ApplyBody.parse(req.body);
    const job = await repos.ingestion.getById(jobId);
    if (!job) throw notFound('Ingestion job');
    if (job.status !== 'ready') throw badRequest(`Job is not ready to apply (status: ${job.status})`);
    if (!job.extracted) throw badRequest('Job has no extracted draft');

    const draft = ExtractedLocationDraftSchema.parse(job.extracted);
    const result = await applyDraft(repos, draft, body.accept as AcceptMap, job.locationId);

    const updated = await repos.ingestion.update(jobId, {
      status: 'applied',
      locationId: result.locationId,
      appliedAt: new Date(),
    });
    return { ...rowToApi(updated ?? job), location_id: result.locationId, applied_fields: result.applied };
  });
}
