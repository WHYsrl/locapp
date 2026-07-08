/**
 * Google Slides REST builder: creates a presentation (POST /v1/presentations)
 * then materializes the whole DeckContent with ONE presentations.batchUpdate
 * (total requests stay well under 400 thanks to the table/gallery caps).
 * Template v2 layouts: 'cover_photo' full-bleed photo + semi-transparent berry
 * band with white title/subtitle (solid berry page when no photo),
 * 'venue_split' text left / photo right (explicit boxes), 'gallery_grid'
 * 2x2 / side-by-side photo grid, 'poi_map' static route map + POI table —
 * plus the original predefined TITLE / SECTION_HEADER / TITLE_AND_BODY /
 * TITLE_ONLY layouts. Any Google error maps to 502 'google_error'. Injectable fetch.
 */
import { HttpError } from '../lib/errors.js';
import type { DeckContent, DeckSlide } from './copywriter.js';

const SLIDES_ENDPOINT = 'https://slides.googleapis.com/v1/presentations';
const TIMEOUT_MS = 30_000;

/** Brand berry #6D2E46 used for slide titles. */
export const BERRY_RGB = { red: 0x6d / 255, green: 0x2e / 255, blue: 0x46 / 255 };
const WHITE_RGB = { red: 1, green: 1, blue: 1 };

/** Default slide geometry in points (16:9). */
const PAGE_W = 720;
const PAGE_H = 405;

/** Full-bleed cover geometry: 10 x 5.625 in expressed in EMU (914400 EMU/inch). */
const PAGE_W_EMU = 9_144_000;
const PAGE_H_EMU = 5_143_500;

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

/** cover_photo builds everything explicitly on a BLANK slide (no placeholders). */
const LAYOUTS: Record<Exclude<DeckSlide['layout'], 'cover_photo'>, LayoutSpec> = {
  cover: { predefinedLayout: 'TITLE', titlePlaceholder: 'CENTERED_TITLE', bodyPlaceholder: 'SUBTITLE' },
  section: { predefinedLayout: 'SECTION_HEADER', titlePlaceholder: 'TITLE' },
  venue: { predefinedLayout: 'TITLE_AND_BODY', titlePlaceholder: 'TITLE', bodyPlaceholder: 'BODY' },
  venue_split: { predefinedLayout: 'TITLE_ONLY', titlePlaceholder: 'TITLE' },
  table: { predefinedLayout: 'TITLE_ONLY', titlePlaceholder: 'TITLE' },
  gallery: { predefinedLayout: 'TITLE_ONLY', titlePlaceholder: 'TITLE' },
  gallery_grid: { predefinedLayout: 'TITLE_ONLY', titlePlaceholder: 'TITLE' },
  map: { predefinedLayout: 'TITLE_ONLY', titlePlaceholder: 'TITLE' },
  poi_map: { predefinedLayout: 'TITLE_ONLY', titlePlaceholder: 'TITLE' },
};

const pt = (magnitude: number) => ({ magnitude, unit: 'PT' });
const emu = (magnitude: number) => ({ magnitude, unit: 'EMU' });

const elementProps = (pageObjectId: string, x: number, y: number, w: number, h: number) => ({
  pageObjectId,
  size: { width: pt(w), height: pt(h) },
  transform: { scaleX: 1, scaleY: 1, translateX: x, translateY: y, unit: 'PT' },
});

/** Full-bleed element (10 x 5.625 in page) sized in EMU. */
const fullBleedProps = (pageObjectId: string) => ({
  pageObjectId,
  size: { width: emu(PAGE_W_EMU), height: emu(PAGE_H_EMU) },
  transform: { scaleX: 1, scaleY: 1, translateX: 0, translateY: 0, unit: 'EMU' },
});

const berryTitleStyle = (objectId: string) => ({
  updateTextStyle: {
    objectId,
    textRange: { type: 'ALL' },
    style: { foregroundColor: { opaqueColor: { rgbColor: BERRY_RGB } } },
    fields: 'foregroundColor',
  },
});

/** Solid berry fill (semi-transparent when alpha < 1), no outline. */
const berryFill = (objectId: string, alpha: number) => ({
  updateShapeProperties: {
    objectId,
    shapeProperties: {
      shapeBackgroundFill: { solidFill: { color: { rgbColor: BERRY_RGB }, alpha } },
      outline: { propertyState: 'NOT_RENDERED' },
    },
    fields: 'shapeBackgroundFill.solidFill,outline.propertyState',
  },
});

const whiteTextStyle = (objectId: string, fontSize: number, bold: boolean) => ({
  updateTextStyle: {
    objectId,
    textRange: { type: 'ALL' },
    style: {
      foregroundColor: { opaqueColor: { rgbColor: WHITE_RGB } },
      bold,
      fontSize: pt(fontSize),
    },
    fields: 'foregroundColor,bold,fontSize',
  },
});

/** Explicit text box with content: createShape + insertText. */
function textBoxRequests(
  objectId: string,
  slideId: string,
  rect: { x: number; y: number; w: number; h: number },
  text: string,
): unknown[] {
  return [
    {
      createShape: {
        objectId,
        shapeType: 'TEXT_BOX',
        elementProperties: elementProps(slideId, rect.x, rect.y, rect.w, rect.h),
      },
    },
    { insertText: { objectId, text: text.slice(0, 4000) } },
  ];
}

