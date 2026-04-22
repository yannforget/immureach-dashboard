#!/usr/bin/env python3
"""Prepare dashboard source data.

Reads the predictions GeoPackage and GRID3 rasters, then produces the inputs
consumed by scripts/generate-geojson.js and by downstream analysis:

  - data/data.geojson   per-zone geometries with population, total_population
                        and prediction columns (target provinces only)
  - data/data.csv       same data as a flat CSV

Run from the project root:

    uv run scripts/prepare-data.py
"""

from pathlib import Path

import geopandas as gpd
import pandas as pd
from rasterstats import zonal_stats

PROJECT_ROOT = Path(__file__).resolve().parent.parent

PREDICTIONS_GPKG = (
    PROJECT_ROOT / "raw_data/drc/immureach/260317_data_and_predictions.gpkg"
)
GRIDDED_POPULATION_RASTER = (
    PROJECT_ROOT
    / "raw_data/drc/grid3/COD_population_v4_4_gridded/COD_Population_v4_4_gridded.tif"
)
ANTENNES_CSV = PROJECT_ROOT / "raw_data/drc/zones_with_antenne.csv"

OUT_GEOJSON = PROJECT_ROOT / "data/data.geojson"
OUT_CSV = PROJECT_ROOT / "data/data.csv"

PROVINCES = [
    {
        "short_name": "Kwilu",
        "long_name": "kl Kwilu Province",
        "under1_fp": "raw_data/drc/grid3/COD_Kwilu_province_population_v4.4_agesex/COD_Kwilu_population_v4_4_agesex_under1.tif",
        "under5_fp": "raw_data/drc/grid3/COD_Kwilu_province_population_v4.4_agesex/COD_Kwilu_population_v4_4_agesex_under5.tif",
        "imr": 35.0,
    },
    {
        "short_name": "Sankuru",
        "long_name": "sn Sankuru Province",
        "under1_fp": "raw_data/drc/grid3/COD_Sankuru_province_population_v4.4_agesex/COD_Sankuru_population_v4_4_agesex_under1.tif",
        "under5_fp": "raw_data/drc/grid3/COD_Sankuru_province_population_v4.4_agesex/COD_Sankuru_population_v4_4_agesex_under5.tif",
        "imr": 60.0,
    },
    {
        "short_name": "Kasai",
        "long_name": "ks Kasai Province",
        "under1_fp": "raw_data/drc/grid3/COD_Kasai_province_population_v4.4_agesex/COD_Kasai_population_v4_4_agesex_under1.tif",
        "under5_fp": "raw_data/drc/grid3/COD_Kasai_province_population_v4.4_agesex/COD_Kasai_population_v4_4_agesex_under5.tif",
        "imr": 69.0,
    },
    {
        "short_name": "Lomami",
        "long_name": "lm Lomami Province",
        "under1_fp": "raw_data/drc/grid3/COD_Lomami_province_population_v4.4_agesex/COD_Lomami_population_v4_4_agesex_under1.tif",
        "under5_fp": "raw_data/drc/grid3/COD_Lomami_province_population_v4.4_agesex/COD_Lomami_population_v4_4_agesex_under5.tif",
        "imr": 53.0,
    },
    {
        "short_name": "Lualaba",
        "long_name": "ll Lualaba Province",
        "under1_fp": "raw_data/drc/grid3/COD_Lualaba_province_population_v4.4_agesex/COD_Lualaba_population_v4_4_agesex_under1.tif",
        "under5_fp": "raw_data/drc/grid3/COD_Lualaba_province_population_v4.4_agesex/COD_Lualaba_population_v4_4_agesex_under5.tif",
        "imr": 78.0,
    },
    {
        "short_name": "Haut Lomami",
        "long_name": "hl Haut Lomami Province",
        "under1_fp": "raw_data/drc/grid3/COD_Haut_Lomami_province_population_v4.4_agesex/COD_Haut_Lomami_population_v4_4_agesex_under1.tif",
        "under5_fp": "raw_data/drc/grid3/COD_Haut_Lomami_province_population_v4.4_agesex/COD_Haut_Lomami_population_v4_4_agesex_under5.tif",
        "imr": 75.0,
    },
    {
        "short_name": "Sud Ubangi",
        "long_name": "su Sud Ubangi Province",
        "under1_fp": "raw_data/drc/grid3/COD_Sud_Ubangi_province_population_v4.4_agesex/COD_Sud_Ubangi_population_v4_4_agesex_under1.tif",
        "under5_fp": "raw_data/drc/grid3/COD_Sud_Ubangi_province_population_v4.4_agesex/COD_Sud_Ubangi_population_v4_4_agesex_under5.tif",
        "imr": 65.0,
    },
    {
        "short_name": "Bas Uele",
        "long_name": "bu Bas Uele Province",
        "under1_fp": "raw_data/drc/grid3/COD_Bas_Uele_province_population_v4.4_agesex/COD_Bas_Uele_population_v4_4_agesex_under1.tif",
        "under5_fp": "raw_data/drc/grid3/COD_Bas_Uele_province_population_v4.4_agesex/COD_Bas_Uele_population_v4_4_agesex_under5.tif",
        "imr": 32.0,
    },
    {
        "short_name": "Equateur",
        "long_name": "eq Equateur Province",
        "under1_fp": "raw_data/drc/grid3/COD_Equateur_province_population_v4.4_agesex/COD_Equateur_population_v4_4_agesex_under1.tif",
        "under5_fp": "raw_data/drc/grid3/COD_Equateur_province_population_v4.4_agesex/COD_Equateur_population_v4_4_agesex_under5.tif",
        "imr": 40.0,
    },
    {
        "short_name": "Haut Uele",
        "long_name": "hu Haut Uele Province",
        "under1_fp": "raw_data/drc/grid3/COD_Haut_Uele_province_population_v4.4_agesex/COD_Haut_Uele_population_v4_4_agesex_under1.tif",
        "under5_fp": "raw_data/drc/grid3/COD_Haut_Uele_province_population_v4.4_agesex/COD_Haut_Uele_population_v4_4_agesex_under5.tif",
        "imr": 18.0,
    },
]

