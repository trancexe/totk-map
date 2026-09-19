import type { FeatureCollection, Polygon } from 'geojson';
import type { LocationItem, WorldType } from '../types';

// MapGenie coordinate space:
// Hyrule surface spans roughly 0.55 lat span, corresponding to ~10,000 game meters.
// 1 unit in MapGenie lat/lng coordinate space is approximately 18,200 meters.
export const METERS_PER_COORD_UNIT = 18200;

export function getDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  const distUnits = Math.sqrt(dLat * dLat + dLng * dLng);
  return distUnits * METERS_PER_COORD_UNIT;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * Filter locations within a radius of the anchor point in the matching world.
 */
export function getLocationsInRadius(
  locations: LocationItem[],
  lat: number,
  lng: number,
  radiusMeters: number,
  world: WorldType,
  completedSet: Set<number>,
  hideCompleted: boolean
): { location: LocationItem; distance: number }[] {
  if (radiusMeters <= 0) return [];

  const maxDistUnits = radiusMeters / METERS_PER_COORD_UNIT;
  const maxDistSq = maxDistUnits * maxDistUnits;

  const result: { location: LocationItem; distance: number }[] = [];

  for (const loc of locations) {
    if (loc.world !== world) continue;
    if (hideCompleted && completedSet.has(loc.id)) continue;

    const dLat = loc.lat - lat;
    const dLng = loc.lng - lng;
    const distSq = dLat * dLat + dLng * dLng;

    if (distSq <= maxDistSq) {
      const distance = Math.sqrt(distSq) * METERS_PER_COORD_UNIT;
      result.push({ location: loc, distance });
    }
  }

  // Sort closest first
  result.sort((a, b) => a.distance - b.distance);
  return result;
}

/**
 * Creates a GeoJSON Polygon circle around (lat, lng) with radius in meters.
 * Points are returned in MapLibre coordinates [lng, lat].
 */
export function createRadarGeoJSON(lat: number, lng: number, radiusMeters: number): FeatureCollection<Polygon> {
  if (radiusMeters <= 0) {
    return {
      type: 'FeatureCollection',
      features: [],
    };
  }

  const radiusUnits = radiusMeters / METERS_PER_COORD_UNIT;
  const steps = 64;
  const coordinates: [number, number][] = [];

  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    // Planar circle in MapGenie normalized coordinates
    const dLng = radiusUnits * Math.cos(angle);
    const dLat = radiusUnits * Math.sin(angle);
    coordinates.push([lng + dLng, lat + dLat]);
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [coordinates],
        },
        properties: {
          radiusMeters,
        },
      },
    ],
  };
}
