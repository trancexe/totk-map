import type { WorldType, PlayerState, LocationItem, Group, Category } from '../types';
import { formatDistance, getLocationsInRadius } from '../spatial/radar';
import { searchIndex } from '../search/search';
import { storage } from '../storage/db';

export interface UIEvents {
  onWorldChange: (world: WorldType) => void;
  onSelectLocation: (loc: LocationItem) => void;
  onToggleCompleted: (id: number) => void;
  onSetPlayerAnchorMode: (active: boolean) => void;
  onPlayerStateChange: (partial: Partial<PlayerState>) => void;
  onClearAnchor: () => void;
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export class UIController {
  private appContainer: HTMLElement;
  private events: UIEvents;
  private locations: LocationItem[] = [];
  private groups: Group[] = [];
  private categories: Record<string, Category> = {};
  private activeTab: 'radar' | 'categories' | 'guides' | 'stats' = 'radar';
  private activeGuideSection: 'checklist' | 'armor' | 'sages' | 'dragons' | 'minibosses' | 'memories' = 'checklist';
  private guideSearchQuery = '';
  private guidesCache: Record<string, any> = {};
  private bottomSheetState: 'hidden' | 'lite' | 'full' = 'lite';
  private isAnchorMode = false;

  // Offline tile cache state
  private cachedTileCount = 0;
  private isDownloadingTiles = false;
  private downloadProgress = { current: 0, total: 0 };

  // Modals / Cards
  private activeLocationModal: LocationItem | null = null;
  private searchModalOpen = false;
  private currentSearchQuery = '';

  constructor(containerId: string, events: UIEvents) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Element #${containerId} not found`);
    this.appContainer = el;
    this.events = events;
    this.refreshCachedTileCount();
  }

  setData(locations: LocationItem[], groups: Group[], categories: Record<string, Category>): void {
    this.locations = locations;
    this.groups = groups;
    this.categories = categories;
  }

  setAnchorMode(active: boolean): void {
    this.isAnchorMode = active;
    this.render();
  }

  showLocationDetail(loc: LocationItem): void {
    this.activeLocationModal = loc;
    this.render();
  }

  closeLocationDetail(): void {
    this.activeLocationModal = null;
    this.render();
  }

  render(): void {
    const state = storage.getPlayerState();
    const completedSet = storage.getCompletedSet();
    const completedCount = completedSet.size;
    const totalCount = this.locations.length;
    const progressPercent = Math.round((completedCount / (totalCount || 1)) * 100);

    // Filter nearby if anchor is set
    const nearbyLocations = state.lat != null && state.lng != null && state.radarRadiusMeters > 0
      ? getLocationsInRadius(
          this.locations,
          state.lat,
          state.lng,
          state.radarRadiusMeters,
          state.world,
          completedSet,
          state.hideCompleted
        )
      : [];

    this.appContainer.innerHTML = `
      <!-- TOP HEADER & CONTROLS -->
      <div class="pointer-events-auto absolute top-3 left-3 right-3 flex items-center justify-between gap-2 z-20">
        <!-- Brand & Progress Pill -->
        <div class="glass-panel px-3 py-2 rounded-xl flex items-center gap-2.5 shadow-lg border border-totk-gold/30">
          <div class="w-2.5 h-2.5 rounded-full ${this.isAnchorMode ? 'bg-totk-green animate-ping' : 'bg-totk-gold'}"></div>
          <div>
            <div class="text-xs font-bold tracking-wider text-totk-gold uppercase">TOTK Map</div>
            <div class="text-[10px] text-slate-400 leading-tight">
              ${completedCount} / ${totalCount} (${progressPercent}%)
            </div>
          </div>
        </div>

        <!-- Quick Action Buttons -->
        <div class="flex items-center gap-1.5">
          <!-- Search Button -->
          <button id="btn-search" class="glass-panel p-2.5 rounded-xl hover:bg-slate-700/60 active:scale-95 transition flex items-center justify-center text-slate-200 shadow-md">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </button>

          <!-- Set Anchor (Link's Position) -->
          <button id="btn-anchor" class="glass-panel px-3 py-2 rounded-xl flex items-center gap-1.5 text-xs font-medium ${
            this.isAnchorMode
              ? 'bg-totk-green/30 text-totk-green border-totk-green shadow-[0_0_15px_rgba(39,227,162,0.4)]'
              : state.lat != null
              ? 'text-totk-cyan border-totk-cyan/30'
              : 'text-slate-300'
          } active:scale-95 transition shadow-md">
            <span>📍</span>
            <span class="hidden sm:inline">${this.isAnchorMode ? 'Tap Map...' : state.lat != null ? 'Anchor Set' : 'Set Link'}</span>
          </button>

          <!-- Clear Anchor -->
          ${
            state.lat != null
              ? `<button id="btn-clear-anchor" class="glass-panel p-2 rounded-xl text-slate-400 hover:text-rose-400 text-xs transition" title="Clear Anchor">✕</button>`
              : ''
          }
        </div>
      </div>

      <!-- WORLD SWITCHER (FLOATING BOTTOM-RIGHT) -->
      <div class="pointer-events-auto absolute right-3 ${
        this.bottomSheetState === 'hidden' ? 'bottom-4' : 'bottom-24'
      } z-20 flex flex-col gap-1.5 glass-panel p-1.5 rounded-2xl shadow-xl border border-white/10 transition-all duration-300">
        <button data-world="sky" class="world-btn px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
          state.world === 'sky'
            ? 'bg-totk-sky text-slate-900 shadow-md scale-105'
            : 'text-slate-400 hover:text-white'
        }">
          <span>☁️</span> <span class="hidden sm:inline">Sky</span>
        </button>
        <button data-world="surface" class="world-btn px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
          state.world === 'surface'
            ? 'bg-totk-green text-slate-900 shadow-md scale-105'
            : 'text-slate-400 hover:text-white'
        }">
          <span>🌿</span> <span class="hidden sm:inline">Surface</span>
        </button>
        <button data-world="depths" class="world-btn px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
          state.world === 'depths'
            ? 'bg-totk-depths text-white shadow-md scale-105'
            : 'text-slate-400 hover:text-white'
        }">
          <span>🌌</span> <span class="hidden sm:inline">Depths</span>
        </button>
      </div>

      <!-- FLOATING THUMB BAR (VISIBLE WHEN BOTTOM SHEET IS HIDDEN) -->
      ${
        this.bottomSheetState === 'hidden'
          ? `
            <div class="pointer-events-auto absolute left-3 bottom-4 z-20 flex items-center gap-2 animate-fade-in">
              <button id="btn-show-bottom-sheet" class="glass-panel px-3.5 py-2.5 rounded-xl flex items-center gap-2 text-xs font-bold text-totk-gold border border-totk-gold/40 shadow-2xl active:scale-95 transition">
                <span>📑</span>
                <span>Menu</span>
              </button>
              <button id="btn-float-search" class="glass-panel px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 text-xs font-bold text-slate-200 border border-white/10 shadow-2xl active:scale-95 transition">
                <span>🔍</span>
                <span>Search</span>
              </button>
            </div>
          `
          : ''
      }

      <!-- MOBILE BOTTOM SHEET (3-state: hidden, lite, full) -->
      <div id="bottom-sheet" class="pointer-events-auto absolute left-0 right-0 bottom-0 z-30 transition-all duration-300 ease-out flex flex-col glass-panel rounded-t-2xl border-t border-totk-gold/40 shadow-2xl ${
        this.bottomSheetState === 'hidden'
          ? 'translate-y-[120%] pointer-events-none opacity-0'
          : this.bottomSheetState === 'lite'
          ? 'translate-y-0 h-auto pb-[max(env(safe-area-inset-bottom,0px),10px)]'
          : 'translate-y-0 h-[85vh] max-h-[85vh] pb-[max(env(safe-area-inset-bottom,0px),8px)]'
      }">
        <!-- Drawer Drag Handle -->
        <div id="sheet-handle" class="w-full pt-2 pb-1.5 flex flex-col items-center cursor-pointer touch-none shrink-0" title="Tap to Toggle Height">
          <div class="w-10 h-1 bg-slate-500/50 hover:bg-totk-gold/70 rounded-full transition"></div>
        </div>

        <!-- Header Navigation Bar / Tabs -->
        <div class="flex items-center justify-between px-3 pb-2 text-xs font-semibold shrink-0 gap-1.5 overflow-x-auto scrollbar-none w-full ${
          this.bottomSheetState === 'lite' ? '' : 'border-b border-white/10'
        }">
          <div class="flex items-center gap-1.5 shrink-0 flex-1 overflow-x-auto scrollbar-none py-0.5">
            <!-- Thumb-Zone Quick Search Button -->
            <button id="btn-bottom-search" class="px-3 py-2 rounded-xl transition flex items-center gap-1.5 shrink-0 bg-totk-gold/20 text-totk-gold border border-totk-gold/40 hover:bg-totk-gold/30 font-bold shadow-sm" title="Search Map">
              <span>🔍</span>
              <span>Search</span>
            </button>

            <button data-tab="radar" class="tab-btn px-3 py-2 rounded-xl transition flex items-center gap-1.5 shrink-0 ${
              this.activeTab === 'radar' ? 'bg-totk-gold text-slate-900 font-bold shadow-sm' : 'text-slate-300 hover:text-white bg-slate-800/60'
            }">
              <span>🎯</span>
              <span>Radar (${nearbyLocations.length})</span>
            </button>
            <button data-tab="categories" class="tab-btn px-3 py-2 rounded-xl transition flex items-center gap-1.5 shrink-0 ${
              this.activeTab === 'categories' ? 'bg-totk-gold text-slate-900 font-bold shadow-sm' : 'text-slate-300 hover:text-white bg-slate-800/60'
            }">
              <span>📑</span>
              <span>Categories</span>
            </button>
            <button data-tab="guides" class="tab-btn px-3 py-2 rounded-xl transition flex items-center gap-1.5 shrink-0 ${
              this.activeTab === 'guides' ? 'bg-totk-gold text-slate-900 font-bold shadow-sm' : 'text-slate-300 hover:text-white bg-slate-800/60'
            }">
              <span>🧭</span>
              <span>Guides & 100%</span>
            </button>
            <button data-tab="stats" class="tab-btn px-3 py-2 rounded-xl transition flex items-center gap-1.5 shrink-0 ${
              this.activeTab === 'stats' ? 'bg-totk-gold text-slate-900 font-bold shadow-sm' : 'text-slate-300 hover:text-white bg-slate-800/60'
            }">
              <span>📊</span>
              <span>Stats</span>
            </button>
          </div>

          <!-- Drawer Height Toggle Button -->
          <button id="btn-toggle-sheet" class="text-slate-300 hover:text-white p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 transition text-xs font-bold shrink-0 ml-1.5 flex items-center gap-1" title="${
            this.bottomSheetState === 'lite' ? 'Expand Drawer' : 'Collapse Drawer'
          }">
            <span>${this.bottomSheetState === 'lite' ? '▲' : '▼'}</span>
          </button>

          <!-- Drawer Hide / Minimize Button -->
          <button id="btn-hide-sheet" class="text-slate-400 hover:text-rose-300 p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 transition text-xs font-bold shrink-0 ml-1 flex items-center gap-1" title="Hide Menu (Minimize)">
            <span>✕</span>
          </button>
        </div>

        <!-- Tab Content Area (Hidden completely in lite mode so it never steals height or squashes the tabs!) -->
        <div class="${this.bottomSheetState === 'lite' ? 'hidden' : 'flex-1 overflow-y-auto p-4 space-y-3'}">
          ${this.bottomSheetState === 'lite' ? '' : this.renderActiveTabContent(state, completedSet, nearbyLocations)}
        </div>
      </div>

      <!-- SEARCH MODAL -->
      ${this.renderSearchModal()}

      <!-- LOCATION DETAIL MODAL -->
      ${this.renderLocationModal(completedSet)}
    `;

    this.bindEvents();
  }

