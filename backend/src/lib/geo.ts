const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Rough car-travel estimate at 40 km/h average urban speed. */
export function estimateMinutesByCar(km: number): number {
  return Math.round((km / 40) * 60);
}
