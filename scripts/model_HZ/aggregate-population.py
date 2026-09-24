#!/usr/bin/env python3
"""Aggregate GRID3 population rasters at zone (level 3) and province (level 2).

Inputs:
  - data/input/grid3/COD_population_v4_4_gridded/COD_Population_v4_4_gridded.tif
        national gridded population raster
  - data/input/grid3/COD_<Province>_province_population_v4.4_agesex/
        per-province under-1 and under-5 rasters
  - data/output/boundaries/zones.geojson      level-3 polygons
  - data/output/boundaries/provinces.geojson  level-2 polygons
  - data/input/dhs/imr.csv                    province-level infant mortality rate

Outputs:
  - data/output/population/zones.csv
  - data/output/population/provinces.csv

Both contain: total_population, pop_u1, pop_u5, pop_6_12mo, pop_12_24mo,
pop_6_24mo, births_per_year.

Methodology follows scripts/prepare-data.py:
  births = pop_u1 / (1 - imr / 1000)
  pop_6_12mo = pop_u1 * 0.5
  pop_12_24mo = (pop_u5 - pop_u1) * 0.25
  pop_6_24mo = pop_6_12mo + pop_12_24mo

Province slugs are derived from level_2_name in zones.geojson by stripping the
leading 2-letter code prefix and the trailing " Province". The script raises
LookupError if a province's agesex rasters or IMR value cannot be located.

Run: uv run scripts/aggregate-population.py
"""

from pathlib import Path

import geopandas as gpd
import pandas as pd
from rasterstats import zonal_stats

PROJECT_ROOT = Path(__file__).resolve().parent.parent

GRID3_DIR = PROJECT_ROOT / "data/input/grid3"
GRIDDED_RASTER = (
    GRID3_DIR / "COD_population_v4_4_gridded/COD_Population_v4_4_gridded.tif"
)
ZONES_GEOJSON = PROJECT_ROOT / "data/output/boundaries/zones.geojson"
PROVINCES_GEOJSON = PROJECT_ROOT / "data/output/boundaries/provinces.geojson"
IMR_CSV = PROJECT_ROOT / "data/input/dhs/imr.csv"

OUT_DIR = PROJECT_ROOT / "data/output/population"
OUT_ZONES = OUT_DIR / "zones.csv"
OUT_PROVINCES = OUT_DIR / "provinces.csv"

AGG_COLS = [
    "total_population",
    "pop_u1",
    "pop_u5",
    "pop_6_12mo",
    "pop_12_24mo",
    "pop_6_24mo",
    "births_per_year",
]


def province_name(level_2_name: str) -> str:
    """'kl Kwilu Province' -> 'Kwilu'; 'hk Haut Katanga Province' -> 'Haut Katanga'."""
    body = level_2_name.split(" ", 1)[1]
    if not body.endswith(" Province"):
        raise ValueError(f"Unexpected level_2_name format: {level_2_name!r}")
    return body[: -len(" Province")]


# Overrides for provinces where the GRID3 folder/file slug doesn't match
# province_name(level_2_name).replace(" ", "_") (boundary "Maindombe" vs
# GRID3 "Mai_Ndombe").
PROVINCE_GRID3_SLUG = {
    "Maindombe": "Mai_Ndombe",
}


def agesex_raster(name: str, age: str) -> Path:
    slug = PROVINCE_GRID3_SLUG.get(name, name.replace(" ", "_"))
    return (
        GRID3_DIR
        / f"COD_{slug}_province_population_v4.4_agesex"
        / f"COD_{slug}_population_v4_4_agesex_{age}.tif"
    )


def sum_raster(geom: gpd.GeoDataFrame, raster: Path) -> list[float]:
    if not raster.exists():
        raise FileNotFoundError(f"Missing raster: {raster.relative_to(PROJECT_ROOT)}")
    stats = zonal_stats(geom, raster, stats=["sum"], all_touched=False)
    return [s["sum"] for s in stats]


