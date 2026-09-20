import { Map as MapLibreMap, GeoJSONSource, setWorkerUrl } from 'maplibre-gl';
import type { Feature, Point, FeatureCollection } from 'geojson';
import type { LocationItem, WorldType, PlayerState } from '../types';
import { createRadarGeoJSON } from '../spatial/radar';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
setWorkerUrl(`${basePath}/maplibre-gl-worker.mjs`);

export interface MapControllerCallbacks {
  onLocationClick: (loc: LocationItem) => void;
  onMapClickCoord: (lat: number, lng: number) => void;
  onCameraChange?: (center: [number, number], zoom: number) => void;
}

export interface MapInitialView {
  center?: [number, number] | null;
  zoom?: number | null;
  world?: WorldType;
}

export const WORLD_VIEWPORTS: Record<WorldType, { center: [number, number]; zoom: number }> = {
  sky: { center: [-0.692, 1.036], zoom: 12 },
  surface: { center: [-0.692, 0.702], zoom: 12 },
  depths: { center: [-0.692, 0.375], zoom: 12 },
};

export const WORLD_LAT_OFFSETS: Record<WorldType, number> = {
  sky: 0.3430,
  surface: 0,
  depths: -0.3239,
};

const MARKERS_SOURCE_ID = 'totk-markers-source';
const MARKERS_LAYER_ID = 'totk-markers-symbol';
const RADAR_SOURCE_ID = 'totk-radar-source';
const RADAR_FILL_LAYER_ID = 'totk-radar-fill';
const RADAR_LINE_LAYER_ID = 'totk-radar-line';
const PLAYER_SOURCE_ID = 'totk-player-source';
const PLAYER_LAYER_ID = 'totk-player-marker';

export class MapController {
  private map: MapLibreMap | null = null;
  private locationsMap: Map<number, LocationItem> = new Map();
  private isLoaded = false;
  private currentWorld: WorldType = 'surface';

