import type { Repos } from '../db/repos/index.js';
import type { AiService } from '../ai/service.js';
import type { IngestionJobRow } from '../db/schema.js';
import type { ExtractedLocationDraft } from '../ai/extraction.js';
import { bufferToText, fetchUrlPage } from './textExtract.js';
import { geocodeAddress, geocodeBestWith, googleMapsUrl, type GeocodeFn } from '../lib/geocode.js';

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);

/**
 * Proposes coordinates for a draft via geocoding when the extraction found an
 * address (or at least a name + city) but no geometry. The proposal lands in
 * the draft only: the user confirms it through the per-field accept/reject
 * review, so nothing is ever written silently. Non-fatal on failure.
 */
export async function enrichDraftWithGeocoding(
  draft: ExtractedLocationDraft,
  geocode: GeocodeFn = geocodeAddress,
): Promise<void> {
  const loc = draft.location as Record<string, unknown>;
  if (loc['geom'] != null) return;

  const name = str(loc['name']);
  const addressLine = str(loc['address_line']);
  const city = str(loc['city']);
  if (!addressLine && !(name && city)) return;

  try {
    // Variant fallback (SPEC §4 Geocoding): precise address first, then looser name-based queries.
    const [best] = await geocodeBestWith(
      {
        name,
        address_line: addressLine,
        city,
        province: str(loc['province']),
        postal_code: str(loc['postal_code']),
      },
      geocode,
    );
    if (!best) return;
    loc['geom'] = { lat: best.lat, lng: best.lon };
    if (loc['google_maps_url'] == null) loc['google_maps_url'] = googleMapsUrl(best.lat, best.lon);
    draft.field_sources['locations.geom'] = `geocoding OSM: ${best.display_name}`;
  } catch {
    // Geocoding is a best-effort enrichment; the draft stays usable without it.
  }
}

/**
 * Async ingestion pipeline: resolve raw text from the source,
 * run Claude extraction, store the reviewable draft on the job.
 * Never writes into the location card (SPEC §2.5).
 */
export async function processIngestionJob(
  job: IngestionJobRow,
  repos: Repos,
  ai: AiService,
  geocode: GeocodeFn = geocodeAddress,
): Promise<void> {
  try {
    await repos.ingestion.update(job.id, { status: 'processing' });

    let rawText = job.rawText ?? '';
    let candidatePhotos: string[] = [];
    if (job.sourceType === 'url' && job.sourceUrl) {
      const page = await fetchUrlPage(job.sourceUrl);
      rawText = page.text;
      candidatePhotos = page.images;
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

    // Propose coordinates + maps link in the draft (confirmed via accept/reject).
    await enrichDraftWithGeocoding(draft, geocode);

    // Candidate photos scraped from the page (SPEC §5): the extraction schema
    // does not produce them — the pipeline appends them for user selection.
    if (candidatePhotos.length > 0) {
      draft.proposed_media = candidatePhotos.map((url) => ({ url }));
    }

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
