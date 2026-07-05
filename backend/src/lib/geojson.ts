export interface MapLocation {
  locationId: string;
  name: string;
  city: string | null;
  addressLine?: string | null;
  status?: string | null;
  eventId?: string | null;
  lon: number | null;
  lat: number | null;
}

export interface MapPoi {
  id: string;
  name: string;
  kind: string;
  lon: number | null;
  lat: number | null;
}

export interface GeoJsonFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] } | null;
  properties: Record<string, unknown>;
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

/** Builds the GeoJSON FeatureCollection for event/project maps (SPEC §2.6). */
export function buildFeatureCollection(
  locations: MapLocation[],
  pois: MapPoi[] = [],
): GeoJsonFeatureCollection {
  const features: GeoJsonFeature[] = [];

  for (const l of locations) {
    features.push({
      type: 'Feature',
      geometry: l.lon != null && l.lat != null ? { type: 'Point', coordinates: [l.lon, l.lat] } : null,
      properties: {
        feature_type: 'location',
        location_id: l.locationId,
        name: l.name,
        city: l.city,
        address_line: l.addressLine ?? null,
        status: l.status ?? null,
        event_id: l.eventId ?? null,
      },
    });
  }
  for (const p of pois) {
    features.push({
      type: 'Feature',
      geometry: p.lon != null && p.lat != null ? { type: 'Point', coordinates: [p.lon, p.lat] } : null,
      properties: { feature_type: 'poi', poi_id: p.id, name: p.name, kind: p.kind },
    });
  }

  return { type: 'FeatureCollection', features };
}
