import { describe, expect, it, vi } from 'vitest';
import {
  googleGeocode,
  googleGeocodeQuery,
  googleRouteMatrix,
  googleStaticMapUrl,
  withGoogleGeocode,
} from '../src/lib/googlemaps.js';

const KEY = 'test-maps-key';

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status });

describe('googleGeocode', () => {
  const geocodePayload = {
    status: 'OK',
    results: [
      {
        formatted_address: 'Via Roma 1, 00100 Roma RM, Italia',
        geometry: { location: { lat: 41.9, lng: 12.5 } },
        types: ['street_address'],
      },
    ],
  };

  it('maps Geocoding API results to the GeocodeCandidate shape (region/language it)', async () => {
    const fetchFn = vi.fn(async () => jsonResponse(geocodePayload)) as unknown as typeof fetch;
    const candidates = await googleGeocode(
      { name: 'Sede', address_line: 'Via Roma 1', city: 'Roma' },
      KEY,
      fetchFn,
    );
    expect(candidates).toEqual([
      {
        display_name: 'Via Roma 1, 00100 Roma RM, Italia',
        lat: 41.9,
        lon: 12.5,
        type: 'street_address',
        importance: 1,
      },
    ]);
    const url = String((fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(url).toContain('https://maps.googleapis.com/maps/api/geocode/json');
    expect(url).toContain('region=it');
    expect(url).toContain('language=it');
    expect(url).toContain(`key=${KEY}`);
  });

  it('resolves to [] on HTTP errors, ZERO_RESULTS and network failures', async () => {
    expect(await googleGeocodeQuery('x', KEY, (async () => jsonResponse({}, 500)) as typeof fetch)).toEqual([]);
    expect(
      await googleGeocodeQuery('x', KEY, (async () => jsonResponse({ status: 'ZERO_RESULTS', results: [] })) as typeof fetch),
    ).toEqual([]);
    expect(
      await googleGeocodeQuery('x', KEY, (async () => {
        throw new Error('boom');
      }) as typeof fetch),
    ).toEqual([]);
  });

  it('withGoogleGeocode prefers Google and falls back to the wrapped geocoder when empty', async () => {
    const fallback = vi.fn(async () => [
      { display_name: 'OSM', lat: 1, lon: 2, type: 'osm', importance: 0.5 },
    ]);
    const googleFirst = withGoogleGeocode(KEY, fallback, (async () => jsonResponse(geocodePayload)) as typeof fetch);
    expect((await googleFirst('Via Roma 1'))[0]!.display_name).toContain('Via Roma 1');
    expect(fallback).not.toHaveBeenCalled();

    const googleDown = withGoogleGeocode(KEY, fallback, (async () => jsonResponse({}, 403)) as typeof fetch);
    expect((await googleDown('Via Roma 1'))[0]!.display_name).toBe('OSM');
    expect(fallback).toHaveBeenCalledWith('Via Roma 1');
  });
});

describe('googleRouteMatrix', () => {
  it('POSTs to computeRouteMatrix with key/fieldmask headers and parses entries', async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse([
        { originIndex: 0, destinationIndex: 0, distanceMeters: 12500, duration: '900s', condition: 'ROUTE_EXISTS' },
        { originIndex: 0, destinationIndex: 1, condition: 'ROUTE_NOT_FOUND' },
      ]),
    ) as unknown as typeof fetch;
    const entries = await googleRouteMatrix(
      [{ lat: 41.9, lng: 12.5 }],
      [
        { lat: 41.8, lng: 12.25 },
        { lat: 45.4, lng: 9.19 },
      ],
      KEY,
      fetchFn,
    );
    expect(entries).toEqual([{ origin_i: 0, dest_i: 0, km: 12.5, minutes: 15 }]);

    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Goog-Api-Key']).toBe(KEY);
    expect(headers['X-Goog-FieldMask']).toContain('distanceMeters');
    const body = JSON.parse(String(init.body));
    expect(body.travelMode).toBe('DRIVE');
    expect(body.origins[0].waypoint.location.latLng).toEqual({ latitude: 41.9, longitude: 12.5 });
    expect(body.destinations).toHaveLength(2);
  });

  it('resolves to [] on HTTP or network failure (haversine fallback path)', async () => {
    expect(
      await googleRouteMatrix([{ lat: 1, lng: 1 }], [{ lat: 2, lng: 2 }], KEY, (async () =>
        jsonResponse({}, 429)) as typeof fetch),
    ).toEqual([]);
    expect(
      await googleRouteMatrix([{ lat: 1, lng: 1 }], [{ lat: 2, lng: 2 }], KEY, (async () => {
        throw new Error('down');
      }) as typeof fetch),
    ).toEqual([]);
  });
});

describe('googleStaticMapUrl', () => {
  it('builds a 480x240 zoom-15 URL with the berry marker and the key', () => {
    const url = googleStaticMapUrl(41.9, 12.5, KEY);
    expect(url).toContain('https://maps.googleapis.com/maps/api/staticmap?');
    expect(url).toContain('size=480x240');
    expect(url).toContain('zoom=15');
    expect(url).toContain(encodeURIComponent('color:0x6D2E46|41.9,12.5'));
    expect(url).toContain(`key=${KEY}`);
  });

  it('defaults maptype to roadmap and honors an explicit style', () => {
    expect(googleStaticMapUrl(41.9, 12.5, KEY)).toContain('maptype=roadmap');
    expect(googleStaticMapUrl(41.9, 12.5, KEY, 'terrain')).toContain('maptype=terrain');
    expect(googleStaticMapUrl(41.9, 12.5, KEY, 'satellite')).toContain('maptype=satellite');
    expect(googleStaticMapUrl(41.9, 12.5, KEY, 'hybrid')).toContain('maptype=hybrid');
  });
});
