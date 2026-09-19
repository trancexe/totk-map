#!/usr/bin/env python3
import os
import math
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_DIR = "/home/inggapranata/Projects/totk-map/public/tiles"
os.makedirs(BASE_DIR, exist_ok=True)

# Hyrule bounding box with buffer
MIN_LAT = 0.23
MAX_LAT = 1.19
MIN_LNG = -1.05
MAX_LNG = -0.33

def deg2tile(lat_deg, lon_deg, zoom):
    lat_rad = math.radians(lat_deg)
    n = 2.0 ** zoom
    xtile = int((lon_deg + 180.0) / 360.0 * n)
    ytile = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return (xtile, ytile)

def get_tile_list(min_z=9, max_z=15):
    tiles = []
    for z in range(min_z, max_z + 1):
        x1, y1 = deg2tile(MAX_LAT, MIN_LNG, z)
        x2, y2 = deg2tile(MIN_LAT, MAX_LNG, z)
        min_x, max_x = min(x1, x2), max(x1, x2)
        min_y, max_y = min(y1, y2), max(y1, y2)
        for x in range(min_x, max_x + 1):
            for y in range(min_y, max_y + 1):
                tiles.append((z, x, y))
    return tiles

def download_tile(tile):
    z, x, y = tile
    dest_dir = os.path.join(BASE_DIR, str(z), str(x))
    dest_path = os.path.join(dest_dir, f"{y}.jpg")

    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 0:
        return "cached", 0

    url = f"https://tiles.mapgenie.io/games/zelda-tears-of-the-kingdom/hyrule/default-v2/{z}/{x}/{y}.jpg"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})

    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            if resp.status == 200:
                data = resp.read()
                os.makedirs(dest_dir, exist_ok=True)
                with open(dest_path, "wb") as f:
                    f.write(data)
                return "saved", len(data)
    except urllib.error.HTTPError as e:
        if e.code in (403, 404):
            return "empty", 0
        return f"http_{e.code}", 0
    except Exception as e:
        return f"err_{type(e).__name__}", 0

    return "unknown", 0

def main():
    tiles = get_tile_list(9, 15)
    total = len(tiles)
    print(f"=== TOTK Map Tile Downloader (Zoom 9..15) ===")
    print(f"Total candidate tiles to check: {total}")

    saved_count = 0
    cached_count = 0
    empty_count = 0
    err_count = 0
    total_bytes = 0

    start_time = time.time()
    batch_size = 500

    with ThreadPoolExecutor(max_workers=20) as executor:
        futures = {executor.submit(download_tile, t): t for t in tiles}
        done_count = 0

        for f in as_completed(futures):
            done_count += 1
            status, size = f.result()
            if status == "saved":
                saved_count += 1
                total_bytes += size
            elif status == "cached":
                cached_count += 1
            elif status == "empty":
                empty_count += 1
            else:
                err_count += 1

            if done_count % 200 == 0 or done_count == total:
                elapsed = time.time() - start_time
                rate = done_count / (elapsed or 1)
                mb = total_bytes / (1024 * 1024)
                pct = (done_count / total) * 100
                print(
                    f"[{pct:5.1f}%] {done_count}/{total} | Saved: {saved_count} ({mb:.1f}MB) | "
                    f"Cached: {cached_count} | Empty: {empty_count} | Err: {err_count} | {rate:.0f} tiles/s"
                )

    print("\n=== Download Finished! ===")
    print(f"Total Valid Saved: {saved_count}")
    print(f"Total Cached Pre-existing: {cached_count}")
    print(f"Total Size Downloaded: {total_bytes / (1024*1024):.2f} MB")
    print(f"Destination: {BASE_DIR}")

if __name__ == "__main__":
    main()