  init(
    containerId: string,
    callbacks: MapControllerCallbacks,
    initialView?: MapInitialView
  ): Promise<void> {
    const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
    this.currentWorld = initialView?.world ?? 'surface';
    const defaultViewport = WORLD_VIEWPORTS[this.currentWorld];

    const initialCenter =
      initialView?.center &&
      Number.isFinite(initialView.center[0]) &&
      Number.isFinite(initialView.center[1])
        ? initialView.center
        : defaultViewport.center;

    const initialZoom =
      initialView?.zoom != null && Number.isFinite(initialView.zoom)
        ? initialView.zoom
        : defaultViewport.zoom;

    return new Promise((resolve) => {
      // MapLibre configuration for custom non-Mercator Hyrule raster tiles
      this.map = new MapLibreMap({
        container: containerId,
        style: {
          version: 8,
          // Sprite atlas registered from public/ (MapLibre automatically appends @2x.json/png on retina or .json/.png)
          sprite: window.location.origin + basePath + '/markers',
          sources: {
            'hyrule-tiles': {
              type: 'raster',
              tiles: [window.location.origin + basePath + '/tiles/{z}/{x}/{y}.jpg'],
              tileSize: 256,
              minzoom: 9,
              maxzoom: 15,
            },
          },
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: {
                'background-color': '#0a0f14',
              },
            },
            {
              id: 'hyrule-raster-layer',
              type: 'raster',
              source: 'hyrule-tiles',
              paint: {
                'raster-opacity': 1,
                'raster-fade-duration': 150,
              },
            },
          ],
        },
        center: initialCenter,
        zoom: initialZoom,
        minZoom: 9,
        maxZoom: 18,
        dragRotate: false,
        touchPitch: false,
        attributionControl: false,
      });

      this.map?.on('load', () => {
        this.isLoaded = true;
        this.setupLayers(callbacks);
        resolve();
      });
    });
  }

  private setupLayers(callbacks: MapControllerCallbacks): void {
    if (!this.map) return;

    // 1. Radar circles source & layers
    this.map.addSource(RADAR_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    this.map.addLayer({
      id: RADAR_FILL_LAYER_ID,
      type: 'fill',
      source: RADAR_SOURCE_ID,
      paint: {
        'fill-color': '#38e1ff',
        'fill-opacity': 0.15,
      },
    });

    this.map.addLayer({
      id: RADAR_LINE_LAYER_ID,
      type: 'line',
      source: RADAR_SOURCE_ID,
      paint: {
        'line-color': '#38e1ff',
        'line-width': 2,
        'line-dasharray': [3, 2],
        'line-opacity': 0.8,
      },
    });

    // 2. Player Anchor Marker Source & Layer
    this.map.addSource(PLAYER_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    this.map.addLayer({
      id: PLAYER_LAYER_ID,
      type: 'circle',
      source: PLAYER_SOURCE_ID,
      paint: {
        'circle-radius': 9,
        'circle-color': '#27e3a2',
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffffff',
      },
    });

    // 3. Markers Source
    this.map.addSource(MARKERS_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    // 4. WebGL Symbol Layer for all markers
    this.map.addLayer({
      id: MARKERS_LAYER_ID,
      type: 'symbol',
      source: MARKERS_SOURCE_ID,
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-size': 0.55,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-anchor': 'bottom',
      },
      paint: {
        'icon-opacity': [
          'case',
          ['boolean', ['get', 'isCompleted'], false],
          ['get', 'completedOpacity'],
          1.0,
        ],
      },
    });

    // Mouse & Touch Interaction
    this.map.on('click', MARKERS_LAYER_ID, (e) => {
      if (!e.features || e.features.length === 0) return;
      const feat = e.features[0];
      const id = feat.properties?.id;
      if (id && this.locationsMap.has(id)) {
        callbacks.onLocationClick(this.locationsMap.get(id)!);
      }
    });

    this.map.on('mouseenter', MARKERS_LAYER_ID, () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });

    this.map.on('mouseleave', MARKERS_LAYER_ID, () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
    });

    // Map click for setting player anchor
    this.map.on('click', (e) => {
      // Check if we hit a marker
      if (!this.map) return;
      const features = this.map.queryRenderedFeatures(e.point, { layers: [MARKERS_LAYER_ID] });
      if (features.length === 0) {
        callbacks.onMapClickCoord(e.lngLat.lat, e.lngLat.lng);
      }
    });

    // Camera movement tracking with 300ms debounce
    let moveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    this.map.on('moveend', () => {
      if (!callbacks.onCameraChange || !this.map) return;
      if (moveDebounceTimer) clearTimeout(moveDebounceTimer);
      moveDebounceTimer = setTimeout(() => {
        if (!this.map || !callbacks.onCameraChange) return;
        const c = this.map.getCenter();
        const z = this.map.getZoom();
        if (c && Number.isFinite(c.lng) && Number.isFinite(c.lat) && Number.isFinite(z)) {
          callbacks.onCameraChange([c.lng, c.lat], z);
        }
      }, 300);
    });
  }

  setLocations(locations: LocationItem[]): void {
    this.locationsMap.clear();
    for (const loc of locations) {
      this.locationsMap.set(loc.id, loc);
    }
  }

  renderMarkers(
    locations: LocationItem[],
    completedSet: Set<number>,
    playerState: PlayerState
  ): void {
    if (!this.map || !this.isLoaded) return;
    this.currentWorld = playerState.world;

    const completedOpacity = playerState.dimCompleted ? 0.35 : 1.0;
    const activeCatSet = new Set(playerState.activeCategories);

    const features: Feature<Point>[] = [];

    for (const loc of locations) {
      // Filter by active world
      if (loc.world !== playerState.world) continue;

      // Filter by category: only show if category is enabled in activeCategories
      if (!activeCatSet.has(loc.category_id)) continue;

      const isDone = completedSet.has(loc.id);

      // Filter by completed status
      if (playerState.hideCompleted && isDone) continue;

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [loc.lng, loc.lat],
        },
        properties: {
          id: loc.id,
          icon: loc.icon || 'point_of_interest',
          isCompleted: isDone,
          completedOpacity,
        },
      });
    }

    const geojson: FeatureCollection<Point> = {
      type: 'FeatureCollection',
      features,
    };

    const source = this.map.getSource(MARKERS_SOURCE_ID) as GeoJSONSource | undefined;
    if (source) {
      source.setData(geojson);
    }
  }

  updatePlayerAndRadar(playerState: PlayerState): void {
    if (!this.map || !this.isLoaded) return;

    // 1. Update Player Marker
    const playerSource = this.map.getSource(PLAYER_SOURCE_ID) as GeoJSONSource | undefined;
    if (playerSource) {
      if (playerState.lat != null && playerState.lng != null && playerState.world === this.currentWorld) {
        playerSource.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [playerState.lng, playerState.lat],
              },
              properties: {},
            },
          ],
        });
      } else {
        playerSource.setData({ type: 'FeatureCollection', features: [] });
      }
    }

    // 2. Update Radar Circle
    const radarSource = this.map.getSource(RADAR_SOURCE_ID) as GeoJSONSource | undefined;
    if (radarSource) {
      if (
        playerState.lat != null &&
        playerState.lng != null &&
        playerState.radarRadiusMeters > 0 &&
        playerState.world === this.currentWorld
      ) {
        const radarGeo = createRadarGeoJSON(playerState.lat, playerState.lng, playerState.radarRadiusMeters);
        radarSource.setData(radarGeo);
      } else {
        radarSource.setData({ type: 'FeatureCollection', features: [] });
      }
    }
  }

  switchWorld(world: WorldType): void {
    if (!this.map) return;
    const oldWorld = this.currentWorld;
    this.currentWorld = world;

    if (oldWorld === world) return;

    const center = this.map.getCenter();
    const currentZoom = this.map.getZoom();
    const latDiff = WORLD_LAT_OFFSETS[world] - WORLD_LAT_OFFSETS[oldWorld];
    const targetLat = center ? center.lat + latDiff : WORLD_VIEWPORTS[world].center[1];
    const targetLng = center ? center.lng : WORLD_VIEWPORTS[world].center[0];

    const isValidCoord = Number.isFinite(targetLat) && Number.isFinite(targetLng);
    const targetCenter: [number, number] = isValidCoord
      ? [targetLng, targetLat]
      : WORLD_VIEWPORTS[world].center;
    const targetZoom = Number.isFinite(currentZoom) ? currentZoom : WORLD_VIEWPORTS[world].zoom;

    this.map.easeTo({
      center: targetCenter,
      zoom: targetZoom,
      duration: 600,
    });
  }

  flyToLocation(lat: number, lng: number, zoom = 15): void {
    if (!this.map) return;
    this.map.flyTo({
      center: [lng, lat],
      zoom,
      duration: 800,
    });
  }

  getMap(): MapLibreMap | null {
    return this.map;
  }
}

export const mapController = new MapController();
