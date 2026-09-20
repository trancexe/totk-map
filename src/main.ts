import './style.css';
import type { MapData, LocationItem, WorldType, PlayerState } from './types';
import { storage } from './storage/db';
import { searchIndex } from './search/search';
import { mapController } from './map/mapController';
import { UIController } from './ui/uiController';

class App {
  private locations: LocationItem[] = [];
  private ui!: UIController;
  private isAnchorMode = false;

  async init() {
    const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

    // Register Service Worker for offline capability
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register(`${basePath}/sw.js`, { scope: `${basePath}/` })
          .then((reg) => console.log('[SW] Registered successfully:', reg.scope))
          .catch((err) => console.warn('[SW] Registration failed:', err));
      });
    }

    // 1. Initialize IndexedDB storage
    await storage.init();

    // 2. Fetch master data
    const res = await fetch(`${basePath}/totk_data.json`);
    const data: MapData = await res.json();

    // Region lookup map for quick parent world resolution
    const regionParentMap = new Map<number, number>();
    for (const r of data.regions) {
      regionParentMap.set(r.id, r.parent_region_id ?? r.id);
    }

    // Map raw compact locations to structured items
    this.locations = data.locations.map((raw) => {
      const [id, category_id, region_id, lat, lng, title, description, media, ign_page_id] = raw;
      const cat = data.categories[category_id];

      // Determine world: parent region 1783 = Sky, 1785 = Depths, 1784 = Surface
      const parentId = regionParentMap.get(region_id);
      let world: WorldType = 'surface';
      if (parentId === 1783) world = 'sky';
      else if (parentId === 1785) world = 'depths';

      return {
        id,
        category_id,
        region_id,
        lat,
        lng,
        title,
        description,
        media: media || undefined,
        ign_page_id: ign_page_id || undefined,
        world,
        group_id: cat ? cat.group_id : 0,
        icon: cat ? cat.icon : 'point_of_interest',
        categoryTitle: cat ? cat.title : 'Unknown',
      };
    });

    // Feed search index
    searchIndex.setLocations(this.locations);
    mapController.setLocations(this.locations);

    // 3. Initialize Map
    const savedState = storage.getPlayerState();
    await mapController.init(
      'map',
      {
        onLocationClick: (loc) => {
          this.ui.showLocationDetail(loc);
        },
        onMapClickCoord: (lat, lng) => {
          if (this.isAnchorMode) {
            this.setPlayerAnchor(lat, lng);
          }
        },
        onCameraChange: (center, zoom) => {
          storage.updatePlayerState({ mapCenter: center, mapZoom: zoom }, false);
        },
      },
      {
        center: savedState.mapCenter,
        zoom: savedState.mapZoom,
        world: savedState.world,
      }
    );

    // 4. Initialize UI
    this.ui = new UIController('app', {
      onWorldChange: async (world) => {
        mapController.switchWorld(world);
        await storage.updatePlayerState({ world });
        this.syncMapVisuals();
        this.ui.render();
      },
      onSelectLocation: (loc) => {
        if (mapController.getCurrentWorld() !== loc.world) {
          mapController.switchWorld(loc.world);
          storage.updatePlayerState({ world: loc.world });
        }
        mapController.flyToLocation(loc.lat, loc.lng);
        this.ui.showLocationDetail(loc);
        this.syncMapVisuals();
      },
      onToggleCompleted: async (id) => {
        await storage.toggleCompleted(id);
        this.syncMapVisuals();
        this.ui.render();
      },
      onSetPlayerAnchorMode: (active) => {
        this.isAnchorMode = active;
        this.ui.setAnchorMode(active);
      },
      onPlayerStateChange: async (partial: Partial<PlayerState>) => {
        await storage.updatePlayerState(partial);
        this.syncMapVisuals();
        this.ui.render();
      },
      onClearAnchor: async () => {
        await storage.updatePlayerState({ lat: null, lng: null });
        this.isAnchorMode = false;
        this.syncMapVisuals();
        this.ui.render();
      },
    });

    this.ui.setData(this.locations, data.groups, data.categories);

    // Initial render & category setup: if fresh state, enable all categories by default
    const allCatIds = Object.keys(data.categories).map(Number);
    if (storage.isFresh()) {
      await storage.updatePlayerState({ activeCategories: allCatIds });
    }

    this.syncMapVisuals();
    this.ui.render();

    // Re-render when storage state changes
    storage.subscribe(() => {
      this.syncMapVisuals();
      this.ui.render();
    });
  }

  private async setPlayerAnchor(lat: number, lng: number) {
    const currentState = storage.getPlayerState();
    await storage.updatePlayerState({
      lat,
      lng,
      // Default to 1000m radar when anchor is first set if radar was 0
      radarRadiusMeters: currentState.radarRadiusMeters === 0 ? 1000 : currentState.radarRadiusMeters,
    });
    this.isAnchorMode = false;
    this.ui.setAnchorMode(false);
    this.syncMapVisuals();
  }

  private syncMapVisuals() {
    const state = storage.getPlayerState();
    const completedSet = storage.getCompletedSet();
    mapController.renderMarkers(this.locations, completedSet, state);
    mapController.updatePlayerAndRadar(state);
  }
}

// Boot application
const app = new App();
app.init().catch(console.error);
