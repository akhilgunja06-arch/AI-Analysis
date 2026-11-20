/**
 * Location handling for nearby-member discovery.
 *
 * Two rules shape this module:
 *
 *  1. Exact coordinates never leave the server. Callers get a point snapped to
 *     a ~1 km grid plus a place label, which is enough to place a pin on a map
 *     and useless for finding someone's front door.
 *  2. Nothing is stored without explicit consent. `consentAt` records when the
 *     member agreed, and `sharingEnabled` decides whether anyone else sees it.
 *
 * Distance is computed with a bounding box plus haversine in SQL-free JS rather
 * than PostGIS: the deployment target is plain PostgreSQL, and at city scale
 * the bounding-box index does the heavy lifting before the precise pass.
 */

export type Coordinates = { latitude: number; longitude: number };

export type PlaceFields = {
  label?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
};

const EARTH_RADIUS_KM = 6371;

/** Metres per degree of latitude. Longitude shrinks with latitude. */
const KM_PER_DEGREE_LAT = 111.32;

export function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/** Great-circle distance in kilometres. */
export function distanceKm(a: Coordinates, b: Coordinates): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Bounding box around a point, used to narrow the database scan before the
 * precise haversine pass. Over-selects slightly at high latitudes, which the
 * caller corrects by filtering on the real distance.
 */
export function boundingBox(center: Coordinates, radiusKm: number) {
  const latDelta = radiusKm / KM_PER_DEGREE_LAT;
  const cosLat = Math.cos((center.latitude * Math.PI) / 180);
  // Near the poles a degree of longitude collapses; clamp to the full range
  // rather than dividing by ~0 and producing an infinite box.
  const lonDelta = Math.abs(cosLat) < 1e-6 ? 180 : radiusKm / (KM_PER_DEGREE_LAT * cosLat);

  return {
    minLat: Math.max(-90, center.latitude - latDelta),
    maxLat: Math.min(90, center.latitude + latDelta),
    minLon: Math.max(-180, center.longitude - lonDelta),
    maxLon: Math.min(180, center.longitude + lonDelta),
  };
}

/**
 * Snaps a coordinate to a ~1 km grid. This is what other members receive, so
 * two people in the same neighbourhood share a pin while an exact address
 * cannot be recovered from it.
 */
export function approximate(coord: Coordinates): Coordinates {
  const grid = 0.01;
  return {
    latitude: Math.round(coord.latitude / grid) * grid,
    longitude: Math.round(coord.longitude / grid) * grid,
  };
}

/** Coarse human label, preferring the most specific field that exists. */
export function placeLabel(row: {
  label?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
}): string | null {
  const parts = [row.city, row.region, row.country].filter((p): p is string => Boolean(p));
  if (row.label) return parts.length ? `${row.label}, ${parts.join(', ')}` : row.label;
  return parts.length ? parts.join(', ') : null;
}

export type NearbyMember = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  headline: string | null;
  teaches: { name: string; slug: string; level: string }[];
  /** Grid-snapped, never the stored coordinate. */
  location: Coordinates;
  place: string | null;
  distanceKm: number;
};

export const DISTANCE_OPTIONS_KM = [1, 5, 10, 25, 50] as const;
