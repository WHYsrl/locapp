/**
 * Google Maps Platform clients (Geocoding, Routes v2 matrix, Static Maps).
 * Everything is optional: callers only use these when GOOGLE_MAPS_API_KEY is
 * set and every function falls back gracefully (empty result, never throws),
 * so the OSM/haversine code paths remain the safety net.
 */
import {
  buildGeocodeQuery,
  type GeocodeCandidate,
  type GeocodeFn,
  type GeocodeParts,
} from './geocode.js';

const GEOCODE_ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json';
const ROUTE_MATRIX_ENDPOINT = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const COMPUTE_ROUTES_ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const STATIC_MAP_ENDPOINT = 'https://maps.googleapis.com/maps/api/staticmap';
const TIMEOUT_MS = 8_000;

/** Berry marker matching the app accent color (hex without # for the Static Maps API). */
export const STATIC_MAP_MARKER_COLOR = '0x6D2E46';

/** Gold marker used for POIs on export static maps. */
export const STATIC_MAP_POI_COLOR = '0xD4A947';

/** Map styles supported by the Static Maps `maptype` parameter. */
export const STATIC_MAP_TYPES = ['roadmap', 'terrain', 'satellite', 'hybrid'] as const;
export type StaticMapType = (typeof STATIC_MAP_TYPES)[number];

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteMatrixEntry {
  origin_i: number;
  dest_i: number;
  km: number;
  minutes: number;
}

/**
 * Geocodes a free-form query via the Google Geocoding API (region/language it).
 * Never throws; resolves to [] on any HTTP/network/payload failure.
 */
export async function googleGeocodeQuery(
  query: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch,
): Promise<GeocodeCandidate[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `${GEOCODE_ENDPOINT}?address=${encodeURIComponent(q)}&region=it&language=it&key=${encodeURIComponent(apiKey)}`;
  try {
    const response = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      status?: unknown;
      results?: unknown;
    };
    if (payload.status !== 'OK' || !Array.isArray(payload.results)) return [];
    const candidates: GeocodeCandidate[] = [];
    for (const entry of payload.results.slice(0, 5)) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const location = (e['geometry'] as Record<string, unknown> | undefined)?.['location'] as
        | Record<string, unknown>
        | undefined;
      const lat = Number(location?.['lat']);
      const lon = Number(location?.['lng']);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const types = Array.isArray(e['types']) ? (e['types'] as unknown[]) : [];
      candidates.push({
        display_name: typeof e['formatted_address'] === 'string' ? e['formatted_address'] : '',
        lat,
        lon,
        type: typeof types[0] === 'string' ? types[0] : '',
        // Google returns results by relevance; keep a descending pseudo-importance.
        importance: Math.max(0, 1 - candidates.length * 0.1),
      });
    }
    return candidates;
  } catch {
    return [];
  }
}

/** Structured geocoding: joins the parts into one query (GeocodeCandidate shape as Nominatim). */
export async function googleGeocode(
  parts: GeocodeParts,
  apiKey: string,
  fetchFn: typeof fetch = fetch,
): Promise<GeocodeCandidate[]> {
  return googleGeocodeQuery(buildGeocodeQuery(parts), apiKey, fetchFn);
}

/**
 * Wraps a query-based geocoder: Google first, `fallback` (Nominatim or the
 * injected test geocoder) when Google returns nothing or errors out.
 */
export function withGoogleGeocode(
  apiKey: string,
  fallback: GeocodeFn,
  fetchFn: typeof fetch = fetch,
): GeocodeFn {
  return async (query: string) => {
    const candidates = await googleGeocodeQuery(query, apiKey, fetchFn);
    return candidates.length > 0 ? candidates : fallback(query);
  };
}

/**
 * Driving distance matrix via the Routes API v2 computeRouteMatrix endpoint.
 * Never throws; resolves to [] on any failure (callers fall back to haversine).
 */
export async function googleRouteMatrix(
  origins: LatLng[],
  destinations: LatLng[],
  apiKey: string,
  fetchFn: typeof fetch = fetch,
): Promise<RouteMatrixEntry[]> {
  if (origins.length === 0 || destinations.length === 0) return [];
  const waypoint = (p: LatLng) => ({
    waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } },
  });
  try {
    const response = await fetchFn(ROUTE_MATRIX_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,duration,condition',
      },
      body: JSON.stringify({
        origins: origins.map(waypoint),
        destinations: destinations.map(waypoint),
        travelMode: 'DRIVE',
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) return [];
    const entries: RouteMatrixEntry[] = [];
    for (const element of payload) {
      if (!element || typeof element !== 'object') continue;
      const e = element as Record<string, unknown>;
      if (typeof e['condition'] === 'string' && e['condition'] !== 'ROUTE_EXISTS') continue;
      const originIndex = Number(e['originIndex'] ?? 0);
      const destinationIndex = Number(e['destinationIndex'] ?? 0);
      const distanceMeters = Number(e['distanceMeters']);
      if (!Number.isInteger(originIndex) || !Number.isInteger(destinationIndex)) continue;
      if (!Number.isFinite(distanceMeters)) continue;
      // duration is a protobuf Duration string like "1234s".
      const seconds =
        typeof e['duration'] === 'string' ? Number.parseFloat(e['duration'].replace(/s$/, '')) : NaN;
      entries.push({
        origin_i: originIndex,
        dest_i: destinationIndex,
        km: distanceMeters / 1000,
        minutes: Number.isFinite(seconds) ? Math.round(seconds / 60) : 0,
      });
    }
    return entries;
  } catch {
    return [];
  }
}

