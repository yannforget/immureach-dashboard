#!/usr/bin/env python3
"""Generate simplified boundary GeoJSON files for the dashboard.

Reads zone (level 3) geometries from shapes_level3.gpkg and produces two
web-optimized GeoJSON files in data/output/boundaries/:

  - zones.geojson      level 3 boundaries (zones de santé)
  - provinces.geojson  level 2 boundaries (dissolved by level_2_id)

Geometries are simplified topology-aware with mapshaper so shared borders
between adjacent zones/provinces remain coincident after simplification.

Run from the project root:

    uv run scripts/generate-boundaries.py [simplification-pct]

The simplification percentage is the fraction of vertices to KEEP
(default: 10). Lower means smaller files but coarser borders.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import geopandas as gpd

PROJECT_ROOT = Path(__file__).resolve().parent.parent
INPUT_GPKG = PROJECT_ROOT / "data/input/immureach/shapes_level3.gpkg"
OUTPUT_DIR = PROJECT_ROOT / "data/output/boundaries"

DEFAULT_SIMPLIFY_PCT = 10


def run_mapshaper(args: list[str]) -> None:
    subprocess.run(["npx", "mapshaper", *args], check=True)


def main() -> None:
    simplify_pct = float(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SIMPLIFY_PCT

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Reading {INPUT_GPKG.relative_to(PROJECT_ROOT)}...")
    zones = gpd.read_file(INPUT_GPKG)
    if zones.crs is None or zones.crs.to_epsg() != 4326:
        zones = zones.to_crs(epsg=4326)
    print(f"  {len(zones)} zones")

    temp_zones = OUTPUT_DIR / "_temp_zones.geojson"
    if temp_zones.exists():
        temp_zones.unlink()
    zones.to_file(temp_zones, driver="GeoJSON")

    zones_out = OUTPUT_DIR / "zones.geojson"
    provinces_out = OUTPUT_DIR / "provinces.geojson"

    simplify = ["-simplify", f"{simplify_pct}%", "keep-shapes"]

    print(f"Generating zones.geojson (simplify={simplify_pct}%)...")
    run_mapshaper([
        str(temp_zones),
        *simplify,
        "-o", "format=geojson", str(zones_out),
    ])

    print("Generating provinces.geojson (dissolve by level_2_id)...")
    run_mapshaper([
        str(temp_zones),
        *simplify,
        "-dissolve", "level_2_id",
        "copy-fields=level_2_name,level_1_id,level_1_name",
        "-o", "format=geojson", str(provinces_out),
    ])

    temp_zones.unlink()
    print("Done.")


if __name__ == "__main__":
    main()
