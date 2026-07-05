import { customType } from 'drizzle-orm/pg-core';

export interface GeoPoint {
  lon: number;
  lat: number;
}

/** PostGIS geometry(Point,4326). Written as EWKT; read back as raw WKB hex
 * (route serializers select ST_X/ST_Y explicitly when coordinates are needed). */
export const geometryPoint = customType<{ data: GeoPoint; driverData: string }>({
  dataType() {
    return 'geometry(Point,4326)';
  },
  toDriver(value: GeoPoint): string {
    return `SRID=4326;POINT(${value.lon} ${value.lat})`;
  },
  fromDriver(value: string): GeoPoint {
    // Raw hex WKB is not parsed here; queries needing coordinates use ST_X/ST_Y.
    return { lon: NaN, lat: NaN, raw: value } as unknown as GeoPoint;
  },
});

/** pgvector embedding column. */
export const vector = (name: string, dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    toDriver(value: number[]): string {
      return `[${value.join(',')}]`;
    },
    fromDriver(value: string): number[] {
      return value
        .slice(1, -1)
        .split(',')
        .map((v) => Number.parseFloat(v));
    },
  })(name);
