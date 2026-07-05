import { describe, expect, it } from 'vitest';
import { buildFeatureCollection } from '../src/lib/geojson.js';

describe('buildFeatureCollection', () => {
  it('builds Point features for locations and pois', () => {
    const fc = buildFeatureCollection(
      [{ locationId: 'l1', name: 'Villa', city: 'Roma', status: 'proposta', eventId: 'e1', lon: 12.5, lat: 41.9 }],
      [{ id: 'p1', name: 'Termini', kind: 'stazione', lon: 12.501, lat: 41.901 }],
    );
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]).toEqual({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [12.5, 41.9] },
      properties: {
        feature_type: 'location',
        location_id: 'l1',
        name: 'Villa',
        city: 'Roma',
        address_line: null,
        status: 'proposta',
        event_id: 'e1',
      },
    });
    expect(fc.features[1]!.properties['feature_type']).toBe('poi');
  });

  it('emits null geometry when coordinates are missing', () => {
    const fc = buildFeatureCollection([{ locationId: 'l1', name: 'X', city: null, lon: null, lat: null }]);
    expect(fc.features[0]!.geometry).toBeNull();
  });
});
