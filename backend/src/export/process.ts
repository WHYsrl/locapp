/**
 * Async Slides export pipeline (fire-and-forget job pattern shared with
 * ingestion): the route inserts a pending export_jobs row, returns 202 and
 * calls this without awaiting; clients poll GET /export/jobs/:id.
 *
 * SECURITY: the Google OAuth access token arrives here IN MEMORY ONLY (plain
 * function argument). It is never written to the job row, never logged and
 * only ever used as a Bearer header towards the Slides API.
 */
import type { Repos } from '../db/repos/index.js';
import type { StorageService } from '../storage/s3.js';
import { collectExportData, resolveExportImages, type ExportInclude, type ExportKind } from './collect.js';
import { resolvePoiMaps } from './poimap.js';
import { buildDeckContent, type DeckWriter } from './copywriter.js';
import { createPresentation } from './slides.js';

export interface ExportJobContext {
  repos: Repos;
  ai: DeckWriter;
  storage: StorageService;
  fetchFn?: typeof fetch;
  publicBaseUrl?: string;
  googleMapsApiKey?: string;
}

export async function processExportJob(
  jobId: string,
  input: { kind: ExportKind; id: string; include: ExportInclude },
  accessToken: string,
  ctx: ExportJobContext,
): Promise<void> {
  try {
    await ctx.repos.exportJobs.update(jobId, { status: 'processing' });

    const data = await collectExportData(ctx.repos, input.kind, input.id, input.include);
    const warnings = await resolveExportImages(data, {
      storage: ctx.storage,
      publicBaseUrl: ctx.publicBaseUrl,
      include: input.include,
    });
    if (input.include.distances) {
      // Best-effort: route polylines + Static Map URLs (never throws).
      await resolvePoiMaps(data, { googleMapsApiKey: ctx.googleMapsApiKey, fetchFn: ctx.fetchFn });
    }

    const { deck, warnings: copyWarnings } = await buildDeckContent(ctx.ai, data, input.include);
    warnings.push(...copyWarnings);

    const created = await createPresentation(ctx.fetchFn ?? fetch, accessToken, deck);

    await ctx.repos.exportJobs.update(jobId, {
      status: 'done',
      presentationId: created.presentationId,
      url: created.url,
      warnings,
      error: null,
      finishedAt: new Date(),
    });
  } catch (err) {
    // Google/collect errors land on the job: message only, never the token.
    await ctx.repos.exportJobs.update(jobId, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
      finishedAt: new Date(),
    });
  }
}
