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

/** Structured address parts used to build progressively looser geocoding queries. */
export interface GeocodeParts {
  name?: string | null;
  address_line?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

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
 * Builds the fallback query variants for structured geocoding, most precise
 * first. Nominatim often returns nothing when the venue name is prepended to
 * a street address, so the address-only variants come before the name ones:
 *   (a) address_line + postal_code + city
 *   (b) address_line + city
 *   (c) name + city
 *   (d) name + province (or city when no province)
 * Variants missing a required part are skipped; duplicates are removed.
 */
export function buildGeocodeVariants(parts: GeocodeParts): string[] {
  const t = (v: string | null | undefined): string => (typeof v === 'string' ? v.trim() : '');
  const name = t(parts.name);
  const address = t(parts.address_line);
  const city = t(parts.city);
  const province = t(parts.province);
  const postalCode = t(parts.postal_code);

  const variants: string[] = [];
  const add = (pieces: string[], required = pieces) => {
    if (required.some((p) => !p)) return;
    const q = pieces.filter(Boolean).join(', ');
    if (q && !variants.includes(q)) variants.push(q);
  };
  add([address, postalCode, city]);
  add([address, city]);
  add([name, city]);
  add([name, province || city]);
  return variants;
}

/**
 * Tries the geocode variants in order and returns the candidates of the first
 * variant that yields any result (deduped by coordinates). Results from
 * different variants are never mixed. `geocode` is the query-based geocoder
 * (injectable for tests and app deps).
 */
export async function geocodeBestWith(parts: GeocodeParts, geocode: GeocodeFn): Promise<GeocodeCandidate[]> {
  for (const query of buildGeocodeVariants(parts)) {
    const candidates = await geocode(query);
    if (candidates.length > 0) {
      const seen = new Set<string>();
      return candidates.filter((c) => {
        const key = `${c.lat},${c.lon}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
  }
  return [];
}

/**
 * Structured geocoding against OSM Nominatim with variant fallback (see
 * buildGeocodeVariants). Never throws; resolves to [] when nothing matches.
 */
export async function geocodeBest(
  parts: GeocodeParts,
  fetchFn: typeof fetch = fetch,
): Promise<GeocodeCandidate[]> {
  return geocodeBestWith(parts, (q) => geocodeAddress(q, fetchFn));
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