/**
 * Full-bleed cover: cover photo sized to the whole page (EMU) with a
 * semi-transparent berry band carrying white title/subtitle; without a photo
 * the band becomes a full-page solid berry background.
 */
function coverPhotoRequests(slideId: string, slide: DeckSlide, subtitle: string): unknown[] {
  const requests: unknown[] = [];
  const photoUrl = slide.image_urls[0];
  const bandId = `${slideId}_band`;
  if (photoUrl) {
    requests.push({
      createImage: {
        objectId: `${slideId}_cover_img`,
        url: photoUrl,
        elementProperties: fullBleedProps(slideId),
      },
    });
    requests.push({
      createShape: {
        objectId: bandId,
        shapeType: 'RECT',
        elementProperties: elementProps(slideId, 0, 245, PAGE_W, 120),
      },
    });
    requests.push(berryFill(bandId, 0.82));
  } else {
    // Fallback: plain berry background covering the whole page.
    requests.push({
      createShape: { objectId: bandId, shapeType: 'RECT', elementProperties: fullBleedProps(slideId) },
    });
    requests.push(berryFill(bandId, 1));
  }
  const titleY = photoUrl ? 252 : 150;
  if (slide.title) {
    const titleId = `${slideId}_cover_title`;
    requests.push(...textBoxRequests(titleId, slideId, { x: 40, y: titleY, w: PAGE_W - 80, h: 60 }, slide.title.slice(0, 300)));
    requests.push(whiteTextStyle(titleId, 28, true));
  }
  const subtitleText = slide.body_lines.map((l) => l.trim()).filter(Boolean).join(' · ') || subtitle;
  if (subtitleText) {
    const subtitleId = `${slideId}_cover_subtitle`;
    requests.push(...textBoxRequests(subtitleId, slideId, { x: 40, y: titleY + 56, w: PAGE_W - 80, h: 36 }, subtitleText.slice(0, 300)));
    requests.push(whiteTextStyle(subtitleId, 14, false));
  }
  return requests;
}

/** gallery_grid positions: 1 large, 2 side-by-side, 3-4 in a 2x2 grid. */
function galleryPositions(count: number): Array<{ x: number; y: number; w: number; h: number }> {
  if (count <= 1) return [{ x: 120, y: 90, w: 480, h: 290 }];
  if (count === 2) {
    return [
      { x: 40, y: 100, w: 310, h: 270 },
      { x: 370, y: 100, w: 310, h: 270 },
    ];
  }
  return [
    { x: 40, y: 90, w: 310, h: 145 },
    { x: 370, y: 90, w: 310, h: 145 },
    { x: 40, y: 245, w: 310, h: 145 },
    { x: 370, y: 245, w: 310, h: 145 },
  ];
}

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

function tableRequests(
  slideId: string,
  table: NonNullable<DeckSlide['table']>,
  rect: { x: number; y: number; w: number; h: number } = { x: 40, y: 90, w: PAGE_W - 80, h: PAGE_H - 130 },
): unknown[] {
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
        elementProperties: elementProps(slideId, rect.x, rect.y, rect.w, rect.h),
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

    // Full-bleed cover: BLANK slide, everything built explicitly.
    if (slide.layout === 'cover_photo') {
      requests.push({
        createSlide: {
          objectId: slideId,
          insertionIndex: i,
          slideLayoutReference: { predefinedLayout: 'BLANK' },
        },
      });
      requests.push(...coverPhotoRequests(slideId, slide, deck.subtitle));
      return;
    }

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

    if (slide.layout === 'venue_split') {
      // Split layout: explicit text box left column, photo(s) right column.
      const hasImage = slide.image_urls.length > 0;
      if (bodyText) {
        requests.push(
          ...textBoxRequests(bodyId, slideId, { x: 40, y: 95, w: hasImage ? 380 : PAGE_W - 80, h: 280 }, bodyText),
        );
      }
      if (hasImage) {
        const column =
          slide.image_urls.length >= 2
            ? [
                { x: 440, y: 95, w: 240, h: 135 },
                { x: 440, y: 240, w: 240, h: 135 },
              ]
            : [{ x: 440, y: 95, w: 240, h: 280 }];
        requests.push(...imageRequests(slideId, slide.image_urls, column));
      }
      return;
    }

    if (slide.layout === 'poi_map') {
      // Static map (with routes when available) left, compact POI table right.
      const hasImage = slide.image_urls.length > 0;
      if (hasImage) {
        requests.push(...imageRequests(slideId, slide.image_urls, [{ x: 40, y: 90, w: 370, h: 285 }]));
      }
      if (slide.table) {
        const rect = hasImage
          ? { x: 425, y: 100, w: 255, h: 260 }
          : { x: 40, y: 90, w: PAGE_W - 80, h: PAGE_H - 130 };
        requests.push(...tableRequests(slideId, slide.table, rect));
      }
      return;
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
        // gallery / gallery_grid (and any other layout carrying images):
        // up to 4 photos, 2x2 grid or side-by-side/large when fewer.
        const urls = slide.image_urls.slice(0, MAX_GALLERY_IMAGES);
        requests.push(...imageRequests(slideId, urls, galleryPositions(urls.length)));
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
