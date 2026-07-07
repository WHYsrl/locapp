/**
 * Google Slides REST builder: creates a presentation (POST /v1/presentations)
 * then materializes the whole DeckContent with ONE presentations.batchUpdate.
 * Layouts stay simple and robust: predefined TITLE / SECTION_HEADER /
 * TITLE_AND_BODY / TITLE_ONLY layouts plus explicit image/table boxes.
 * Any Google error body maps to 502 code 'google_error'. Injectable fetch.
 */
import { HttpError } from '../lib/errors.js';
import type { DeckContent, DeckSlide } from './copywriter.js';

const SLIDES_ENDPOINT = 'https://slides.googleapis.com/v1/presentations';
const TIMEOUT_MS = 30_000;

/** Brand berry #6D2E46 used for slide titles. */
export const BERRY_RGB = { red: 0x6d / 255, green: 0x2e / 255, blue: 0x46 / 255 };

/** Default slide geometry in points (16:9). */
const PAGE_W = 720;
const PAGE_H = 405;

/** Google Slides table hard limits are generous; keep decks readable instead. */
const MAX_TABLE_ROWS = 15;
const MAX_TABLE_COLS = 6;
const MAX_GALLERY_IMAGES = 4;

export interface CreatedPresentation {
  presentationId: string;
  url: string;
}

interface LayoutSpec {
  predefinedLayout: string;
  titlePlaceholder: 'TITLE' | 'CENTERED_TITLE';
  bodyPlaceholder?: 'BODY' | 'SUBTITLE';
}

const LAYOUTS: Record<DeckSlide['layout'], LayoutSpec> = {
  cover: { predefinedLayout: 'TITLE', titlePlaceholder: 'CENTERED_TITLE', bodyPlaceholder: 'SUBTITLE' },
  section: { predefinedLayout: 'SECTION_HEADER', titlePlaceholder: 'TITLE' },
  venue: { predefinedLayout: 'TITLE_AND_BODY', titlePlaceholder: 'TITLE', bodyPlaceholder: 'BODY' },
  table: { predefinedLayout: 'TITLE_ONLY', titlePlaceholder: 'TITLE' },
  gallery: { predefinedLayout: 'TITLE_ONLY', titlePlaceholder: 'TITLE' },
  map: { predefinedLayout: 'TITLE_ONLY', titlePlaceholder: 'TITLE' },
};

const pt = (magnitude: number) => ({ magnitude, unit: 'PT' });

const elementProps = (pageObjectId: string, x: number, y: number, w: number, h: number) => ({
  pageObjectId,
  size: { width: pt(w), height: pt(h) },
  transform: { scaleX: 1, scaleY: 1, translateX: x, translateY: y, unit: 'PT' },
});

const berryTitleStyle = (objectId: string) => ({
  updateTextStyle: {
    objectId,
    textRange: { type: 'ALL' },
    style: { foregroundColor: { opaqueColor: { rgbColor: BERRY_RGB } } },
    fields: 'foregroundColor',
  },
});

function imageRequests(
  slideId: string,
  urls: string[],
  positions: Array<{ x: number; y: number; w: number; h: number }>,
): unknown[] {
  return urls.slice(0, positions.length).map((url, i) => {
    const p = positions[i]!;
    return {
      createImage: {
        objectId: `${slideId}_img_${i}`,
        url,
        elementProperties: elementProps(slideId, p.x, p.y, p.w, p.h),
      },
    };
  });
}

function tableRequests(slideId: string, table: NonNullable<DeckSlide['table']>): unknown[] {
  const headers = table.headers.slice(0, MAX_TABLE_COLS);
  const rows = table.rows.slice(0, MAX_TABLE_ROWS).map((r) => r.slice(0, MAX_TABLE_COLS));
  const columns = Math.max(headers.length, ...rows.map((r) => r.length), 1);
  const rowCount = rows.length + (headers.length > 0 ? 1 : 0);
  if (rowCount === 0) return [];
  const tableId = `${slideId}_table`;
  const requests: unknown[] = [
    {
      createTable: {
        objectId: tableId,
        elementProperties: elementProps(slideId, 40, 90, PAGE_W - 80, PAGE_H - 130),
        rows: rowCount,
        columns,
      },
    },
  ];
  const grid = headers.length > 0 ? [headers, ...rows] : rows;
  grid.forEach((row, rowIndex) => {
    row.forEach((text, columnIndex) => {
      if (!text) return;
      requests.push({
        insertText: {
          objectId: tableId,
          cellLocation: { rowIndex, columnIndex },
          text: String(text).slice(0, 400),
          insertionIndex: 0,
        },
      });
    });
  });
  return requests;
}

