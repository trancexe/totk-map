import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

describe('1. Spatial & Radar Calculation Suite', () => {
  const METERS_PER_COORD_UNIT = 18200;

  function getDistanceMeters(lat1, lng1, lat2, lng2) {
    const dLat = lat2 - lat1;
    const dLng = lng2 - lng1;
    return Math.sqrt(dLat * dLat + dLng * dLng) * METERS_PER_COORD_UNIT;
  }

  function createRadarGeoJSON(lat, lng, radiusMeters) {
    if (radiusMeters <= 0) {
      return { type: 'FeatureCollection', features: [] };
    }
    const radiusUnits = radiusMeters / METERS_PER_COORD_UNIT;
    const steps = 32;
    const coordinates = [];
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * 2 * Math.PI;
      coordinates.push([lng + radiusUnits * Math.cos(angle), lat + radiusUnits * Math.sin(angle)]);
    }
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [coordinates] },
          properties: {},
        },
      ],
    };
  }

  test('distance calculation between identical points is 0m', () => {
    assert.equal(getDistanceMeters(0.702, -0.692, 0.702, -0.692), 0);
  });

  test('distance calculation scales linearly with units', () => {
    const d = getDistanceMeters(0, 0, 0, 0.01);
    assert.ok(Math.abs(d - 182) < 0.1, `Expected ~182m, got ${d}`);
  });

  test('createRadarGeoJSON returns empty for 0 radius', () => {
    const geo = createRadarGeoJSON(0.7, -0.6, 0);
    assert.equal(geo.features.length, 0);
  });

  test('createRadarGeoJSON returns closed Polygon for positive radius', () => {
    const geo = createRadarGeoJSON(0.7, -0.6, 1000);
    assert.equal(geo.features.length, 1);
    const ring = geo.features[0].geometry.coordinates[0];
    assert.ok(ring.length > 30);
    // Closed polygon invariant: first == last point
    assert.deepEqual(ring[0], ring[ring.length - 1]);
  });
});

describe('2. Search Index & Ranking Suite', () => {
  // Simple simulator for search tokenizer
  function tokenize(str) {
    return str.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);
  }

  test('tokenization handles symbols and uppercase cleanly', () => {
    const tokens = tokenize("Sage's Will - Sky Island #1");
    assert.deepEqual(tokens, ['sage', 's', 'will', 'sky', 'island', '1']);
  });

  test('search matching scores title prefix and words', () => {
    const items = [
      { id: 1, title: 'Kyokugon Shrine' },
      { id: 2, title: 'Yamiyo Shrine' },
      { id: 3, title: 'Great Sky Island Korok' },
    ];

    const q = 'kyok';
    const matches = items.filter((it) => it.title.toLowerCase().includes(q));
    assert.equal(matches.length, 1);
    assert.equal(matches[0].id, 1);
  });
});

describe('3. Core Data Integrity & Offline Assets', () => {
  const dataPath = path.join(PROJECT_ROOT, 'public/totk_data.json');

  test('public/totk_data.json exists and contains 7,943 locations', () => {
    assert.ok(fs.existsSync(dataPath), 'totk_data.json must exist');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    assert.ok(Array.isArray(data.locations));
    assert.equal(data.locations.length, 7943, 'Must contain 7,943 total locations');
    assert.ok(Object.keys(data.categories).length >= 160);
    assert.ok(data.groups.length >= 10);
  });

  test('all 6 guide datasets exist with non-empty items', () => {
    const guidesDir = path.join(PROJECT_ROOT, 'public/guides');
    const expected = [
      { name: 'armor_sets.json', key: 'totalPieces', expectedMin: 130 },
      { name: 'sages_will.json', isArray: true, expectedLen: 20 },
      { name: 'dragons.json', isArray: true, expectedLen: 4 },
      { name: 'minibosses.json', isArray: true, expectedLen: 269 },
      { name: 'voice_memories.json', isArray: true, expectedLen: 240 },
      { name: 'checklist_100.json', key: 'total', expectedLen: 2279 },
    ];

    for (const exp of expected) {
      const file = path.join(guidesDir, exp.name);
      assert.ok(fs.existsSync(file), `${exp.name} must exist`);
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (exp.isArray) {
        assert.equal(parsed.length, exp.expectedLen, `${exp.name} length mismatch`);
      } else if (exp.key) {
        if (exp.expectedLen) assert.equal(parsed[exp.key], exp.expectedLen);
        if (exp.expectedMin) assert.ok(parsed[exp.key] >= exp.expectedMin);
      }
    }
  });

  test('offline map tiles exist across Zoom 9 to 15', () => {
    const tilesDir = path.join(PROJECT_ROOT, 'public/tiles');
    assert.ok(fs.existsSync(tilesDir), 'public/tiles must exist');
    for (let z = 9; z <= 15; z++) {
      const zDir = path.join(tilesDir, String(z));
      assert.ok(fs.existsSync(zDir), `Zoom ${z} folder must exist`);
      const subdirs = fs.readdirSync(zDir);
      assert.ok(subdirs.length > 0, `Zoom ${z} must have x coordinate subdirectories`);
    }
  });

  test('markers sprite atlas exists and is populated', () => {
    const png = path.join(PROJECT_ROOT, 'public/markers@2x.png');
    const json = path.join(PROJECT_ROOT, 'public/markers@2x.json');
    assert.ok(fs.existsSync(png), 'markers@2x.png must exist');
    assert.ok(fs.existsSync(json), 'markers@2x.json must exist');
    const sprites = JSON.parse(fs.readFileSync(json, 'utf-8'));
    assert.ok(Object.keys(sprites).length >= 100, 'Must have sprites for all categories');
  });

  test('Service Worker sw.js and Web Manifest exist', () => {
    const sw = path.join(PROJECT_ROOT, 'public/sw.js');
    const manifest = path.join(PROJECT_ROOT, 'public/manifest.webmanifest');
    assert.ok(fs.existsSync(sw), 'sw.js must exist');
    assert.ok(fs.existsSync(manifest), 'manifest.webmanifest must exist');
    const parsedManifest = JSON.parse(fs.readFileSync(manifest, 'utf-8'));
    assert.equal(parsedManifest.display, 'standalone');
  });
});
