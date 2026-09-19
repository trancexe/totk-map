# ARCHITECTURAL PLAN & SPECIFICATION: TOTK INTERACTIVE MAP (MOBILE-FIRST)

## 1. Executive Summary
TOTK Interactive Map adalah aplikasi PWA (Progressive Web App) peta interaktif Zelda: Tears of the Kingdom yang dioptimalkan khusus untuk perangkat mobile (smartphone/tablet di samping dock Switch). Aplikasi ini mengklon dataset 1:1 MapGenie (7.943 marker, 162 kategori, 27 region) tanpa batas paywall (100% unlimited checklist), dilengkapi radar radius pemain, fokus wilayah, dan rendering GPU 60 FPS.

---

## 2. Entity Relationship Diagram (ERD) & Data Modeling

```
+--------------------------------------------------------------------------------------------------+
|                                      STATIC MASTER DATA                                          |
+--------------------------------------------------------------------------------------------------+

  [ Group ]
  ├── id: number (PK)
  ├── title: string
  ├── order: number
  └── color: string
         │
         │ 1:N
         ▼
  [ Category ]
  ├── id: number (PK)
  ├── group_id: number (FK -> Group.id)
  ├── title: string
  ├── icon: string
  ├── info: string | null
  ├── template: string | null
  └── locations_count: number
         │
         │ 1:N
         ▼
  [ Location ]
  ├── id: number (PK)
  ├── category_id: number (FK -> Category.id)
  ├── region_id: number (FK -> Region.id)
  ├── world: 'surface' | 'sky' | 'depths' (Enum derived from latitude)
  ├── lat: number (Normalized Coordinate)
  ├── lng: number (Normalized Coordinate)
  ├── title: string
  └── description: string (Guide, puzzle solution, inventory)
         ▲
         │ N:1
  [ Region ]
  ├── id: number (PK)
  ├── parent_region_id: number | null (FK -> Region.id, null for Root: Depths, Sky, Surface)
  ├── world: 'surface' | 'sky' | 'depths'
  ├── title: string
  └── geometry: GeoJSON.Polygon | null (Coordinate boundaries)

+--------------------------------------------------------------------------------------------------+
|                                    DYNAMIC USER STATE (INDEXEDDB)                                |
+--------------------------------------------------------------------------------------------------+

  [ ChecklistProgress ] (Store: `totk_checklist`)
  ├── location_id: number (PK -> Location.id)
  ├── completed: boolean
  └── completed_at: number (Timestamp)

  [ PlayerState ] (Store: `totk_player_state`)
  ├── id: 'current_player' (Singleton PK)
  ├── lat: number | null (Virtual player anchor coordinate)
  ├── lng: number | null
  ├── world: 'surface' | 'sky' | 'depths'
  ├── radar_radius_meters: number (0 = disabled, 250, 500, 1000, 2000, 5000)
  ├── focused_region_id: number | null
  ├── isolate_region: boolean
  ├── hide_completed: boolean
  └── active_categories: number[] (List of category_ids enabled)

  [ UserCustomPin ] (Store: `totk_custom_pins` - Optional)
  ├── id: string (UUID PK)
  ├── lat: number
  ├── lng: number
  ├── world: 'surface' | 'sky' | 'depths'
  ├── title: string
  └── note: string
```

### Relasi & Kardinalitas:
- `Group` memiliki banyak `Category` (1 to N).
- `Category` memiliki banyak `Location` (1 to N).
- `Region` memiliki hirarki bertingkat (Root Region -> Sub-region) dan membawahi banyak `Location` (1 to N).
- `Location` terhubung ke `ChecklistProgress` secara 1 to 1 (opsional: record dibuat saat ditandai).
- `PlayerState` menyimpan konfigurasi aktif untuk radar spasial, filter wilayah, dan status visual.

---

## 3. Pembagian Tugas per Divisi (FE vs BE/Core Engine)

Meskipun aplikasi ini berupa PWA client-side offline, arsitektur dibagi secara tegas antara **Core Data/Logic Engine (BE)** dan **UI/Canvas View Layer (FE)**:

### Divisi BE (Core Data Engine & Storage Subsystem)
Fokus: Integritas data, performa komputasi spasial, penyimpanan offline, dan search index.
1. **Module `storage/` (IndexedDB Wrapper)**:
   - Manajemen database IndexedDB (`totk_db`) via wrapper ringan.
   - Operasi CRUD atomic untuk `ChecklistProgress` dan `PlayerState`.
   - Fitur Backup: `exportChecklistJSON()` dan `importChecklistJSON()` dengan validasi skema.
2. **Module `spatial/` (Proximity Radar & Geometry Engine)**:
   - Algoritma konversi jarak koordinat planar/lat-lng ke estimasi meter Hyrule.
   - Algoritma query radius: `getLocationsInRadius(playerLat, playerLng, radiusMeters, world)`.
   - Algoritma Point-in-Polygon / Bounding Box untuk `Region Filter` (menentukan lokasi mana yang masuk dalam batas region tertentu).
