import { describe, expect, it, vi } from 'vitest';
import { buildGeocodeQuery, geocodeAddress, googleMapsUrl } from '../src/lib/geocode.js';
import { buildTestApp, auth } from './helpers.js';

const NOMINATIM_PAYLOAD = [
  {
    display_name: 'Villa dei Pini, Firenze, Toscana, Italia',
    lat: '43.7696',
    lon: '11.2558',
    type: 'house',
    importance: 0.62,
  },
  {
    display_name: 'Via dei Pini, Firenze, Italia',
    lat: '43.78',
    lon: '11.26',
    type: 'road',
    importance: 0.3,
  },
];

const okFetch = (payload: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(payload), { status })) as unknown as typeof fetch;

describe('geocode lib', () => {
  it('buildGeocodeQuery joins available parts and skips blanks', () => {
    expect(
      buildGeocodeQuery({
        name: 'Villa dei Pini',
        address_line: 'Via Roma 1',
        postal_code: '50100',
        city: 'Firenze',
        province: '  ',
        country: 'Italia',
      }),
    ).toBe('Villa dei Pini, Via Roma 1, 50100, Firenze, Italia');
    expect(buildGeocodeQuery({ name: 'Villa', city: 'Firenze' })).toBe('Villa, Firenze');
    expect(buildGeocodeQuery({})).toBe('');
  });

  it('googleMapsUrl formats the search link', () => {
    expect(googleMapsUrl(43.7696, 11.2558)).toBe(
      'https://www.google.com/maps/search/?api=1&query=43.7696,11.2558',
    );
  });

  it('geocodeAddress queries Nominatim with the expected URL and headers', async () => {
    const fetchFn = okFetch(NOMINATIM_PAYLOAD);
    const candidates = await geocodeAddress('Villa dei Pini, Firenze', fetchFn);

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=it&q=Villa%20dei%20Pini%2C%20Firenze',
    );
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(
      'VenueScout/1.0 (info@justwhy.it)',
    );
    expect(init.signal).toBeInstanceOf(AbortSignal);

    expect(candidates).toEqual([
      {
        display_name: 'Villa dei Pini, Firenze, Toscana, Italia',
        lat: 43.7696,
        lon: 11.2558,
        type: 'house',
        importance: 0.62,
      },
      { display_name: 'Via dei Pini, Firenze, Italia', lat: 43.78, lon: 11.26, type: 'road', importance: 0.3 },
    ]);
  });

  it('geocodeAddress returns [] for a blank query without calling fetch', async () => {
    const fetchFn = okFetch(NOMINATIM_PAYLOAD);
    expect(await geocodeAddress('   ', fetchFn)).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('geocodeAddress returns [] on HTTP error, network failure, or bad payload', async () => {
    expect(await geocodeAddress('Firenze', okFetch(NOMINATIM_PAYLOAD, 503))).toEqual([]);
    const failing = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    expect(await geocodeAddress('Firenze', failing)).toEqual([]);
    expect(await geocodeAddress('Firenze', okFetch({ not: 'an array' }))).toEqual([]);
    // Entries with unparseable coordinates are dropped.
    expect(await geocodeAddress('Firenze', okFetch([{ lat: 'abc', lon: 'def' }]))).toEqual([]);
  });
});

describe('geocode route', () => {
  it('GET /geocode returns candidates enriched with google_maps_url', async () => {
    const ctx = await buildTestApp({
      geocode: vi.fn(async () => [
        { display_name: 'Villa dei Pini, Firenze', lat: 43.7696, lon: 11.2558, type: 'house', importance: 0.62 },
      ]),
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/geocode?q=Villa%20dei%20Pini%20Firenze',
      headers: auth(ctx.tokens.editor),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([
      {
        display_name: 'Villa dei Pini, Firenze',
        lat: 43.7696,
        lon: 11.2558,
        type: 'house',
        importance: 0.62,
        google_maps_url: 'https://www.google.com/maps/search/?api=1&query=43.7696,11.2558',
      },
    ]);
    expect(ctx.geocode).toHaveBeenCalledWith('Villa dei Pini Firenze');
  });

  it('GET /geocode requires auth and a non-empty q', async () => {
    const ctx = await buildTestApp();
    const noAuth = await ctx.app.inject({ method: 'GET', url: '/api/v1/geocode?q=Firenze' });
    expect(noAuth.statusCode).toBe(401);
    const noQuery = await ctx.app.inject({
      method: 'GET',
      url: '/api/v1/geocode',
      headers: auth(ctx.tokens.editor),
    });
    expect(noQuery.statusCode).toBe(400);
  });
});
