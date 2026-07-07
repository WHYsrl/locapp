import { describe, expect, it, vi } from 'vitest';
import {
  MAP_THUMB_HEIGHT,
  MAP_THUMB_WIDTH,
  MAP_THUMB_ZOOM,
  TILE_SIZE,
  computeTileLayout,
  latToTileY,
  lonToTileX,
  tileUrl,
} from '../src/lib/staticmap.js';
import { buildTestApp, auth } from './helpers.js';

// Rome, Vatican area — reference values computed with the standard slippy-map formulas.
const LAT = 41.9109;
const LON = 12.4534;

describe('slippy tile math', () => {
  it('lonToTileX / latToTileY match the OSM reference formulas', () => {
    expect(lonToTileX(0, 0)).toBe(0.5);
    expect(latToTileY(0, 0)).toBeCloseTo(0.5, 12);
    expect(lonToTileX(-180, 3)).toBe(0);
    expect(lonToTileX(12.4534, 15)).toBeCloseTo(17517.536, 3);
    expect(latToTileY(41.9109, 15)).toBeCloseTo(12174.945, 3);
    expect(Math.floor(lonToTileX(LON, 15))).toBe(17517);
    expect(Math.floor(latToTileY(LAT, 15))).toBe(12174);
  });

  it('computeTileLayout covers a 480x240 viewport with 2-3 tile columns', () => {
    const layout = computeTileLayout(LAT, LON, MAP_THUMB_ZOOM, MAP_THUMB_WIDTH, MAP_THUMB_HEIGHT);

    // 480px crosses 2 or 3 tile columns, 240px crosses 1 or 2 rows.
    const cols = layout.gridWidth / TILE_SIZE;
    const rows = layout.gridHeight / TILE_SIZE;
    expect(cols).toBeGreaterThanOrEqual(2);
    expect(cols).toBeLessThanOrEqual(3);
    expect(rows).toBeGreaterThanOrEqual(1);
    expect(rows).toBeLessThanOrEqual(2);
    expect(layout.tiles).toHaveLength(cols * rows);

    // This particular point needs a 3x2 grid with these exact tiles/crop.
    expect(layout.tiles.map((t) => `${t.tileX}/${t.tileY}`)).toEqual([
      '17516/12174',
      '17517/12174',
      '17518/12174',
      '17516/12175',
      '17517/12175',
      '17518/12175',
    ]);
    expect(layout.cropLeft).toBe(153);
    expect(layout.cropTop).toBe(122);

    // The crop stays inside the stitched grid.
    expect(layout.cropLeft + MAP_THUMB_WIDTH).toBeLessThanOrEqual(layout.gridWidth);
    expect(layout.cropTop + MAP_THUMB_HEIGHT).toBeLessThanOrEqual(layout.gridHeight);

    // Tiles are placed on a 256px lattice starting at the grid origin.
    for (const t of layout.tiles) {
      expect(t.left % TILE_SIZE).toBe(0);
      expect(t.top % TILE_SIZE).toBe(0);
    }
  });

  it('keeps the point centered in the crop (within rounding)', () => {
    const layout = computeTileLayout(LAT, LON, MAP_THUMB_ZOOM, MAP_THUMB_WIDTH, MAP_THUMB_HEIGHT);
    const firstTileX = 17516;
    const firstTileY = 12174;
    const centerX = lonToTileX(LON, MAP_THUMB_ZOOM) * TILE_SIZE - (firstTileX * TILE_SIZE + layout.cropLeft);
    const centerY = latToTileY(LAT, MAP_THUMB_ZOOM) * TILE_SIZE - (firstTileY * TILE_SIZE + layout.cropTop);
    expect(Math.abs(centerX - MAP_THUMB_WIDTH / 2)).toBeLessThan(1);
    expect(Math.abs(centerY - MAP_THUMB_HEIGHT / 2)).toBeLessThan(1);
  });

  it('wraps tile columns across the antimeridian and builds OSM tile URLs', () => {
    const layout = computeTileLayout(0, 179.999, 2, 480, 240);
    for (const t of layout.tiles) {
      expect(t.tileX).toBeGreaterThanOrEqual(0);
      expect(t.tileX).toBeLessThan(4);
      expect(t.tileY).toBeGreaterThanOrEqual(0);
      expect(t.tileY).toBeLessThan(4);
    }
    expect(tileUrl(15, 17517, 12174)).toBe('https://tile.openstreetmap.org/15/17517/12174.png');
  });
});