  private renderActiveTabContent(
    state: PlayerState,
    completedSet: Set<number>,
    nearbyLocations: { location: LocationItem; distance: number }[]
  ): string {
    if (this.activeTab === 'radar') {
      return `
        <!-- Radar Radius Slider & Controls -->
        <div class="glass-card p-3 rounded-xl flex flex-col gap-2">
          <div class="flex items-center justify-between text-xs">
            <span class="text-slate-300 font-medium">Radar Proximity</span>
            <span class="text-totk-cyan font-bold">${state.radarRadiusMeters === 0 ? 'Disabled' : `${state.radarRadiusMeters}m`}</span>
          </div>
          <input
            id="radar-slider"
            type="range"
            min="0"
            max="5000"
            step="250"
            value="${state.radarRadiusMeters}"
            class="w-full accent-totk-cyan cursor-pointer h-2 bg-slate-700 rounded-lg"
          />
          <div class="flex justify-between text-[10px] text-slate-400">
            <span>Off</span>
            <span>500m</span>
            <span>1km</span>
            <span>2.5km</span>
            <span>5km</span>
          </div>
        </div>

        <!-- Display Toggles -->
        <div class="flex items-center justify-between gap-2 text-xs">
          <label class="flex items-center gap-2 cursor-pointer text-slate-300">
            <input type="checkbox" id="toggle-hide-done" ${state.hideCompleted ? 'checked' : ''} class="rounded accent-totk-gold" />
            <span>Hide Completed</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer text-slate-300">
            <input type="checkbox" id="toggle-dim-done" ${state.dimCompleted ? 'checked' : ''} class="rounded accent-totk-gold" />
            <span>Dim Completed</span>
          </label>
        </div>

        <!-- Nearby Location List -->
        <div class="space-y-2 mt-2">
          ${
            state.lat == null
              ? `<div class="text-center py-6 text-slate-400 text-xs">
                  <div class="text-2xl mb-1">📍</div>
                  Tap <strong>"Set Link"</strong> and tap anywhere on Hyrule to activate radar tracking.
                </div>`
              : state.radarRadiusMeters === 0
              ? `<div class="text-center py-6 text-slate-400 text-xs">
                  Increase radar proximity above to detect points of interest nearby.
                </div>`
              : nearbyLocations.length === 0
              ? `<div class="text-center py-6 text-slate-400 text-xs">
                  No points of interest within ${state.radarRadiusMeters}m in the ${state.world} world.
                </div>`
              : nearbyLocations.slice(0, 40).map(({ location: loc, distance }) => {
                  const isDone = completedSet.has(loc.id);
                  return `
                    <div class="location-row glass-card p-2.5 rounded-xl flex items-center justify-between gap-3 hover:border-totk-gold/40 transition cursor-pointer ${
                      isDone ? 'opacity-50' : ''
                    }" data-loc-id="${loc.id}">
                      <div class="flex items-center gap-2.5 min-w-0">
                        <span class="text-xs text-totk-cyan font-semibold shrink-0">${formatDistance(distance)}</span>
                        <div class="min-w-0">
                          <div class="text-xs font-semibold text-slate-100 truncate">${loc.title}</div>
                          <div class="text-[10px] text-slate-400 truncate">${loc.categoryTitle}</div>
                        </div>
                      </div>
                      <button class="toggle-done-btn p-1.5 rounded-lg text-xs ${
                        isDone ? 'bg-totk-green text-slate-900 font-bold' : 'bg-slate-700 text-slate-300'
                      }" data-id="${loc.id}">
                        ${isDone ? '✓' : '○'}
                      </button>
                    </div>
                  `;
                }).join('')
          }
        </div>
      `;
    }

    if (this.activeTab === 'categories') {
      const activeCatSet = new Set(state.activeCategories);
      const totalCats = Object.keys(this.categories).length;
      const activeCount = activeCatSet.size;

      return `
        <!-- Filter Controls (MapGenie Style: Hide All / Show All) -->
        <div class="flex items-center justify-between pb-2 border-b border-white/10 text-xs">
          <span class="text-slate-300 font-medium">
            ${
              activeCount === totalCats
                ? 'All Categories Visible'
                : activeCount === 0
                ? '0 Categories Visible (Map Cleared)'
                : `${activeCount} / ${totalCats} Categories Visible`
            }
          </span>
          <div class="flex items-center gap-2">
            <button id="btn-show-all-categories" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-totk-gold text-[11px] font-semibold transition active:scale-95">
              Show All
            </button>
            <button id="btn-hide-all-categories" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-[11px] font-semibold transition active:scale-95">
              Hide All
            </button>
          </div>
        </div>

        <div class="space-y-4">
          ${this.groups.map((grp) => `
            <div>
              <div class="text-xs font-bold text-totk-gold mb-2 uppercase tracking-wide flex items-center justify-between">
                <span>${grp.title}</span>
                <div class="flex items-center gap-1">
                  <button class="grp-toggle-all text-[10px] text-slate-400 hover:text-totk-gold px-1.5 py-0.5 rounded bg-slate-800/80 active:scale-95" data-group-id="${grp.id}">All</button>
                  <button class="grp-toggle-none text-[10px] text-slate-400 hover:text-rose-400 px-1.5 py-0.5 rounded bg-slate-800/80 active:scale-95" data-group-id="${grp.id}">None</button>
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                ${grp.categories.map((cat) => {
                  const isChecked = activeCatSet.has(cat.id);
                  return `
                    <label class="glass-card p-2 rounded-lg flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-800 transition text-xs select-none ${
                      isChecked ? 'border-totk-gold/30 bg-slate-800/40' : 'opacity-60'
                    }">
                      <div class="flex items-center gap-2 truncate">
                        <input
                          type="checkbox"
                          class="category-checkbox accent-totk-gold rounded w-4 h-4 cursor-pointer"
                          data-cat-id="${cat.id}"
                          ${isChecked ? 'checked' : ''}
                        />
                        <span class="truncate ${isChecked ? 'text-slate-100 font-medium' : 'text-slate-400'}">${cat.title}</span>
                      </div>
                      <span class="text-[10px] text-slate-400 shrink-0 font-mono">${cat.locations_count}</span>
                    </label>
                  `;
                }).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    if (this.activeTab === 'guides') {
      return this.renderGuidesTabContent(completedSet);
    }

    // Stats tab
    const shrinesDone = this.countCategoryProgress(8980, completedSet);
    const lightrootsDone = this.countCategoryProgress(9049, completedSet);
    const koroksDone = this.countCategoryProgress(9034, completedSet);
    const bubbulDone = this.countCategoryProgress(9051, completedSet);
    const towersDone = this.countCategoryProgress(8979, completedSet);

    return `
      <div class="space-y-3 text-xs">
        <div class="glass-card p-3 rounded-xl space-y-2">
          <div class="font-bold text-totk-gold uppercase tracking-wider text-xs">Major Collectibles</div>
          ${this.renderProgressBar('Shrines', shrinesDone.done, shrinesDone.total)}
          ${this.renderProgressBar('Lightroots', lightrootsDone.done, lightrootsDone.total)}
          ${this.renderProgressBar('Skyview Towers', towersDone.done, towersDone.total)}
          ${this.renderProgressBar('Bubbulfrog', bubbulDone.done, bubbulDone.total)}
          ${this.renderProgressBar('Korok Seeds', koroksDone.done, koroksDone.total)}
        </div>

        <div class="glass-card p-3 rounded-xl space-y-2">
          <div class="font-bold text-slate-200 text-xs">Backup & Storage</div>
          <div class="text-[11px] text-slate-400">Export your unlimited checklist progress to JSON or import from another device.</div>
          <div class="flex gap-2 pt-1">
            <button id="btn-export-backup" class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs text-white font-medium transition">
              💾 Export JSON
            </button>
            <label class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs text-white font-medium transition cursor-pointer">
              📥 Import JSON
              <input type="file" id="file-import-backup" accept=".json" class="hidden" />
            </label>
            <button id="btn-reset-all" class="px-3 py-1.5 bg-rose-900/60 hover:bg-rose-800 rounded-lg text-xs text-rose-200 font-medium transition ml-auto">
              Reset
            </button>
          </div>
        </div>

        <!-- Offline PWA & Map Tiles Storage Card -->
        <div class="glass-card p-3 rounded-xl space-y-2 border border-totk-gold/30">
          <div class="flex items-center justify-between">
            <div class="font-bold text-totk-gold uppercase tracking-wider text-xs flex items-center gap-1.5">
              <span>📶</span> <span>Offline Map & PWA</span>
            </div>
            <span id="cached-tile-count-label" class="text-[10px] text-totk-cyan font-mono font-bold">
              ${this.cachedTileCount} / 545 tiles (${Math.min(100, Math.round((this.cachedTileCount / 545) * 100))}%)
            </span>
          </div>
          <div class="text-[11px] text-slate-400 leading-relaxed">
            Semua lokasi, panduan, dan checklist tersimpan di memori lokal. Unduh ubin peta untuk menjelajahi Hyrule (Sky, Surface, Depths) saat offline tanpa koneksi internet sama sekali!
          </div>

          ${
            this.isDownloadingTiles
              ? `
                <div class="space-y-1.5 pt-1 bg-slate-900/80 p-2.5 rounded-xl border border-totk-gold/30">
                  <div class="flex justify-between text-[11px] text-slate-200">
                    <span class="flex items-center gap-1.5">
                      <span class="animate-spin text-xs">⏳</span>
                      <span>Mengunduh peta offline...</span>
                    </span>
                    <span id="offline-download-progress-text" class="font-mono text-totk-gold font-bold">
                      ${this.downloadProgress.current} / ${this.downloadProgress.total} (${
                        this.downloadProgress.total > 0
                          ? Math.round((this.downloadProgress.current / this.downloadProgress.total) * 100)
                          : 0
                      }%)
                    </span>
                  </div>
                  <div class="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      id="offline-download-progress-bar"
                      class="bg-totk-green h-full rounded-full transition-all duration-150"
                      style="width: ${
                        this.downloadProgress.total > 0
                          ? Math.round((this.downloadProgress.current / this.downloadProgress.total) * 100)
                          : 0
                      }%"
                    ></div>
                  </div>
                </div>
              `
              : `
                <div class="flex gap-2 pt-1">
                  <button id="btn-download-offline-tiles" class="flex-1 px-3 py-2 bg-totk-gold/20 hover:bg-totk-gold/30 text-totk-gold border border-totk-gold/40 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 active:scale-95 shadow-sm">
                    <span>📥</span> <span>Unduh Peta Offline (z9-z13, ~5MB)</span>
                  </button>
                  <button id="btn-clear-offline-tiles" class="px-3 py-2 bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 rounded-xl text-xs transition active:scale-95 border border-white/5" title="Hapus Cache Peta">
                    <span>🗑️</span>
                  </button>
                </div>
              `
          }
        </div>
      </div>
    `;
  }

  private countCategoryProgress(categoryId: number, completedSet: Set<number>): { done: number; total: number } {
    let done = 0;
    let total = 0;
    for (const loc of this.locations) {
      if (loc.category_id === categoryId) {
        total++;
        if (completedSet.has(loc.id)) {
          done++;
        }
      }
    }
    return { done, total };
  }

  private renderProgressBar(label: string, done: number, total: number): string {
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return `
      <div>
        <div class="flex justify-between text-[11px] mb-1">
          <span class="text-slate-300">${label}</span>
          <span class="text-totk-gold font-bold font-mono">${done} / ${total} (${percent}%)</span>
        </div>
        <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
          <div class="bg-totk-gold h-full rounded-full transition-all duration-300" style="width: ${percent}%"></div>
        </div>
      </div>
    `;
  }

  public async refreshCachedTileCount(): Promise<void> {
    if (!('caches' in window)) return;
    try {
      const cache = await caches.open('totk-tiles-v1');
      const keys = await cache.keys();
      this.cachedTileCount = keys.length;
      const countEl = document.getElementById('cached-tile-count-label');
      if (countEl) {
        const totalOffline = 545;
        const pct = Math.min(100, Math.round((this.cachedTileCount / totalOffline) * 100));
        countEl.textContent = `${this.cachedTileCount} / ${totalOffline} tiles (${pct}%)`;
      }
    } catch {}
  }

  private generateOfflineTileUrls(): string[] {
    const minLat = 0.23;
    const maxLat = 1.19;
    const minLng = -1.05;
    const maxLng = -0.33;
    const urls: string[] = [];
    const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

    for (let z = 9; z <= 13; z++) {
      const n = Math.pow(2, z);
      const x1 = Math.floor(((minLng + 180) / 360) * n);
      const x2 = Math.floor(((maxLng + 180) / 360) * n);
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);

      const latRad1 = (maxLat * Math.PI) / 180;
      const y1 = Math.floor(((1 - Math.asinh(Math.tan(latRad1)) / Math.PI) / 2) * n);
      const latRad2 = (minLat * Math.PI) / 180;
      const y2 = Math.floor(((1 - Math.asinh(Math.tan(latRad2)) / Math.PI) / 2) * n);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);

      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          urls.push(`${basePath}/tiles/${z}/${x}/${y}.jpg`);
        }
      }
    }
    return urls;
  }

  private async startTileDownload(): Promise<void> {
    if (this.isDownloadingTiles) return;
    this.isDownloadingTiles = true;
    const urls = this.generateOfflineTileUrls();
    this.downloadProgress = { current: 0, total: urls.length };
    this.render();

    try {
      const cache = await caches.open('totk-tiles-v1');
      let completed = 0;
      const concurrency = 8;
      let index = 0;

      const worker = async () => {
        while (index < urls.length) {
          const i = index++;
          const u = urls[i];
          try {
            const match = await cache.match(u);
            if (!match) {
              const res = await fetch(u);
              if (res.ok) {
                await cache.put(u, res);
              }
            }
          } catch {}

          completed++;
          if (completed % 5 === 0 || completed === urls.length) {
            this.downloadProgress.current = completed;
            const progressEl = document.getElementById('offline-download-progress-bar');
            const textEl = document.getElementById('offline-download-progress-text');
            const countEl = document.getElementById('cached-tile-count-label');
            const pct = Math.round((completed / urls.length) * 100);
            if (progressEl) progressEl.style.width = `${pct}%`;
            if (textEl) textEl.textContent = `${completed} / ${urls.length} (${pct}%)`;
            if (countEl) countEl.textContent = `${completed} / ${urls.length} tiles (${pct}%)`;
          }
        }
      };

      const workers = Array.from({ length: concurrency }, () => worker());
      await Promise.all(workers);
    } finally {
      this.isDownloadingTiles = false;
      await this.refreshCachedTileCount();
      this.render();
    }
  }

  private async clearOfflineTileCache(): Promise<void> {
    if ('caches' in window) {
      await caches.delete('totk-tiles-v1');
      this.cachedTileCount = 0;
      this.render();
    }
  }

  private async loadGuideData(type: string): Promise<any> {
    if (this.guidesCache[type]) return this.guidesCache[type];
    const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
    try {
      const res = await fetch(`${basePath}/guides/${type}.json`);
      if (res.ok) {
        const data = await res.json();
        this.guidesCache[type] = data;
        return data;
      }
    } catch (e) {
      console.warn(`Failed to fetch guide: ${type}`, e);
    }
    return null;
  }

  private renderGuidesTabContent(completedSet: Set<number>): string {
    const sec = this.activeGuideSection;
    const q = this.guideSearchQuery.toLowerCase().trim();

    return `
      <div class="space-y-3 text-xs">
        <!-- Sub-nav pills -->
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button data-guide-sec="checklist" class="guide-sec-btn px-2.5 py-1 rounded-lg transition shrink-0 ${
            sec === 'checklist' ? 'bg-totk-gold text-slate-900 font-bold' : 'bg-slate-800 text-slate-300 hover:text-white'
          }">
            ✅ 100% Checklist
          </button>
          <button data-guide-sec="armor" class="guide-sec-btn px-2.5 py-1 rounded-lg transition shrink-0 ${
            sec === 'armor' ? 'bg-totk-gold text-slate-900 font-bold' : 'bg-slate-800 text-slate-300 hover:text-white'
          }">
            🛡️ Armor Sets
          </button>
          <button data-guide-sec="sages" class="guide-sec-btn px-2.5 py-1 rounded-lg transition shrink-0 ${
            sec === 'sages' ? 'bg-totk-gold text-slate-900 font-bold' : 'bg-slate-800 text-slate-300 hover:text-white'
          }">
            ✨ Sage's Will
          </button>
          <button data-guide-sec="dragons" class="guide-sec-btn px-2.5 py-1 rounded-lg transition shrink-0 ${
            sec === 'dragons' ? 'bg-totk-gold text-slate-900 font-bold' : 'bg-slate-800 text-slate-300 hover:text-white'
          }">
            🐉 Dragons
          </button>
          <button data-guide-sec="minibosses" class="guide-sec-btn px-2.5 py-1 rounded-lg transition shrink-0 ${
            sec === 'minibosses' ? 'bg-totk-gold text-slate-900 font-bold' : 'bg-slate-800 text-slate-300 hover:text-white'
          }">
            👹 Minibosses
          </button>
          <button data-guide-sec="memories" class="guide-sec-btn px-2.5 py-1 rounded-lg transition shrink-0 ${
            sec === 'memories' ? 'bg-totk-gold text-slate-900 font-bold' : 'bg-slate-800 text-slate-300 hover:text-white'
          }">
            🎬 Voice Memories
          </button>
        </div>

        <!-- Guide Search / Filter Bar -->
        <div class="relative">
          <input
            id="guide-filter-input"
            type="text"
            placeholder="Filter items in this guide..."
            value="${this.guideSearchQuery}"
            class="w-full bg-slate-900/80 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-totk-gold/50"
          />
          ${
            this.guideSearchQuery
              ? `<button id="btn-clear-guide-search" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs">✕</button>`
              : ''
          }
        </div>

        <!-- Dynamic Guide Content Body -->
        <div id="guide-content-body" class="space-y-2">
          ${this.renderSpecificGuideHtml(sec, completedSet, q)}
        </div>
      </div>
    `;
  }

  private renderSpecificGuideHtml(sec: string, completedSet: Set<number>, q: string): string {
    const cacheKey = sec === 'checklist' ? 'checklist_100' : sec === 'armor' ? 'armor_sets' : sec === 'sages' ? 'sages_will' : sec;
    const data = this.guidesCache[cacheKey];

    if (!data) {
      // Trigger lazy load
      this.loadGuideData(cacheKey).then(() => {
        const body = document.getElementById('guide-content-body');
        if (body) {
          body.innerHTML = this.renderSpecificGuideHtml(sec, completedSet, this.guideSearchQuery.toLowerCase().trim());
          this.bindGuideInteractions();
        }
      });
      return `<div class="py-8 text-center text-slate-400 text-xs animate-pulse">Loading ${sec} guide data...</div>`;
    }

    if (sec === 'checklist') {
      const items = data.items.filter((it: any) => !q || it.title.toLowerCase().includes(q) || it.category.toLowerCase().includes(q) || it.region.toLowerCase().includes(q));
      const doneCount = data.items.filter((it: any) => it.id && completedSet.has(it.id)).length;
      const totalCount = data.items.length;
      const pct = Math.round((doneCount / totalCount) * 100);

      return `
        <div class="glass-card p-3 rounded-xl mb-2 flex items-center justify-between">
          <div>
            <div class="font-bold text-totk-gold">Master 100% Completion Tracker</div>
            <div class="text-[10px] text-slate-400">All 2,279 key locations & collectibles in Hyrule</div>
          </div>
          <div class="text-right font-mono text-xs">
            <span class="text-totk-green font-bold">${doneCount}</span> / ${totalCount}
            <span class="text-totk-gold ml-1">(${pct}%)</span>
          </div>
        </div>

        <div class="space-y-1.5 max-h-[55vh] overflow-y-auto pr-1">
          ${items.slice(0, 100).map((it: any) => {
            const isDone = it.id && completedSet.has(it.id);
            return `
              <div class="glass-card p-2.5 rounded-xl flex items-center justify-between gap-2.5 hover:border-totk-gold/30 transition ${
                isDone ? 'opacity-50' : ''
              }">
                <div class="min-w-0 flex-1 guide-loc-click cursor-pointer" data-loc-id="${it.id || ''}">
                  <div class="font-semibold text-slate-200 truncate text-xs flex items-center gap-1.5">
                    <span>${it.title}</span>
                  </div>
                  <div class="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5 truncate">
                    <span class="px-1 py-0.5 rounded bg-slate-800 text-totk-cyan font-semibold text-[9px]">${it.category}</span>
                    <span>${it.region}</span>
                    ${it.info ? `<span class="text-slate-500 truncate">${it.info.slice(0, 50)}</span>` : ''}
                  </div>
                </div>
                ${
                  it.id
                    ? `
                      <button class="toggle-done-btn p-1.5 rounded-lg text-xs shrink-0 ${
                        isDone ? 'bg-totk-green text-slate-900 font-bold' : 'bg-slate-700 text-slate-300'
                      }" data-id="${it.id}">
                        ${isDone ? '✓' : '○'}
                      </button>
                    `
                    : ''
                }
              </div>
            `;
          }).join('')}
          ${items.length > 100 ? `<div class="text-center py-2 text-[11px] text-slate-500">Showing first 100 of ${items.length} items. Use filter bar above to narrow down.</div>` : ''}
        </div>
      `;
    }

    if (sec === 'armor') {
      const sets = data.sets;
      const setNames = Object.keys(sets).filter((s) => !q || s.toLowerCase().includes(q) || sets[s].some((p: any) => p.name.toLowerCase().includes(q)));

      return `
        <div class="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          ${setNames.map((sName) => {
            const pieces = sets[sName];
            const setDone = pieces.filter((p: any) => p.id && completedSet.has(p.id)).length;
            return `
              <div class="glass-card p-3 rounded-xl space-y-2">
                <div class="flex items-center justify-between">
                  <div class="font-bold text-totk-gold text-xs flex items-center gap-2">
                    <span>🛡️ ${sName} Set</span>
                    <span class="text-[10px] text-slate-400 font-normal">(${pieces.length} pieces)</span>
                  </div>
                  <span class="font-mono text-[10px] text-slate-300 ${setDone === pieces.length ? 'text-totk-green font-bold' : ''}">
                    ${setDone} / ${pieces.length}
                  </span>
                </div>
                <div class="space-y-1.5">
                  ${pieces.map((p: any) => {
                    const isDone = p.id && completedSet.has(p.id);
                    return `
                      <div class="glass-card p-2 rounded-lg flex items-center justify-between gap-2 text-xs hover:bg-slate-800 transition ${
                        isDone ? 'opacity-50' : ''
                      }">
                        <div class="min-w-0 flex-1 guide-loc-click cursor-pointer" data-loc-id="${p.id || ''}">
                          <div class="font-medium text-slate-200 truncate">${p.name}</div>
                          <div class="text-[10px] text-slate-400 truncate mt-0.5">
                            <span class="text-totk-cyan">${p.stats || 'Armor'}</span> · <span>${p.location}</span>
                          </div>
                        </div>
                        ${
                          p.id
                            ? `
                              <button class="toggle-done-btn p-1.5 rounded-lg text-xs shrink-0 ${
                                isDone ? 'bg-totk-green text-slate-900 font-bold' : 'bg-slate-700 text-slate-300'
                              }" data-id="${p.id}">
                                ${isDone ? '✓' : '○'}
                              </button>
                            `
                            : ''
                        }
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    if (sec === 'sages') {
      const items = (data as any[]).filter((it) => !q || it.title.toLowerCase().includes(q) || it.info.toLowerCase().includes(q) || it.region.toLowerCase().includes(q));
      return `
        <div class="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          ${items.map((it) => {
            const isDone = it.id && completedSet.has(it.id);
            return `
              <div class="glass-card p-3 rounded-xl flex items-center justify-between gap-3 hover:border-totk-gold/30 transition ${
                isDone ? 'opacity-50' : ''
              }">
                <div class="min-w-0 flex-1 guide-loc-click cursor-pointer" data-loc-id="${it.id || ''}">
                  <div class="font-bold text-slate-200 text-xs">${it.title}</div>
                  <div class="text-[10px] text-slate-300 mt-1 leading-relaxed">${it.info}</div>
                  <div class="text-[9px] text-totk-gold mt-1 uppercase font-bold tracking-wider">${it.region}</div>
                </div>
                ${
                  it.id
                    ? `
                      <button class="toggle-done-btn p-2 rounded-xl text-xs shrink-0 ${
                        isDone ? 'bg-totk-green text-slate-900 font-bold' : 'bg-slate-700 text-slate-300'
                      }" data-id="${it.id}">
                        ${isDone ? '✓' : '○'}
                      </button>
                    `
                    : ''
                }
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    if (sec === 'dragons') {
      const items = (data as any[]).filter((d) => !q || d.name.toLowerCase().includes(q) || d.info.toLowerCase().includes(q));
      return `
        <div class="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          ${items.map((d) => {
            return `
              <div class="glass-card p-3 rounded-xl space-y-2 border border-totk-cyan/30">
                <div class="flex items-center justify-between">
                  <div class="font-bold text-totk-cyan text-sm flex items-center gap-1.5">
                    <span>🐉</span>
                    <span>${d.name}</span>
                  </div>
                  <span class="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-totk-gold font-bold">${d.region}</span>
                </div>
                <div class="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-2.5 rounded-lg border border-white/5">
                  ${d.info}
                </div>
                <div class="flex gap-2 pt-1">
                  ${
                    d.id
                      ? `
                        <button class="guide-loc-click flex-1 py-1.5 bg-totk-gold text-slate-900 rounded-lg font-bold text-xs hover:bg-totk-gold/90 transition text-center" data-loc-id="${d.id}">
                          🔍 Show Route on Map
                        </button>
                      `
                      : ''
                  }
                  <a
                    href="https://www.youtube.com/results?search_query=Zelda+Tears+of+the+Kingdom+${encodeURIComponent(d.name)}+Route"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="py-1.5 px-3 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-xs flex items-center gap-1"
                  >
                    <span>▶ Video</span>
                  </a>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    if (sec === 'minibosses') {
      const items = (data as any[]).filter((b) => !q || b.name.toLowerCase().includes(q) || b.type.toLowerCase().includes(q) || b.region.toLowerCase().includes(q));
      return `
        <div class="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          ${items.slice(0, 80).map((b) => {
            const isDone = b.id && completedSet.has(b.id);
            return `
              <div class="glass-card p-2.5 rounded-xl flex items-center justify-between gap-3 hover:border-totk-gold/30 transition ${
                isDone ? 'opacity-50' : ''
              }">
                <div class="min-w-0 flex-1 guide-loc-click cursor-pointer" data-loc-id="${b.id || ''}">
                  <div class="font-bold text-slate-200 truncate text-xs">${b.name}</div>
                  <div class="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                    <span class="text-totk-gold font-semibold">${b.type}</span>
                    <span>${b.region}</span>
                  </div>
                </div>
                ${
                  b.id
                    ? `
                      <button class="toggle-done-btn p-1.5 rounded-lg text-xs shrink-0 ${
                        isDone ? 'bg-totk-green text-slate-900 font-bold' : 'bg-slate-700 text-slate-300'
                      }" data-id="${b.id}">
                        ${isDone ? '✓' : '○'}
                      </button>
                    `
                    : ''
                }
              </div>
            `;
          }).join('')}
          ${items.length > 80 ? `<div class="text-center py-2 text-[11px] text-slate-500">Showing 80 of ${items.length} bosses. Filter to view specific boss.</div>` : ''}
        </div>
      `;
    }

    if (sec === 'memories') {
      const items = (data as any[]).filter((m) => !q || m.name.toLowerCase().includes(q) || m.info.toLowerCase().includes(q) || m.region.toLowerCase().includes(q));
      return `
        <div class="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          ${items.map((m) => {
            const isDone = m.id && completedSet.has(m.id);
            return `
              <div class="glass-card p-2.5 rounded-xl flex items-center justify-between gap-3 hover:border-totk-gold/30 transition ${
                isDone ? 'opacity-50' : ''
              }">
                <div class="min-w-0 flex-1 guide-loc-click cursor-pointer" data-loc-id="${m.id || ''}">
                  <div class="font-bold text-slate-200 text-xs">${m.name}</div>
                  <div class="text-[10px] text-slate-400 mt-0.5">${m.info || m.region}</div>
                </div>
                ${
                  m.id
                    ? `
                      <button class="toggle-done-btn p-1.5 rounded-lg text-xs shrink-0 ${
                        isDone ? 'bg-totk-green text-slate-900 font-bold' : 'bg-slate-700 text-slate-300'
                      }" data-id="${m.id}">
                        ${isDone ? '✓' : '○'}
                      </button>
                    `
                    : ''
                }
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    return `<div class="py-4 text-center text-slate-400 text-xs">Section not found.</div>`;
  }

  private bindGuideInteractions(): void {
    // Click on guide item to fly to map & open detail
    this.appContainer.querySelectorAll('.guide-loc-click').forEach((el) => {
      el.addEventListener('click', (e) => {
        const id = Number((e.currentTarget as HTMLElement).dataset.locId);
        if (id) {
          const loc = this.locations.find((l) => l.id === id);
          if (loc) {
            this.bottomSheetState = 'lite';
            this.events.onSelectLocation(loc);
          }
        }
      });
    });

    // Toggle done buttons in guide lists
    this.appContainer.querySelectorAll('#guide-content-body .toggle-done-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number((e.currentTarget as HTMLElement).dataset.id);
        this.events.onToggleCompleted(id);
      });
    });
  }

  private bindSearchResultClickEvents(): void {
    const list = this.appContainer.querySelectorAll('.search-result-item');
    list.forEach((item) => {
      item.addEventListener('click', (e) => {
        const id = Number((e.currentTarget as HTMLElement).dataset.locId);
        const loc = this.locations.find((l) => l.id === id);
        if (loc) {
          this.searchModalOpen = false;
          this.currentSearchQuery = '';
          this.events.onSelectLocation(loc);
        }
      });
    });
  }

  private renderSearchModal(): string {
    if (!this.searchModalOpen) return '';

    return `
      <div class="pointer-events-auto fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col justify-end md:justify-center p-2 md:p-4 animate-fade-in">
        <div class="max-w-lg w-full mx-auto glass-panel rounded-2xl flex flex-col-reverse md:flex-col max-h-[85vh] md:max-h-[80vh] overflow-hidden border border-totk-gold/30 shadow-2xl">
          <!-- Search Bar: Pinned at BOTTOM on mobile (above virtual keyboard!), TOP on desktop -->
          <div class="p-3 border-t md:border-t-0 md:border-b border-white/10 flex items-center gap-2 bg-slate-900/95 md:bg-transparent pb-[max(env(safe-area-inset-bottom,0px),12px)] md:pb-3">
            <svg class="w-5 h-5 text-totk-gold shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              id="search-input"
              type="text"
              placeholder="Cari Shrine, Korok, Cave, Tower, Armor..."
              value="${this.currentSearchQuery}"
              class="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none py-1"
              autocomplete="off"
              autocorrect="off"
              spellcheck="false"
            />
            ${
              this.currentSearchQuery
                ? `<button id="btn-clear-search-text" class="p-1.5 text-slate-400 hover:text-white text-xs">✕</button>`
                : ''
            }
            <button id="btn-close-search" class="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-800 text-slate-300 hover:text-white border border-white/10 shrink-0">
              Tutup
            </button>
          </div>

          <!-- Search Results List (Only this div updates on input, preserving input focus & mobile keyboard!) -->
          <div id="search-results-list" class="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-[180px]">
            ${this.renderSearchResultsHtml()}
          </div>
        </div>
      </div>
    `;
  }

  private renderSearchResultsHtml(): string {
    const state = storage.getPlayerState();
    const q = escapeHTML(this.currentSearchQuery.trim());
    if (!q) {
      return `<div class="text-center py-8 text-slate-400 text-xs">Ketik nama Shrine, Korok, Cave, Tower, Armor...</div>`;
    }

    const results = searchIndex.search(q, {
      playerLat: state.lat,
      playerLng: state.lng,
      world: state.world,
      limit: 35,
    });

    if (results.length === 0) {
      return `<div class="text-center py-8 text-slate-400 text-xs">Tidak ditemukan lokasi dengan kata kunci "${q}".</div>`;
    }

    return results.map(({ location: loc, distance }) => `
      <div class="search-result-item glass-card p-2.5 rounded-xl flex items-center justify-between gap-3 hover:border-totk-gold/40 transition cursor-pointer active:scale-[0.98]" data-loc-id="${loc.id}">
        <div class="min-w-0">
          <div class="text-xs font-semibold text-slate-100 truncate">${loc.title}</div>
          <div class="text-[10px] text-slate-400 truncate flex items-center gap-1.5 mt-0.5">
            <span class="uppercase tracking-wider text-[9px] px-1 py-0.5 rounded bg-slate-800 text-totk-gold font-bold">${loc.world}</span>
            <span>${loc.categoryTitle}</span>
          </div>
        </div>
        ${
          distance != null
            ? `<span class="text-[10px] text-totk-cyan font-bold shrink-0">${formatDistance(distance)}</span>`
            : ''
        }
      </div>
    `).join('');
  }

  private formatLocationDescription(desc: string): string {
    if (!desc) return '';
    let clean = desc.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    clean = clean
      .replace(/\*\*(Solution|Puzzle|Treasure|Location|Coordinates|Quest):\*\*/gi, '<strong class="text-totk-gold block mt-2 text-[11px] font-bold tracking-wide uppercase">$1:</strong>')
      .replace(/_(The Ability to [^_]+)_/gi, '<span class="text-totk-cyan font-bold italic block mb-1 text-[11px]">$1</span>');
    return clean;
  }

  private renderLocationModal(completedSet: Set<number>): string {
    const loc = this.activeLocationModal;
    if (!loc) return '';

    const isDone = completedSet.has(loc.id);

    return `
      <div class="pointer-events-auto fixed inset-0 z-40 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
        <div class="w-full sm:max-w-md glass-panel rounded-t-3xl sm:rounded-2xl p-5 border border-totk-gold/30 shadow-2xl space-y-3.5 max-h-[82vh] overflow-y-auto">
          <!-- Modal Header -->
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="flex items-center gap-2">
                <span class="uppercase text-[9px] tracking-wider px-1.5 py-0.5 rounded bg-totk-gold/20 text-totk-gold font-bold">${loc.world}</span>
                <span class="text-xs text-slate-400">${loc.categoryTitle}</span>
              </div>
              <h3 class="text-base font-bold text-slate-100 mt-0.5">${loc.title}</h3>
            </div>
            <button id="btn-close-detail" class="text-slate-400 hover:text-white p-1 text-lg">✕</button>
          </div>

          <!-- Media Gallery / Clue Images -->
          ${
            loc.media && loc.media.length > 0
              ? `
                <div class="space-y-1.5">
                  <div class="text-[10px] uppercase tracking-wider font-bold text-totk-gold flex items-center justify-between">
                    <span>${loc.category_id === 9076 ? '🌰 Korok Seed Clue Image' : '🖼️ Location Preview'}</span>
                    <span class="text-[9px] text-slate-400 font-normal">Tap image to view full</span>
                  </div>
                  <div class="flex gap-2 overflow-x-auto pb-1.5 snap-x scrollbar-thin">
                    ${loc.media
                      .filter((m) => m.type === 'image')
                      .map(
                        (img) => `
                          <a
                            href="${img.url}"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="snap-center shrink-0 w-full block rounded-xl overflow-hidden border border-white/10 bg-slate-900 shadow-md group relative cursor-pointer"
                          >
                            <img
                              src="${img.url}"
                              alt="${loc.title}"
                              loading="lazy"
                              class="w-full h-44 object-cover group-hover:scale-105 transition duration-300"
                            />
                            <div class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] text-slate-300">
                              🔍 Open Full Image
                            </div>
                          </a>
                        `
                      )
                      .join('')}
                  </div>
                </div>
              `
              : ''
          }

          <!-- Walkthrough & Guide Quick Links -->
          <div class="grid grid-cols-2 gap-2">
            <a
              href="https://www.youtube.com/results?search_query=Zelda+Tears+of+the+Kingdom+${encodeURIComponent(loc.title)}+Walkthrough"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition shadow-md active:scale-95"
            >
              <svg class="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
              <span>YouTube Video</span>
            </a>
            ${
              loc.ign_page_id
                ? `
                  <a
                    href="https://www.ign.com/wikis/the-legend-of-zelda-tears-of-the-kingdom/${loc.ign_page_id}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-totk-gold font-semibold text-xs transition border border-totk-gold/30 shadow-md active:scale-95"
                  >
                    <span>📖</span>
                    <span>IGN Guide</span>
                  </a>
                `
                : `
                  <a
                    href="https://www.google.com/search?q=Zelda+Tears+of+the+Kingdom+${encodeURIComponent(loc.title)}+Solution"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition border border-white/10 shadow-md active:scale-95"
                  >
                    <span>🔍</span>
                    <span>Find Solution</span>
                  </a>
                `
            }
          </div>

          <!-- Description / Guide -->
          ${
            loc.description
              ? `<div class="text-xs text-slate-300 leading-relaxed bg-slate-900/50 p-3 rounded-xl whitespace-pre-line border border-white/5 max-h-48 overflow-y-auto">
                  ${this.formatLocationDescription(loc.description)}
                </div>`
              : `<div class="text-xs text-slate-500 italic">No additional notes or puzzle solution for this marker.</div>`
          }

          <!-- Action Buttons -->
          <div class="flex gap-2 pt-1">
            <button
              id="btn-toggle-modal-done"
              class="flex-1 py-3 px-4 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 shadow-lg ${
                isDone
                  ? 'bg-totk-green text-slate-900 shadow-totk-green/20'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
              }"
              data-id="${loc.id}"
            >
              <span>${isDone ? '✓ Completed' : 'Mark as Completed'}</span>
            </button>
            <button
              id="btn-focus-map"
              class="py-3 px-4 bg-totk-gold hover:bg-totk-gold/90 text-slate-900 font-bold rounded-xl text-xs transition flex items-center justify-center shadow-lg"
              data-id="${loc.id}"
            >
              🔍 Fly to
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    // 1. World Switcher Buttons
    this.appContainer.querySelectorAll('.world-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const world = target.dataset.world as WorldType;
        if (world) {
          this.events.onWorldChange(world);
        }
      });
    });

    // 2. Set Anchor Mode
    const btnAnchor = this.appContainer.querySelector('#btn-anchor');
    btnAnchor?.addEventListener('click', () => {
      this.events.onSetPlayerAnchorMode(!this.isAnchorMode);
    });

    // 3. Clear Anchor
    const btnClear = this.appContainer.querySelector('#btn-clear-anchor');
    btnClear?.addEventListener('click', () => {
      this.events.onClearAnchor();
    });

    // 4. Search Buttons & Modal
    const openSearch = () => {
      this.searchModalOpen = true;
      this.render();
      setTimeout(() => {
        const input = document.getElementById('search-input') as HTMLInputElement;
        if (input) {
          input.focus();
          const len = input.value.length;
          input.setSelectionRange(len, len);
        }
      }, 50);
    };

    this.appContainer.querySelector('#btn-search')?.addEventListener('click', openSearch);
    this.appContainer.querySelector('#btn-bottom-search')?.addEventListener('click', openSearch);
    this.appContainer.querySelector('#btn-float-search')?.addEventListener('click', openSearch);

    const btnCloseSearch = this.appContainer.querySelector('#btn-close-search');
    btnCloseSearch?.addEventListener('click', () => {
      this.searchModalOpen = false;
      this.currentSearchQuery = '';
      this.render();
    });

    const btnClearSearchText = this.appContainer.querySelector('#btn-clear-search-text');
    btnClearSearchText?.addEventListener('click', () => {
      this.currentSearchQuery = '';
      const input = document.getElementById('search-input') as HTMLInputElement;
      if (input) {
        input.value = '';
        input.focus();
      }
      const listEl = this.appContainer.querySelector('#search-results-list');
      if (listEl) {
        listEl.innerHTML = this.renderSearchResultsHtml();
        this.bindSearchResultClickEvents();
      }
    });

    const searchInput = this.appContainer.querySelector('#search-input') as HTMLInputElement;
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.currentSearchQuery = (e.target as HTMLInputElement).value;
        const listEl = this.appContainer.querySelector('#search-results-list');
        if (listEl) {
          listEl.innerHTML = this.renderSearchResultsHtml();
          this.bindSearchResultClickEvents();
        }
      });
      this.bindSearchResultClickEvents();
    }

    // 5. Bottom Sheet Toggle, Minimize & Restore + Swipe Gestures
    const bottomSheet = this.appContainer.querySelector('#bottom-sheet') as HTMLElement;
    const btnToggleSheet = this.appContainer.querySelector('#btn-toggle-sheet');
    const sheetHandle = this.appContainer.querySelector('#sheet-handle');
    const btnHideSheet = this.appContainer.querySelector('#btn-hide-sheet');
    const btnShowSheet = this.appContainer.querySelector('#btn-show-bottom-sheet');

    const toggleSheetHeight = () => {
      if (this.bottomSheetState === 'hidden') {
        this.bottomSheetState = 'lite';
      } else {
        this.bottomSheetState = this.bottomSheetState === 'lite' ? 'full' : 'lite';
      }
      this.render();
    };

    btnToggleSheet?.addEventListener('click', toggleSheetHeight);
    sheetHandle?.addEventListener('click', toggleSheetHeight);

    btnHideSheet?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.bottomSheetState = 'hidden';
      this.render();
    });

    btnShowSheet?.addEventListener('click', () => {
      this.bottomSheetState = 'lite';
      this.render();
    });

    // Touch Swipe Gestures for Bottom Sheet
    if (bottomSheet) {
      let startY = 0;
      let startX = 0;
      let isTouchingHeaderOrHandle = false;

      bottomSheet.addEventListener('touchstart', (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        startY = e.touches[0].clientY;
        startX = e.touches[0].clientX;

        const target = e.target as HTMLElement;
        const handleEl = this.appContainer.querySelector('#sheet-handle');
        const headerEl = handleEl?.nextElementSibling as HTMLElement;
        isTouchingHeaderOrHandle = !!(
          (handleEl && (handleEl === target || handleEl.contains(target))) ||
          (headerEl && (headerEl === target || headerEl.contains(target)))
        );
      }, { passive: true });

      bottomSheet.addEventListener('touchend', (e: TouchEvent) => {
        if (e.changedTouches.length !== 1) return;
        const endY = e.changedTouches[0].clientY;
        const endX = e.changedTouches[0].clientX;
        const deltaY = endY - startY;
        const deltaX = endX - startX;

        // Ensure vertical gesture dominates horizontal gesture with a 35px threshold
        if (Math.abs(deltaY) < 35 || Math.abs(deltaY) <= Math.abs(deltaX)) {
          return;
        }

        if (deltaY < -35) {
          // Swipe UP
          if (this.bottomSheetState === 'lite') {
            this.bottomSheetState = 'full';
            this.render();
          }
        } else if (deltaY > 35) {
          // Swipe DOWN
          if (this.bottomSheetState === 'lite') {
            // Swipe down when already lite -> hide completely
            this.bottomSheetState = 'hidden';
            this.render();
          } else if (this.bottomSheetState === 'full') {
            // Swipe down when full -> collapse to lite if touch started on handle/header
            // or if content container is scrolled to the very top
            const scrollContainer = bottomSheet.querySelector('.overflow-y-auto') as HTMLElement;
            const isAtTop = !scrollContainer || scrollContainer.scrollTop <= 5;

            if (isTouchingHeaderOrHandle || isAtTop) {
              this.bottomSheetState = 'lite';
              this.render();
            }
          }
        }
      }, { passive: true });
    }

    // Swipe up on floating thumb button to restore bottom sheet when hidden
    const btnShowSheetEl = btnShowSheet as HTMLElement | null;
    if (btnShowSheetEl) {
      let fStartY = 0;
      btnShowSheetEl.addEventListener('touchstart', (e: TouchEvent) => {
        if (e.touches.length === 1) fStartY = e.touches[0].clientY;
      }, { passive: true });
      btnShowSheetEl.addEventListener('touchend', (e: TouchEvent) => {
        if (e.changedTouches.length === 1 && fStartY - e.changedTouches[0].clientY > 30) {
          this.bottomSheetState = 'lite';
          this.render();
        }
      }, { passive: true });
    }

    this.appContainer.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tab = (e.currentTarget as HTMLElement).dataset.tab as any;
        if (tab) {
          this.activeTab = tab;
          this.bottomSheetState = 'full';
          this.render();
        }
      });
    });

    // 6. Radar Slider
    const radarSlider = this.appContainer.querySelector('#radar-slider') as HTMLInputElement;
    radarSlider?.addEventListener('input', (e) => {
      const val = Number((e.target as HTMLInputElement).value);
      this.events.onPlayerStateChange({ radarRadiusMeters: val });
    });

    // 7. Hide / Dim Completed Checkboxes
    const toggleHide = this.appContainer.querySelector('#toggle-hide-done') as HTMLInputElement;
    toggleHide?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.events.onPlayerStateChange({ hideCompleted: checked });
    });

    const toggleDim = this.appContainer.querySelector('#toggle-dim-done') as HTMLInputElement;
    toggleDim?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.events.onPlayerStateChange({ dimCompleted: checked });
    });

    // 8. Location Row click in Radar list
    this.appContainer.querySelectorAll('.location-row').forEach((row) => {
      row.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('toggle-done-btn')) return;
        const id = Number((e.currentTarget as HTMLElement).dataset.locId);
        const loc = this.locations.find((l) => l.id === id);
        if (loc) {
          this.events.onSelectLocation(loc);
        }
      });
    });

    // 9. Done button clicks in lists
    this.appContainer.querySelectorAll('.toggle-done-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number((e.currentTarget as HTMLElement).dataset.id);
        this.events.onToggleCompleted(id);
      });
    });

    // 10. Category Checkboxes & Group Toggles
    const btnShowAllCats = this.appContainer.querySelector('#btn-show-all-categories');
    btnShowAllCats?.addEventListener('click', () => {
      const allIds = Object.keys(this.categories).map(Number);
      this.events.onPlayerStateChange({ activeCategories: allIds });
    });

    const btnHideAllCats = this.appContainer.querySelector('#btn-hide-all-categories');
    btnHideAllCats?.addEventListener('click', () => {
      this.events.onPlayerStateChange({ activeCategories: [] });
    });

    this.appContainer.querySelectorAll('.grp-toggle-all').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const grpId = Number((e.currentTarget as HTMLElement).dataset.groupId);
        const grp = this.groups.find((g) => g.id === grpId);
        if (!grp) return;
        const currentActive = new Set(storage.getPlayerState().activeCategories);
        for (const cat of grp.categories) {
          currentActive.add(cat.id);
        }
        this.events.onPlayerStateChange({ activeCategories: Array.from(currentActive) });
      });
    });

    this.appContainer.querySelectorAll('.grp-toggle-none').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const grpId = Number((e.currentTarget as HTMLElement).dataset.groupId);
        const grp = this.groups.find((g) => g.id === grpId);
        if (!grp) return;
        const currentActive = new Set(storage.getPlayerState().activeCategories);
        for (const cat of grp.categories) {
          currentActive.delete(cat.id);
        }
        this.events.onPlayerStateChange({ activeCategories: Array.from(currentActive) });
      });
    });

    this.appContainer.querySelectorAll('.category-checkbox').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const catId = Number((e.currentTarget as HTMLElement).dataset.catId);
        const isChecked = (e.currentTarget as HTMLInputElement).checked;
        const currentActive = new Set(storage.getPlayerState().activeCategories);
        if (isChecked) {
          currentActive.add(catId);
        } else {
          currentActive.delete(catId);
        }
        this.events.onPlayerStateChange({ activeCategories: Array.from(currentActive) });
      });
    });

    // 11. Guides Sub-nav & Interactions
    this.appContainer.querySelectorAll('.guide-sec-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const sec = (e.currentTarget as HTMLElement).dataset.guideSec as any;
        if (sec) {
          this.activeGuideSection = sec;
          this.guideSearchQuery = '';
          this.render();
        }
      });
    });

    const guideFilterInput = this.appContainer.querySelector('#guide-filter-input') as HTMLInputElement;
    if (guideFilterInput) {
      guideFilterInput.addEventListener('input', (e) => {
        this.guideSearchQuery = (e.target as HTMLInputElement).value;
        const body = document.getElementById('guide-content-body');
        if (body) {
          const completedSet = storage.getCompletedSet();
          body.innerHTML = this.renderSpecificGuideHtml(this.activeGuideSection, completedSet, this.guideSearchQuery.toLowerCase().trim());
          this.bindGuideInteractions();
        }
      });
    }

    const btnClearGuideSearch = this.appContainer.querySelector('#btn-clear-guide-search');
    btnClearGuideSearch?.addEventListener('click', () => {
      this.guideSearchQuery = '';
      this.render();
    });

    this.bindGuideInteractions();

    // 12. Modal actions
    const btnCloseDetail = this.appContainer.querySelector('#btn-close-detail');
    btnCloseDetail?.addEventListener('click', () => this.closeLocationDetail());

    const btnToggleModalDone = this.appContainer.querySelector('#btn-toggle-modal-done');
    btnToggleModalDone?.addEventListener('click', (e) => {
      const id = Number((e.currentTarget as HTMLElement).dataset.id);
      this.events.onToggleCompleted(id);
    });

    const btnFocusMap = this.appContainer.querySelector('#btn-focus-map');
    btnFocusMap?.addEventListener('click', (e) => {
      const id = Number((e.currentTarget as HTMLElement).dataset.id);
      const loc = this.locations.find((l) => l.id === id);
      if (loc) {
        this.events.onSelectLocation(loc);
        this.closeLocationDetail();
      }
    });

    // 12. Backup Export / Import / Reset
    const btnExport = this.appContainer.querySelector('#btn-export-backup');
    btnExport?.addEventListener('click', () => {
      const json = storage.exportBackup();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `totk-map-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    const fileImport = this.appContainer.querySelector('#file-import-backup') as HTMLInputElement;
    fileImport?.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const success = await storage.importBackup(text);
      if (success) {
        alert('Checklist backup successfully imported!');
        this.render();
      } else {
        alert('Failed to import backup. Please ensure valid JSON format.');
      }
    });

    const btnResetAll = this.appContainer.querySelector('#btn-reset-all');
    btnResetAll?.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear all marked checklist progress?')) {
        await storage.clearAllCompleted();
      }
    });

    // 13. Offline Map Tiles Download & Clear
    this.appContainer.querySelector('#btn-download-offline-tiles')?.addEventListener('click', () => {
      this.startTileDownload();
    });

    this.appContainer.querySelector('#btn-clear-offline-tiles')?.addEventListener('click', async () => {
      if (confirm('Hapus seluruh cache peta offline dari perangkat?')) {
        await this.clearOfflineTileCache();
      }
    });

    // Refresh cache count if Stats tab is active
    if (this.activeTab === 'stats') {
      this.refreshCachedTileCount();
    }
  }
}
