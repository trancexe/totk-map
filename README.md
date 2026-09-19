# Zelda: Tears of the Kingdom — Interactive Companion Map & PWA 🗡️✨

[![Live Demo](https://img.shields.io/badge/demo-online-brightgreen.svg?style=flat-square)](https://trancexe.github.io/totk-map/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Zero External CDN](https://img.shields.io/badge/tiles-100%25%20self--hosted-success.svg?style=flat-square)]()
[![PWA Ready](https://img.shields.io/badge/PWA-offline%20ready-orange.svg?style=flat-square)]()

An ultra-lightweight, 60 FPS mobile-first interactive checklist map for *The Legend of Zelda: Tears of the Kingdom*, built with MapLibre GL, TypeScript, Tailwind CSS, and Progressive Web App (PWA) architecture.

🎮 **Live Application**: [https://trancexe.github.io/totk-map/](https://trancexe.github.io/totk-map/)

---

## ⚖️ Legal & Fair Use Disclaimer

> **IMPORTANT NOTICE / PENAFIAN HUKUM:**
> 
> This software is a **strictly non-commercial, open-source fan companion project** created exclusively for personal educational purposes, non-profit gameplay utility, and web performance research.
>
> 1. **Intellectual Property**: *The Legend of Zelda*, *Tears of the Kingdom*, character names, location titles, game iconography, and related trademarks are the exclusive intellectual property and copyright of **Nintendo Co., Ltd.**
> 2. **Non-Affiliation**: This repository and its creator are **not** affiliated with, endorsed by, sponsored by, or associated with Nintendo, MapGenie, or any commercial game guide organization.
> 3. **Non-Commercial**: This application is distributed free of charge under open-source terms. It contains **no advertisements, no tracking mechanisms, no donations, no in-app purchases, and no paywalls**.
> 4. **Fair Use**: In-game names, coordinates, and educational reference guides are incorporated under the Fair Use doctrine (U.S. Copyright Act 17 U.S.C. § 107) for informational, commentary, and non-commercial utility usage.
> 
> If you are a copyright holder with questions or concerns regarding this repository, please open an issue or contact the repository maintainer.

---

## 🌟 Key Features

- **🛡️ 100% Self-Hosted & Zero External CDNs**:
  - Fully decoupled from third-party map CDNs.
  - All 7,904 map tiles (Zoom 9–15 across Sky, Surface, and Depths) are bundled locally (`public/tiles/`) with hardware WebGL bilinear overscaling up to Zoom 18.
- **📶 Complete Offline Capability & PWA**:
  - Full Service Worker cache-first architecture.
  - Installable directly to mobile home screens with standalone fullscreen app mode.
  - 1-tap offline map tile pre-caching manager.
- **🎯 Proximity Radar ("Link Sensor")**:
  - Set Link's current in-game position on the map with a single tap.
  - Dynamic radar radius slider (0m to 5,000m) with real-time distance calculation.
  - Live nearby checklist sorted by closest distance.
- **✅ Unlimited 100% Completion Tracker (No Paywalls)**:
  - All 2,279 master checklist items stored locally via IndexedDB (`idb-keyval`).
  - Progress tracking for 1,000 Koroks, 152 Shrines, 120 Lightroots, 147 Caves, Bubbulfrogs, Addison Signs, Quests, and Schematics.
  - JSON Backup Export and Import for seamless cross-device synchronization.
- **🧭 Integrated Interactive Guides**:
  - **42 Armor Sets** (137 pieces) with set bonuses, chest locations, and 1-tap map navigation.
  - **20 Sage's Wills** with sky island chest puzzle walkthroughs.
  - **4 Dragons** (Light Dragon, Farosh, Naydra, Dinraal) with flight loop paths and chasm entrances.
  - **269 Miniboss Encounters** (King Gleeoks, Silver Lynels, Frox, Taluses, Hinoxes, Moldugas).
  - **240 Voice Memories & Dragon's Tears** in spoiler-free chronological sequence.
- **📱 Thumb-Zone Mobile Ergonomics**:
  - Pinned bottom search input directly above mobile virtual keyboards.
  - 3-state bottom drawer (`hidden` | `lite` | `full`) with 1-tap hide button (`✕`) for full-screen map exploration.
  - Floating bottom thumb navigation pill.

---

## 🚀 Quick Start

### Prerequisites
- Node.js >= 20.0.0
- npm >= 9.0.0

### Installation & Local Development
```bash
# Clone the repository
git clone https://github.com/trancexe/totk-map.git
cd totk-map

# Install dependencies
npm ci

# Start local development server
npm run dev
```

### Production Build & Verification
```bash
# Static typecheck
npm run typecheck

# Code quality and linting
npm run lint

# Automated unit & integration tests
npm test

# Production build
npm run build

# Preview production build locally
npm run preview
```

---

## 🏗️ Architecture & Tech Stack

| Component | Technology | Description |
|---|---|---|
| **Engine** | [MapLibre GL JS v6](https://maplibre.org/) | GPU-accelerated WebGL map rendering |
| **Framework** | [Vite 6](https://vitejs.dev/) + [TypeScript 5](https://www.typescriptlang.org/) | Fast ES-module bundler and static typing |
| **Styling** | [Tailwind CSS v3](https://tailwindcss.com/) | Custom Hyrule dark-mode aesthetics |
| **Storage** | [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) (`idb-keyval`) | Client-side persistent state & completion data |
| **Offline** | Service Worker + Cache API | Dual-cache PWA architecture |
| **CI/CD** | GitHub Actions | Automated build & deployment to GitHub Pages |

---

## 📄 License

The underlying source code of this companion application is licensed under the [MIT License](LICENSE).

All game names, trademarks, assets, and copyrights belong to **Nintendo Co., Ltd.**
