/**
 * Static map thumbnail composition from OSM raster tiles.
 * Pure slippy-map math lives here so it is unit-testable without sharp;
 * sharp itself is loaded lazily inside renderMapThumb only.
 */

export const TILE_SIZE = 256;
export const MAP_THUMB_WIDTH = 480;
export const MAP_THUMB_HEIGHT = 240;
export const MAP_THUMB_ZOOM = 15;

const OSM_TILE_BASE = 'https://tile.openstreetmap.org';
const USER_AGENT = 'VenueScout/1.0 (info@justwhy.it)';
const TILE_TIMEOUT_MS = 10_000;
/** Berry marker matching the app accent color. */
const MARKER_COLOR = '#8E3B60';

/** Fractional tile X for a longitude at a zoom level (standard slippy-map math). */
export function lonToTileX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * 2 ** zoom;
}

/** Fractional tile Y for a latitude at a zoom level (Web Mercator). */
export function latToTileY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom;
}

export interface TilePlacement {
  /** Tile column (wrapped around the antimeridian). */
  tileX: number;
  tileY: number;
  /** Offset of the tile inside the stitched grid canvas, in pixels. */
  left: number;
  top: number;
}

export interface TileLayout {
  tiles: TilePlacement[];
  /** Stitched grid canvas size (multiple of TILE_SIZE). */
  gridWidth: number;
  gridHeight: number;
  /** Crop origin inside the grid so the point ends up centered in the viewport. */
  cropLeft: number;
  cropTop: number;
}

/**
 * Computes which tiles cover a width x height viewport centered on lat/lon,
 * where each tile goes in the stitched grid, and where to crop the grid.
 */
export function computeTileLayout(
  lat: number,
  lon: number,
  zoom: number,
  width: number,
  height: number,
): TileLayout {
  const maxTile = 2 ** zoom;
  const centerPxX = lonToTileX(lon, zoom) * TILE_SIZE;
  const centerPxY = latToTileY(lat, zoom) * TILE_SIZE;
  // Clamp near the poles so the crop never leaves the world map vertically.
  const worldHeight = maxTile * TILE_SIZE;
  const viewLeft = Math.round(centerPxX - width / 2);
  const viewTop = Math.min(Math.max(Math.round(centerPxY - height / 2), 0), worldHeight - height);

  const firstTileX = Math.floor(viewLeft / TILE_SIZE);
  const lastTileX = Math.floor((viewLeft + width - 1) / TILE_SIZE);
  const firstTileY = Math.floor(viewTop / TILE_SIZE);
  const lastTileY = Math.min(Math.floor((viewTop + height - 1) / TILE_SIZE), maxTile - 1);

  const tiles: TilePlacement[] = [];
  for (let ty = firstTileY; ty <= lastTileY; ty += 1) {
    for (let tx = firstTileX; tx <= lastTileX; tx += 1) {
      tiles.push({
        tileX: ((tx % maxTile) + maxTile) % maxTile,
        tileY: ty,
        left: (tx - firstTileX) * TILE_SIZE,
        top: (ty - firstTileY) * TILE_SIZE,
      });
    }
  }
  return {
    tiles,
    gridWidth: (lastTileX - firstTileX + 1) * TILE_SIZE,
    gridHeight: (lastTileY - firstTileY + 1) * TILE_SIZE,
    cropLeft: viewLeft - firstTileX * TILE_SIZE,
    cropTop: viewTop - firstTileY * TILE_SIZE,
  };
}

export function tileUrl(zoom: number, x: number, y: number): string {
  return `${OSM_TILE_BASE}/${zoom}/${x}/${y}.png`;
}

/** Simple berry circular marker, centered on the point. */
function markerSvg(width: number, height: number): Buffer {
  const cx = width / 2;
  const cy = height / 2;
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<circle cx="${cx}" cy="${cy}" r="10" fill="${MARKER_COLOR}" fill-opacity="0.25"/>` +
      `<circle cx="${cx}" cy="${cy}" r="6.5" fill="${MARKER_COLOR}" stroke="#ffffff" stroke-width="2.5"/>` +
      `</svg>`,
  );
}

export type MapThumbRenderer = (lat: number, lon: number) => Promise<Buffer>;

/**
 * Renders a 480x240 PNG centered on lat/lon at zoom 15: fetches the needed OSM
 * tiles, stitches them with sharp, crops around the point and overlays the marker.
 */
export async function renderMapThumb(
  lat: number,
  lon: number,
  fetchFn: typeof fetch = fetch,
): Promise<Buffer> {
  const layout = computeTileLayout(lat, lon, MAP_THUMB_ZOOM, MAP_THUMB_WIDTH, MAP_THUMB_HEIGHT);
  const tiles = await Promise.all(
    layout.tiles.map(async (t) => {
      const response = await fetchFn(tileUrl(MAP_THUMB_ZOOM, t.tileX, t.tileY), {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(TILE_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Tile fetch failed with status ${response.status}`);
      return { input: Buffer.from(await response.arrayBuffer()), left: t.left, top: t.top };
    }),
  );

  const sharp = (await import('sharp')).default;
  const stitched = await sharp({
    create: {
      width: layout.gridWidth,
      height: layout.gridHeight,
      channels: 3,
      background: { r: 232, g: 230, b: 225 },
    },
  })
    .composite(tiles)
    .png()
    .toBuffer();

  return sharp(stitched)
    .extract({
      left: layout.cropLeft,
      top: layout.cropTop,
      width: MAP_THUMB_WIDTH,
      height: MAP_THUMB_HEIGHT,
    })
    .composite([{ input: markerSvg(MAP_THUMB_WIDTH, MAP_THUMB_HEIGHT), left: 0, top: 0 }])
    .png()
    .toBuffer();
}