export interface ComputedRoute {
  encodedPolyline: string | null;
  km: number;
  minutes: number;
}

/**
 * Single driving route via the Routes API v2 computeRoutes endpoint, fieldmask
 * limited to routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration.
 * Never throws; resolves to null on any failure (callers keep their haversine
 * estimate and render a markers-only static map).
 */
export async function googleComputeRoute(
  origin: LatLng,
  destination: LatLng,
  apiKey: string,
  fetchFn: typeof fetch = fetch,
): Promise<ComputedRoute | null> {
  const waypoint = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  try {
    const response = await fetchFn(COMPUTE_ROUTES_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration',
      },
      body: JSON.stringify({
        origin: waypoint(origin),
        destination: waypoint(destination),
        travelMode: 'DRIVE',
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { routes?: unknown };
    const route = Array.isArray(payload.routes)
      ? (payload.routes[0] as Record<string, unknown> | undefined)
      : undefined;
    if (!route || typeof route !== 'object') return null;
    const distanceMeters = Number(route['distanceMeters']);
    if (!Number.isFinite(distanceMeters)) return null;
    // duration is a protobuf Duration string like "1234s".
    const seconds =
      typeof route['duration'] === 'string' ? Number.parseFloat(route['duration'].replace(/s$/, '')) : NaN;
    const polyline = (route['polyline'] as Record<string, unknown> | undefined)?.['encodedPolyline'];
    return {
      encodedPolyline: typeof polyline === 'string' && polyline.length > 0 ? polyline : null,
      km: distanceMeters / 1000,
      minutes: Number.isFinite(seconds) ? Math.round(seconds / 60) : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Maps Static API URL for the export POI slide: berry marker on the location,
 * gold markers on the POIs and one `path=enc:<polyline>` per computed route
 * (markers-only when no route polylines are available — still fine).
 * The URL embeds the server API key: that is how Static Maps works (referer-free
 * server key, noted in SPEC.md) — the URL is only handed to the Slides API.
 */
export function googlePoiStaticMapUrl(
  origin: LatLng,
  pois: LatLng[],
  polylines: string[],
  apiKey: string,
): string {
  const params = new URLSearchParams({ size: '640x400', maptype: 'roadmap' });
  params.append('markers', `color:${STATIC_MAP_MARKER_COLOR}|${origin.lat},${origin.lng}`);
  if (pois.length > 0) {
    params.append(
      'markers',
      `color:${STATIC_MAP_POI_COLOR}|size:small|${pois.map((p) => `${p.lat},${p.lng}`).join('|')}`,
    );
  }
  const key = `&${new URLSearchParams({ key: apiKey }).toString()}`;
  // Encoded polylines can be very long; Slides' createImage rejects URLs over
  // 2K bytes. Add routes only while the final URL stays within budget
  // (markers are always kept, so the map degrades gracefully).
  let url = `${STATIC_MAP_ENDPOINT}?${params.toString()}`;
  for (const polyline of polylines) {
    const withPath = `${url}&${new URLSearchParams({ path: `enc:${polyline}` }).toString()}`;
    if (withPath.length + key.length > STATIC_MAP_URL_BUDGET) break;
    url = withPath;
  }
  return `${url}${key}`;
}

/** Slides' createImage rejects URLs over 2K bytes: keep a safety margin. */
export const STATIC_MAP_URL_BUDGET = 1900;

/** Maps Static API URL (480x240, zoom 15, berry marker). Contains the key: server-side use only. */
export function googleStaticMapUrl(
  lat: number,
  lng: number,
  apiKey: string,
  maptype: StaticMapType = 'roadmap',
): string {
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: '15',
    size: '480x240',
    maptype,
    markers: `color:${STATIC_MAP_MARKER_COLOR}|${lat},${lng}`,
    key: apiKey,
  });
  return `${STATIC_MAP_ENDPOINT}?${params.toString()}`;
}

/**
 * Proxy-fetches the Google static map bytes so the API key never reaches the
 * client. Resolves to null on any failure (caller falls back to OSM tiles).
 */
export async function fetchGoogleStaticMap(
  lat: number,
  lng: number,
  apiKey: string,
  fetchFn: typeof fetch = fetch,
  maptype: StaticMapType = 'roadmap',
): Promise<Buffer | null> {
  try {
    const response = await fetchFn(googleStaticMapUrl(lat, lng, apiKey, maptype), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}