PREDICTION_COLUMNS = [
    "pred_zerodosepenta",
    "pred_zerodoseall",
    "pred_bcg",
    "pred_rota",
    "pred_var",
    "pred_vaa",
    "pred_polio",
    "pred_pcv",
]


def population_metrics_per_zone(preds: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Compute under-1 / under-5 populations, births/year and age-bracket splits.

    `births = pop_under1 / (1 - imr / 1000)`
    """
    frames = []
    for province in PROVINCES:
        zones = preds[preds.q101 == province["long_name"]][
            ["q101", "q103", "geometry"]
        ].copy()

        under1 = zonal_stats(
            zones,
            PROJECT_ROOT / province["under1_fp"],
            stats=["sum"],
            all_touched=False,
        )
        zones["pop_0_12mo"] = [s["sum"] for s in under1]

        under5 = zonal_stats(
            zones,
            PROJECT_ROOT / province["under5_fp"],
            stats=["sum"],
            all_touched=False,
        )
        zones["pop_0_5yo"] = [s["sum"] for s in under5]

        zones["imr"] = province["imr"]
        zones["births_per_year"] = zones["pop_0_12mo"] / (1 - zones["imr"] / 1000)
        zones["pop_6_12mo"] = zones["pop_0_12mo"] * 0.5
        zones["pop_12_24mo"] = (zones["pop_0_5yo"] - zones["pop_0_12mo"]) * 0.25
        zones["pop_6_24mo"] = zones["pop_6_12mo"] + zones["pop_12_24mo"]

        frames.append(zones)

    return pd.concat(frames)


def total_population_per_zone(zones: gpd.GeoDataFrame) -> list[float]:
    stats = zonal_stats(
        zones, GRIDDED_POPULATION_RASTER, stats=["sum"], all_touched=False
    )
    return [s["sum"] for s in stats]


def main() -> None:
    print(f"Reading {PREDICTIONS_GPKG.relative_to(PROJECT_ROOT)}...")
    preds = gpd.read_file(PREDICTIONS_GPKG)

    target_names = [p["long_name"] for p in PROVINCES]
    target_preds = preds[preds.q101.isin(target_names)]
    print(f"  {len(target_preds)} zones across {len(PROVINCES)} target provinces")

    print("Computing population metrics per zone...")
    data = population_metrics_per_zone(target_preds)

    print("Extracting total population per zone...")
    data["total_population"] = total_population_per_zone(data)

    print("Joining prediction columns and computing counts...")
    for col in PREDICTION_COLUMNS:
        data = data.join(target_preds.set_index("q103")[col], on="q103")
        data[f"{col}_count"] = data["pop_6_24mo"] * data[col]

    print(f"Joining antennes from {ANTENNES_CSV.name}...")
    antennes = pd.read_csv(ANTENNES_CSV)
    data = data.join(antennes.set_index("q103")[["antenne", "is_antenne"]], on="q103")

    print(f"Writing {OUT_GEOJSON.name} and {OUT_CSV.name}...")
    if OUT_GEOJSON.exists():
        OUT_GEOJSON.unlink()
    data.to_file(OUT_GEOJSON, driver="GeoJSON")
    pd.DataFrame(data).to_csv(OUT_CSV, index=False)

    print("Done.")


if __name__ == "__main__":
    main()
