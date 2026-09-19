import { get, set } from 'idb-keyval';
import type { PlayerState, ChecklistExport } from '../types';

const COMPLETED_KEY = 'totk_completed_ids';
const PLAYER_STATE_KEY = 'totk_player_state';

const DEFAULT_PLAYER_STATE: PlayerState = {
  id: 'current_player',
  lat: null,
  lng: null,
  world: 'surface',
  radarRadiusMeters: 0,
  hideCompleted: false,
  dimCompleted: true,
  activeCategories: [],
  searchQuery: '',
};

export class StorageEngine {
  private completedSet: Set<number> = new Set();
  private playerState: PlayerState = { ...DEFAULT_PLAYER_STATE };
  private listeners: Set<() => void> = new Set();
  private isFreshState = false;

  async init(): Promise<void> {
    try {
      const savedCompleted = await get<number[]>(COMPLETED_KEY);
      if (Array.isArray(savedCompleted)) {
        this.completedSet = new Set(savedCompleted);
      }

      const savedState = await get<PlayerState>(PLAYER_STATE_KEY);
      if (savedState) {
        this.playerState = { ...DEFAULT_PLAYER_STATE, ...savedState };
      } else {
        this.isFreshState = true;
      }
    } catch (e) {
      console.warn('Failed to load state from IndexedDB:', e);
    }
  }

  isFresh(): boolean {
    return this.isFreshState;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  isCompleted(id: number): boolean {
    return this.completedSet.has(id);
  }

  getCompletedCount(): number {
    return this.completedSet.size;
  }

  getCompletedSet(): Set<number> {
    return this.completedSet;
  }

  async toggleCompleted(id: number): Promise<boolean> {
    const isNow = !this.completedSet.has(id);
    if (isNow) {
      this.completedSet.add(id);
    } else {
      this.completedSet.delete(id);
    }
    await this.persistCompleted();
    this.notify();
    return isNow;
  }

  async setBatchCompleted(ids: number[], completed: boolean): Promise<void> {
    for (const id of ids) {
      if (completed) {
        this.completedSet.add(id);
      } else {
        this.completedSet.delete(id);
      }
    }
    await this.persistCompleted();
    this.notify();
  }

  getPlayerState(): PlayerState {
    return this.playerState;
  }

  async updatePlayerState(partial: Partial<PlayerState>): Promise<void> {
    this.playerState = { ...this.playerState, ...partial };
    try {
      await set(PLAYER_STATE_KEY, this.playerState);
    } catch (e) {
      console.warn('Failed to persist player state:', e);
    }
    this.notify();
  }

  private async persistCompleted(): Promise<void> {
    try {
      await set(COMPLETED_KEY, Array.from(this.completedSet));
    } catch (e) {
      console.warn('Failed to persist completed IDs:', e);
    }
  }

  exportBackup(): string {
    const data: ChecklistExport = {
      version: 1,
      timestamp: Date.now(),
      completedIds: Array.from(this.completedSet),
      playerState: this.playerState,
    };
    return JSON.stringify(data, null, 2);
  }

  async importBackup(jsonString: string): Promise<boolean> {
    try {
      const data = JSON.parse(jsonString) as ChecklistExport;
      if (!data || !Array.isArray(data.completedIds)) {
        throw new Error('Invalid backup file format');
      }
      this.completedSet = new Set(data.completedIds);
      await this.persistCompleted();
      if (data.playerState) {
        await this.updatePlayerState(data.playerState);
      } else {
        this.notify();
      }
      return true;
    } catch (e) {
      console.error('Import failed:', e);
      return false;
    }
  }

  async clearAllCompleted(): Promise<void> {
    this.completedSet.clear();
    await this.persistCompleted();
    this.notify();
  }
}

export const storage = new StorageEngine();