3. **Module `search/` (Instant Search Index)**:
   - Inverted search index / fast prefix trie untuk pencarian instan nama Shrine, Tower, Cave, Item, NPC, dan kata kunci deskripsi.
   - Skor relevansi dan kalkulasi jarak dari posisi karakter (misal: "Shrine X - 350m dari posisi Link").
4. **Module `pwa/` (Service Worker & Caching)**:
   - Caching offline untuk shell aplikasi (HTML, CSS, JS) dan sprite atlas `markers@2x.png`.

---

### Divisi FE (UI/UX & MapLibre Canvas Presentation)
Fokus: Mobile ergonomics, rendering 60 FPS, touch gestures, dan tampilan interaktif.
1. **Module `map/` (MapLibre GL Controller)**:
   - Inisialisasi MapLibre GL dengan tile raster MapGenie.
   - Pengaturan 3 dunia vertikal (`Sky`: Lat 0.89-1.20, `Surface`: Lat 0.54-0.87, `Depths`: Lat 0.25-0.52).
   - Render marker menggunakan WebGL Symbol Layer + Sprite Atlas (bukan DOM HTML), mendukung state normal, redup (opacity 30%), dan hidden.
   - Render lingkaran radar visual (glowing circle) di sekitar posisi player.
2. **Module `ui/bottom-sheet` (Mobile Bottom Sheet)**:
   - Komponen drawer sentuh dengan 3 snap points (Peek, Half, Full) yang mulus dan bebas lag.
   - Berisi summary statistik wilayah, radar scanner list terdekat, dan filter kategori.
3. **Module `ui/controls` (Floating Thumb Controls)**:
   - Floating World Switcher di pojok kanan bawah: `[ ☁️ Sky | 🌿 Surface | 🌌 Depths ]` dengan animasi `map.easeTo()` / `map.flyTo()`.
   - Floating Quick-Action: Tombol `[📍 Set Posisi Saya]`, `[🎯 Radar Slider]`, `[🔍 Search]`.
4. **Module `ui/checklist` (Achievement & Checklist Panel)**:
   - Bar progres kategori (Shrines 152, Lightroots 120, Koroks 1.000, Bubbulfrog 147, Boss Medals).
   - Toggle: "Hide Completed Markers" & "Dim Completed Markers".
5. **Module `ui/popup` (Location Detail Card)**:
   - Bottom modal/card saat marker diketuk: Menampilkan nama, kategori, koordinat in-game, panduan/deskripsi, dan tombol besar `[✓ Tandai Selesai]`.

---

## 4. Standar Penerimaan Kode (Acceptance Criteria & Quality Gate)

Setiap kode yang dikerjakan oleh subagent wajib lolos **Fast Quality Gate** berikut:

| Kriteria | Standar & Target | Verifikasi |
| :--- | :--- | :--- |
| **Typecheck** | TypeScript Strict Mode (`strict: true`), 0 error. | `npm run typecheck` |
| **Lint & Formatting** | ESLint standard, 0 warning/error. | `npm run lint` |
| **Build Artifact** | Vite production build bersih tanpa warning circular dependency. | `npm run build` |
| **Performance Budget** | Frame rate konsisten **60 FPS** saat pan & pinch di mobile. Beban memori RAM < 60 MB. Bundle awal < 350 KB (gzipped). | Chrome DevTools Performance Profiler |
| **Checklist Invariant** | Tidak ada batasan jumlah checklist (100% unlimited). Data tersimpan permanen di IndexedDB dan tetap ada setelah browser direfresh. | Unit test / manual refresh test |
| **Mobile Ergonomics** | Ukuran touch target tombol minimal **44 x 44 px** (Apple HIG). Teks mudah dibaca pada layar 360px–430px. | Mobile Device Emulation (iPhone / Pixel) |
| **Offline First** | Aplikasi tetap terbuka dan map markers dapat dicari meski jaringan internet terputus (PWA). | Chrome DevTools Network: Offline mode |

---

## 5. Roadmap Eksekusi Subagent
- **Tahap 1 (Scaffolding & BE Engine)**:
  Subagent `backend` / `worker` menyiapkan project Vite TS + Tailwind, mengimplementasikan module `storage/` (IndexedDB), `spatial/` (Radar engine), dan `search/`.
- **Tahap 2 (Map Canvas & FE UI)**:
  Subagent `frontend` merakit kanvas MapLibre GL, mengintegrasikan sprite atlas WebGL, Bottom Sheet drawer, World Switcher, dan integrasi state checklist.
- **Tahap 3 (Quality Gate & Review)**:
  Subagent `reviewer` memvalidasi kriteria performa 60 FPS, memeriksa edge case offline, dan memastikan zero defects.