/** batchUpdate requests for the whole deck (exported for tests). */
export function buildBatchRequests(deck: DeckContent, defaultSlideId: string | null): unknown[] {
  const requests: unknown[] = [];

  deck.slides.forEach((slide, i) => {
    const slideId = `vs_slide_${i}`;
    const titleId = `${slideId}_title`;
    const bodyId = `${slideId}_body`;
    const spec = LAYOUTS[slide.layout];

    const placeholderIdMappings: unknown[] = [
      { layoutPlaceholder: { type: spec.titlePlaceholder, index: 0 }, objectId: titleId },
    ];
    if (spec.bodyPlaceholder) {
      placeholderIdMappings.push({
        layoutPlaceholder: { type: spec.bodyPlaceholder, index: 0 },
        objectId: bodyId,
      });
    }
    requests.push({
      createSlide: {
        objectId: slideId,
        insertionIndex: i,
        slideLayoutReference: { predefinedLayout: spec.predefinedLayout },
        placeholderIdMappings,
      },
    });

    if (slide.title) {
      requests.push({ insertText: { objectId: titleId, text: slide.title.slice(0, 300) } });
      requests.push(berryTitleStyle(titleId));
    }

    const bodyText =
      slide.layout === 'cover'
        ? deck.subtitle
        : slide.body_lines.map((line) => line.trim()).filter(Boolean).join('\n');
    if (spec.bodyPlaceholder && bodyText) {
      requests.push({ insertText: { objectId: bodyId, text: bodyText.slice(0, 4000) } });
    }

    if (slide.layout === 'table' && slide.table) {
      requests.push(...tableRequests(slideId, slide.table));
    }

    if (slide.image_urls.length > 0) {
      if (slide.layout === 'venue') {
        // One image on the right of the body text.
        requests.push(...imageRequests(slideId, slide.image_urls, [{ x: 460, y: 110, w: 230, h: 172 }]));
      } else if (slide.layout === 'map') {
        requests.push(...imageRequests(slideId, slide.image_urls, [{ x: 120, y: 95, w: 480, h: 270 }]));
      } else if (slide.layout !== 'table') {
        // gallery (and any other layout carrying images): up to 4 in a 2x2 grid.
        const grid = [
          { x: 40, y: 90, w: 310, h: 145 },
          { x: 370, y: 90, w: 310, h: 145 },
          { x: 40, y: 245, w: 310, h: 145 },
          { x: 370, y: 245, w: 310, h: 145 },
        ];
        requests.push(...imageRequests(slideId, slide.image_urls.slice(0, MAX_GALLERY_IMAGES), grid));
      }
    }
  });

  // Drop the default slide Google creates with the presentation.
  if (defaultSlideId) requests.push({ deleteObject: { objectId: defaultSlideId } });

  return requests;
}

/** POST JSON to a Google endpoint; any failure becomes 502 'google_error'. */
async function googlePost(
  fetchFn: typeof fetch,
  accessToken: string,
  url: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'network error';
    throw new HttpError(502, 'google_error', `Google Slides non raggiungibile: ${message}`);
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const googleMessage = (payload as { error?: { message?: unknown } } | null)?.error?.message;
    const message =
      typeof googleMessage === 'string' && googleMessage.length > 0
        ? googleMessage
        : `Google Slides API error (HTTP ${response.status})`;
    throw new HttpError(502, 'google_error', message);
  }
  return (payload ?? {}) as Record<string, unknown>;
}

/**
 * Creates the presentation and fills it with the deck content.
 * Two Google calls total: presentations.create + one presentations.batchUpdate.
 */
export async function createPresentation(
  fetchFn: typeof fetch,
  accessToken: string,
  deck: DeckContent,
): Promise<CreatedPresentation> {
  const created = await googlePost(fetchFn, accessToken, SLIDES_ENDPOINT, { title: deck.title });
  const presentationId = created['presentationId'];
  if (typeof presentationId !== 'string' || presentationId.length === 0) {
    throw new HttpError(502, 'google_error', 'Google Slides: risposta senza presentationId');
  }

  const defaultSlides = created['slides'];
  const first = Array.isArray(defaultSlides) ? (defaultSlides[0] as Record<string, unknown>) : null;
  const defaultSlideId = typeof first?.['objectId'] === 'string' ? (first['objectId'] as string) : null;

  const requests = buildBatchRequests(deck, defaultSlideId);
  await googlePost(
    fetchFn,
    accessToken,
    `${SLIDES_ENDPOINT}/${encodeURIComponent(presentationId)}:batchUpdate`,
    { requests },
  );

  return {
    presentationId,
    url: `https://docs.google.com/presentation/d/${presentationId}/edit`,
  };
}
