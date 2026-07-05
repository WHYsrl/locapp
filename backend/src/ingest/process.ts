import type { Repos } from '../db/repos/index.js';
import type { AiService } from '../ai/service.js';
import type { IngestionJobRow } from '../db/schema.js';
import { bufferToText, fetchUrlText } from './textExtract.js';

/**
 * Async ingestion pipeline: resolve raw text from the source,
 * run Claude extraction, store the reviewable draft on the job.
 * Never writes into the location card (SPEC §2.5).
 */
export async function processIngestionJob(job: IngestionJobRow, repos: Repos, ai: AiService): Promise<void> {
  try {
    await repos.ingestion.update(job.id, { status: 'processing' });

    let rawText = job.rawText ?? '';
    if (job.sourceType === 'url' && job.sourceUrl) {
      rawText = await fetchUrlText(job.sourceUrl);
    } else if (
      (job.sourceType === 'pdf' || job.sourceType === 'docx' || job.sourceType === 'pptx') &&
      !rawText
    ) {
      if (!job.sourceMediaId) throw new Error('media_id required for document ingestion');
      const mediaRow = await repos.locations.getMedia(job.sourceMediaId);
      if (!mediaRow) throw new Error('Source media not found');
      const response = await fetch(mediaRow.url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`Media download failed with status ${response.status}`);
      rawText = await bufferToText(Buffer.from(await response.arrayBuffer()), job.sourceType);
    }

    if (!rawText.trim()) throw new Error('No text could be extracted from the source');

    const draft = await ai.extractLocationDraft({
      text: rawText,
      sourceLabel: job.sourceType,
    });

    await repos.ingestion.update(job.id, {
      status: 'ready',
      rawText,
      extracted: draft as unknown as Record<string, unknown>,
      error: null,
    });
  } catch (err) {
    await repos.ingestion.update(job.id, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
