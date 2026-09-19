import type { LocationItem } from '../types';
import { getDistanceMeters } from '../spatial/radar';

export interface SearchResult {
  location: LocationItem;
  distance?: number;
  score: number;
}

export class InstantSearch {
  private locations: LocationItem[] = [];

  setLocations(locations: LocationItem[]): void {
    this.locations = locations;
  }

  search(
    query: string,
    options: {
      playerLat?: number | null;
      playerLng?: number | null;
      world?: string;
      limit?: number;
    } = {}
  ): SearchResult[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const limit = options.limit ?? 50;
    const tokens = q.split(/\s+/);
    const results: SearchResult[] = [];

    for (const loc of this.locations) {
      // Optional world filter if specified
      if (options.world && loc.world !== options.world) {
        // give lower priority or skip? Let's search all, but rank matching world higher
      }

      const titleLower = loc.title.toLowerCase();
      const catLower = loc.categoryTitle.toLowerCase();
      const descLower = loc.description.toLowerCase();

      let score = 0;

      // Exact title match gets huge boost
      if (titleLower === q) {
        score += 100;
      } else if (titleLower.startsWith(q)) {
        score += 50;
      } else if (titleLower.includes(q)) {
        score += 30;
      }

      // Check category match
      if (catLower.includes(q)) {
        score += 20;
      }

      // Token coverage test
      let matchedAllTokens = true;
      for (const token of tokens) {
        if (!titleLower.includes(token) && !catLower.includes(token) && !descLower.includes(token)) {
          matchedAllTokens = false;
          break;
        }
      }

      if (!matchedAllTokens && score === 0) {
        continue;
      }

      if (score === 0) {
        score = 10;
      }

      let distance: number | undefined;
      if (options.playerLat != null && options.playerLng != null && loc.world === options.world) {
        distance = getDistanceMeters(options.playerLat, options.playerLng, loc.lat, loc.lng);
        // proximity bonus: closer gives higher score bonus
        const distKm = distance / 1000;
        score += Math.max(0, 20 - distKm);
      }

      results.push({
        location: loc,
        distance,
        score,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
}

export const searchIndex = new InstantSearch();
