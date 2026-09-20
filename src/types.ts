export type WorldType = 'surface' | 'sky' | 'depths';

export interface Category {
  id: number;
  group_id: number;
  title: string;
  icon: string;
  info?: string | null;
  template?: string | null;
  order: number;
  locations_count: number;
}

export interface Group {
  id: number;
  title: string;
  order: number;
  color?: string;
  categories: Category[];
}

export interface Region {
  id: number;
  parent_region_id: number | null;
  title: string;
  geometry?: any;
}

export interface MediaItem {
  url: string;
  type: string;
  title?: string;
}

// Compact location array format: [id, category_id, region_id, lat, lng, title, description, media, ign_page_id]
export type RawLocationTuple = [
  number,
  number,
  number,
  number,
  number,
  string,
  string,
  MediaItem[] | null | undefined,
  string | null | undefined
];

export interface LocationItem {
  id: number;
  category_id: number;
  region_id: number;
  lat: number;
  lng: number;
  title: string;
  description: string;
  media?: MediaItem[];
  ign_page_id?: string | null;
  world: WorldType;
  group_id: number;
  icon: string;
  categoryTitle: string;
}

export interface MapData {
  mapConfig: {
    start_lat: number;
    start_lng: number;
    initial_zoom: number;
    [key: string]: any;
  };
  groups: Group[];
  categories: Record<string, Category>;
  regions: Region[];
  locations: RawLocationTuple[];
  sprites?: Record<string, any>;
}

export interface PlayerState {
  id: 'current_player';
  lat: number | null;
  lng: number | null;
  world: WorldType;
  radarRadiusMeters: number; // 0 = off, 250, 500, 1000, 2500, 5000
  hideCompleted: boolean;
  dimCompleted: boolean;
  activeCategories: number[]; // array of enabled category IDs
  searchQuery: string;
  mapCenter?: [number, number] | null;
  mapZoom?: number | null;
}

export interface ChecklistExport {
  version: number;
  timestamp: number;
  completedIds: number[];
  playerState?: Partial<PlayerState>;
}
