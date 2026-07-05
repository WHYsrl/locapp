const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'VenueScout/1.0 (info@justwhy.it)';
const TIMEOUT_MS = 5_000;

/** A single geocoding candidate returned by OSM Nominatim. */
export interface GeocodeCandidate {
  display_name: string;
  lat: number;
  lon: number;
  type: string;
  importance: number;
}

export type GeocodeFn = (query: string) => Promise<GeocodeCandidate[]>;

/** Builds a Google Maps search link for a coordinate pair. */
export function googleMapsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

/** Joins the available address parts into a single free-form geocoding query. */
export function buildGeocodeQuery(parts: {
  name?: string | null;
  address_line?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
}): string {
  return [parts.name, parts.address_line, parts.postal_code, parts.city, parts.province, parts.country]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
    .join(', ');
}

/**
 * Geocodes a free-form query via OSM Nominatim (limited to Italy).
 * Never throws: any network / HTTP / payload failure resolves to [].
 * `fetchFn` is injectable for testability (defaults to global fetch).
 */
export async function geocodeAddress(
  query: string,
  fetchFn: typeof fetch = fetch,
): Promise<GeocodeCandidate[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `${NOMINATIM_ENDPOINT}?format=jsonv2&limit=5&countrycodes=it&q=${encodeURIComponent(q)}`;
  try {
    const response = await fetchFn(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) return [];
    const candidates: GeocodeCandidate[] = [];
    for (const entry of payload) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const lat = Number.parseFloat(String(e['lat']));
      const lon = Number.parseFloat(String(e['lon']));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      candidates.push({
        display_name: typeof e['display_name'] === 'string' ? e['display_name'] : '',
        lat,
        lon,
        type: typeof e['type'] === 'string' ? e['type'] : '',
        importance: typeof e['importance'] === 'number' ? e['importance'] : 0,
      });
    }
    return candidates;
  } catch {
    return [];
  }
}