def derive_child_fields(df: pd.DataFrame) -> pd.DataFrame:
    df["pop_6_12mo"] = df["pop_u1"] * 0.5
    df["pop_12_24mo"] = (df["pop_u5"] - df["pop_u1"]) * 0.25
    df["pop_6_24mo"] = df["pop_6_12mo"] + df["pop_12_24mo"]
    df["births_per_year"] = df["pop_u1"] / (1 - df["imr"] / 1000)
    return df


def main() -> None:
    print(f"Reading {ZONES_GEOJSON.relative_to(PROJECT_ROOT)}...")
    zones = gpd.read_file(ZONES_GEOJSON)
    print(f"  {len(zones)} zones across {zones['level_2_name'].nunique()} provinces")

    print(f"Reading {PROVINCES_GEOJSON.relative_to(PROJECT_ROOT)}...")
    provinces = gpd.read_file(PROVINCES_GEOJSON)
    print(f"  {len(provinces)} provinces")

    print(f"Reading {IMR_CSV.relative_to(PROJECT_ROOT)}...")
    imr_table = pd.read_csv(IMR_CSV).set_index("region")["value"].to_dict()

    # Resolve per-province IMR up front so missing entries fail fast.
    province_imr: dict[str, float] = {}
    missing_imr: list[str] = []
    for level_2_name in sorted(zones["level_2_name"].unique()):
        key = province_name(level_2_name)
        if key not in imr_table:
            missing_imr.append(f"{level_2_name!r} (looked up as {key!r})")
            continue
        province_imr[level_2_name] = float(imr_table[key])
    if missing_imr:
        raise LookupError(
            "No IMR value in imr.csv for: " + "; ".join(missing_imr)
        )

    print("Computing total population per zone (national gridded raster)...")
    zones = zones.copy()
    zones["total_population"] = sum_raster(zones, GRIDDED_RASTER)

    print("Computing under-1 / under-5 population per zone (per-province rasters)...")
    zones["pop_u1"] = pd.NA
    zones["pop_u5"] = pd.NA
    for level_2_name in sorted(zones["level_2_name"].unique()):
        name = province_name(level_2_name)
        mask = zones["level_2_name"] == level_2_name
        subset = zones.loc[mask]
        print(f"  {level_2_name}: {len(subset)} zones")
        zones.loc[mask, "pop_u1"] = sum_raster(subset, agesex_raster(name, "under1"))
        zones.loc[mask, "pop_u5"] = sum_raster(subset, agesex_raster(name, "under5"))

    zones["pop_u1"] = pd.to_numeric(zones["pop_u1"])
    zones["pop_u5"] = pd.to_numeric(zones["pop_u5"])
    zones["imr"] = zones["level_2_name"].map(province_imr)
    zones = derive_child_fields(zones)

    print("Aggregating zone metrics to province level...")
    province_agg = (
        pd.DataFrame(zones)
        .groupby(["level_2_id", "level_2_name"], as_index=False)[AGG_COLS]
        .sum(min_count=1)
    )
    province_meta = provinces[
        ["level_1_id", "level_1_name", "level_2_id", "level_2_name"]
    ].drop_duplicates("level_2_id")
    province_out = province_meta.merge(
        province_agg, on=["level_2_id", "level_2_name"], how="left"
    )
    province_out["imr"] = province_out["level_2_name"].map(province_imr)

    print(
        f"Writing {OUT_ZONES.relative_to(PROJECT_ROOT)} and "
        f"{OUT_PROVINCES.relative_to(PROJECT_ROOT)}..."
    )
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    zone_cols = [
        "level_1_id",
        "level_1_name",
        "level_2_id",
        "level_2_name",
        "level_3_id",
        "level_3_name",
        "imr",
        *AGG_COLS,
    ]
    pd.DataFrame(zones)[zone_cols].to_csv(OUT_ZONES, index=False)

    province_cols = [
        "level_1_id",
        "level_1_name",
        "level_2_id",
        "level_2_name",
        "imr",
        *AGG_COLS,
    ]
    province_out[province_cols].to_csv(OUT_PROVINCES, index=False)

    print("Done.")


if __name__ == "__main__":
    main()