describe('GET /locations/:id/map-thumb.png', () => {
  const locationRow = { id: 'loc-1', name: 'Villa dei Pini', thumbnailUrl: null };

  it('is public and returns the rendered PNG with a day-long cache header', async () => {
    const renderMapThumb = vi.fn(async () => Buffer.from('PNG-BYTES'));
    const ctx = await buildTestApp({
      repos: {
        locations: {
          getById: async () => locationRow,
          coordinates: async () => [{ id: 'loc-1', lon: LON, lat: LAT }],
        },
      },
      renderMapThumb,
    });

    // No Authorization header on purpose: the route is public like /health.
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/locations/loc-1/map-thumb.png' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
    expect(res.rawPayload.toString()).toBe('PNG-BYTES');
    expect(renderMapThumb).toHaveBeenCalledWith(LAT, LON);
  });

  it('serves repeat requests from the in-memory cache', async () => {
    const renderMapThumb = vi.fn(async () => Buffer.from('PNG-BYTES'));
    const ctx = await buildTestApp({
      repos: {
        locations: {
          getById: async () => locationRow,
          coordinates: async () => [{ id: 'loc-1', lon: LON, lat: LAT }],
        },
      },
      renderMapThumb,
    });
    const first = await ctx.app.inject({ method: 'GET', url: '/api/v1/locations/loc-1/map-thumb.png' });
    const second = await ctx.app.inject({ method: 'GET', url: '/api/v1/locations/loc-1/map-thumb.png' });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.rawPayload.toString()).toBe('PNG-BYTES');
    expect(renderMapThumb).toHaveBeenCalledOnce();
  });

  it('tolerates the web cache-buster ?v= and re-renders on ?refresh=1 (OSM path)', async () => {
    let hit = 0;
    const renderMapThumb = vi.fn(async () => Buffer.from(`PNG-${++hit}`));
    const ctx = await buildTestApp({
      repos: {
        locations: {
          getById: async () => locationRow,
          coordinates: async () => [{ id: 'loc-1', lon: LON, lat: LAT }],
        },
      },
      renderMapThumb,
    });
    // ?v= is the browser-cache style-version param: ignored server-side, same cache entry.
    const first = await ctx.app.inject({ method: 'GET', url: '/api/v1/locations/loc-1/map-thumb.png?v=2' });
    const cached = await ctx.app.inject({ method: 'GET', url: '/api/v1/locations/loc-1/map-thumb.png' });
    expect(first.statusCode).toBe(200);
    expect(cached.rawPayload.toString()).toBe('PNG-1');
    expect(renderMapThumb).toHaveBeenCalledOnce();

    const refreshed = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/locations/loc-1/map-thumb.png?refresh=1',
    });
    expect(refreshed.rawPayload.toString()).toBe('PNG-2');
    expect(renderMapThumb).toHaveBeenCalledTimes(2);
  });

  it('returns 404 when the location has no geometry or does not exist', async () => {
    const renderMapThumb = vi.fn(async () => Buffer.from('PNG-BYTES'));
    const ctx = await buildTestApp({
      repos: {
        locations: {
          getById: async (id: string) => (id === 'loc-1' ? locationRow : null),
          coordinates: async () => [{ id: 'loc-1', lon: null, lat: null }],
        },
      },
      renderMapThumb,
    });
    const noGeom = await ctx.app.inject({ method: 'GET', url: '/api/v1/locations/loc-1/map-thumb.png' });
    expect(noGeom.statusCode).toBe(404);
    const missing = await ctx.app.inject({ method: 'GET', url: '/api/v1/locations/nope/map-thumb.png' });
    expect(missing.statusCode).toBe(404);
    expect(renderMapThumb).not.toHaveBeenCalled();
  });

  it('GET /locations/:id (authenticated route) still requires a token', async () => {
    const ctx = await buildTestApp();
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/locations/loc-1' });
    expect(res.statusCode).toBe(401);
  });
});
