import type { Repos } from '../db/repos/index.js';
import type { StorageService } from '../storage/s3.js';

const DOWNLOAD_TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const USER_AGENT = 'VenueScout/1.0 (+https://venuescout.example)';

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/tiff': 'tif',
};

export interface PhotoImportResult {
  /** S3 keys of the successfully imported photos. */
  imported: string[];
  /** Human-readable (Italian) reasons for photos that were skipped. */
  warnings: string[];
}

/**
 * Downloads the user-selected photo URLs (from `proposed_media`) and uploads
 * them to S3 as media rows (kind 'foto', key `locations/<id>/web/<n>.<ext>`).
 * Never throws: when storage is not configured the whole batch is skipped with
 * a warning, and each per-photo failure only adds a warning (the apply itself
 * must not fail because of photos).
 */
export async function importSelectedPhotos(
  repos: Repos,
  storage: StorageService,
  locationId: string,
  urls: string[],
  fetchFn: typeof fetch = fetch,
): Promise<PhotoImportResult> {
  if (urls.length === 0) return { imported: [], warnings: [] };
  if (!storage.isConfigured()) {
    return { imported: [], warnings: ['storage_not_configured — foto non importate'] };
  }

  const imported: string[] = [];
  const warnings: string[] = [];
  let n = 0;
  for (const url of urls) {
    n += 1;
    try {
      const response = await fetchFn(url, {
        headers: { 'user-agent': USER_AGENT },
        redirect: 'follow',
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const mime = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
      if (!mime.startsWith('image/')) throw new Error(`content-type non immagine (${mime || 'sconosciuto'})`);
      const declaredLength = Number.parseInt(response.headers.get('content-length') ?? '0', 10);
      if (declaredLength > MAX_IMAGE_BYTES) throw new Error('oltre il limite di 8MB');
      const body = Buffer.from(await response.arrayBuffer());
      if (body.byteLength > MAX_IMAGE_BYTES) throw new Error('oltre il limite di 8MB');

      const ext = EXT_BY_MIME[mime] ?? mime.slice('image/'.length).replace(/[^a-z0-9]/g, '') ?? 'img';
      const key = `locations/${locationId}/web/${n}.${ext}`;
      await storage.putObject(key, body, mime);

      let filename = `web-${n}.${ext}`;
      try {
        filename = decodeURIComponent(new URL(url).pathname.split('/').pop() || filename);
      } catch {
        // keep fallback filename
      }
      await repos.locations.createMedia({
        locationId,
        kind: 'foto',
        category: null,
        url: key,
        filename,
        mime,
      });
      imported.push(key);
    } catch (err) {
      warnings.push(`foto non importata (${url}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { imported, warnings };
}
