import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { collectExportData, resolveExportImages } from '../export/collect.js';
import { buildDeckContent } from '../export/copywriter.js';
import { createPresentation } from '../export/slides.js';

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
   * obtained by the browser. Used only as a Bearer header towards the Slides
   * API — NEVER logged and never persisted.
   */
  access_token: z.string().min(1),
  kind: z.enum(['location', 'event', 'project']),
  id: z.string().min(1),
  include: IncludeSchema,
});

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  const { repos, ai, storage } = app.deps;

  // AI → Google Slides export: collect → copywrite (AI, non-fatal) → Slides REST.
  app.post('/export/slides', async (req) => {
    const body = ExportSlidesBody.parse(req.body);

    const data = await collectExportData(repos, body.kind, body.id, body.include);
    const warnings = await resolveExportImages(data, {
      storage,
      publicBaseUrl: app.deps.publicBaseUrl,
      include: body.include,
    });

    const { deck, warnings: copyWarnings } = await buildDeckContent(ai, data, body.include);
    warnings.push(...copyWarnings);

    const fetchFn = app.deps.fetchFn ?? fetch;
    const created = await createPresentation(fetchFn, body.access_token, deck);

    return { url: created.url, presentation_id: created.presentationId, warnings };
  });
}
