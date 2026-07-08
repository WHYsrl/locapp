/**
 * POI route maps for exports: when GOOGLE_MAPS_API_KEY is set, computes
 * driving routes (Routes API computeRoutes, up to the 5 nearest POIs) for
 * every venue card with coordinates and builds ONE Maps Static API URL per
 * card with the route polylines drawn (`path=enc:<polyline>`), a berry marker
 * on the location and gold markers on the POIs. Real route km/min replace the
 * haversine estimates (estimated: false). Without a key (or when a route
 * fails) nothing changes: markers-only map / OSM map-thumb + 'stima' remain.
 * Best-effort like the rest of the maps stack: never throws.
 */
import { googleComputeRoute, googlePoiStaticMapUrl, type LatLng } from '../lib/googlemaps.js';
import { venueCards, type ExportData } from './collect.js';

/** Static Maps URLs stay readable and the batchUpdate small: cap routed POIs. */
const MAX_ROUTE_POIS = 5;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export async function resolvePoiMaps(
  data: ExportData,
  opts: { googleMapsApiKey?: string; fetchFn?: typeof fetch },
): Promise<void> {
  const apiKey = opts.googleMapsApiKey;
  if (!apiKey) return;
  const fetchFn = opts.fetchFn ?? fetch;

  for (const { card } of venueCards(data)) {
    if (!card.geo || !card.poi_distances?.length) continue;
    const nearest = card.poi_distances
      .filter((d) => d.lon != null && d.lat != null)
      .slice(0, MAX_ROUTE_POIS);
    if (nearest.length === 0) continue;

    const origin: LatLng = { lat: card.geo.lat, lng: card.geo.lon };
    const destinations: LatLng[] = nearest.map((d) => ({ lat: d.lat!, lng: d.lon! }));
    const routes = await Promise.all(
      destinations.map((dest) => googleComputeRoute(origin, dest, apiKey, fetchFn)),
    );

    const polylines: string[] = [];
    routes.forEach((route, i) => {
      if (!route) return; // no route: keep the haversine 'stima' for this POI
      if (route.encodedPolyline) polylines.push(route.encodedPolyline);
      const entry = nearest[i]!;
      entry.km = round1(route.km);
      entry.minutes_car = route.minutes;
      entry.estimated = false;
    });

    card.poi_map_url = googlePoiStaticMapUrl(origin, destinations, polylines, apiKey);
    // Real driving distances may reorder the nearest-first list.
    card.poi_distances.sort((a, b) => a.km - b.km);
  }
}
