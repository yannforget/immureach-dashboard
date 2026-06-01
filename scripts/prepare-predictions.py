#!/usr/bin/env python3
"""Prepare ImmuReach predictions for the dashboard.

Reads the zone-level predictions GeoPackage and joins it with the population
table (data/output/population/zones.csv) to attach pop_6_24mo as the aggregation
weight. Produces three CSVs in data/output/predictions/:

  - zones.csv:     one row per health zone with all pred_* columns
  - provinces.csv: one row per province, pred_* averaged across zones weighted
                   by pop_6_24mo
  - country.csv:   one row, pred_* averaged across all zones weighted by
                   pop_6_24mo

Run: uv run scripts/prepare-predictions.py
"""

from pathlib import Path

import geopandas as gpd
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent

PREDICTIONS_GPKG = PROJECT_ROOT / "data/input/immureach/data_and_predictions_260317.gpkg"
POPULATION_ZONES_CSV = PROJECT_ROOT / "data/output/population/zones.csv"

OUT_DIR = PROJECT_ROOT / "data/output/predictions"
OUT_ZONES = OUT_DIR / "zones.csv"
OUT_PROVINCES = OUT_DIR / "provinces.csv"
OUT_COUNTRY = OUT_DIR / "country.csv"

PRED_COLS = [
    "pred_zerodosepenta",
    "pred_zerodoseall",
    "pred_bcg",
    "pred_rota",
    "pred_var",
    "pred_vaa",
    "pred_polio",
    "pred_pcv",
]

WEIGHT_COL = "pop_6_24mo"


def weighted_average(df: pd.DataFrame, value_cols: list[str], weight_col: str) -> pd.Series:
    """Weighted mean of `value_cols` using `weight_col` as the weight."""
    w = df[weight_col]
    return pd.Series(
        {col: (df[col] * w).sum() / w.sum() for col in value_cols}
    )


def main() -> None:
    print(f"Reading {PREDICTIONS_GPKG.relative_to(PROJECT_ROOT)}...")
    preds = gpd.read_file(PREDICTIONS_GPKG)
    preds = pd.DataFrame(preds.drop(columns="geometry"))
    print(f"  {len(preds)} zones, {preds['q101'].nunique()} provinces")

    print(f"Reading {POPULATION_ZONES_CSV.relative_to(PROJECT_ROOT)}...")
    pop = pd.read_csv(POPULATION_ZONES_CSV)

    merged = preds.merge(
        pop[["level_2_name", "level_3_name", WEIGHT_COL]],
        left_on=["q101", "q103"],
        right_on=["level_2_name", "level_3_name"],
        how="left",
        validate="one_to_one",
    )

    unmatched = merged[merged["level_2_name"].isna()]
    if not unmatched.empty:
        raise LookupError(
            f"No population row for {len(unmatched)} zones, e.g. "
            f"{unmatched[['q101', 'q103']].head().to_dict('records')}"
        )

    # Some zones have NaN population (missing from GRID3 rasters). Keep them in
    # the zone-level output but exclude from weighted aggregates.
    missing_pop = merged[merged[WEIGHT_COL].isna()][["q101", "q103"]]
    if not missing_pop.empty:
        print(
            f"  warning: {len(missing_pop)} zones lack population data and "
            f"will be excluded from weighted aggregates:"
        )
        for _, row in missing_pop.iterrows():
            print(f"    - {row['q101']} / {row['q103']}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Zone-level output
    zone_out = merged[["q101", "q103", *PRED_COLS]].rename(
        columns={"q101": "province", "q103": "zone"}
    )
    zone_out.to_csv(OUT_ZONES, index=False)
    print(f"wrote {OUT_ZONES.relative_to(PROJECT_ROOT)} ({len(zone_out)} rows)")

    # Province-level: weighted mean of pred_* across zones
    province_out = (
        merged.groupby("q101", sort=True)
        .apply(lambda g: weighted_average(g, PRED_COLS, WEIGHT_COL), include_groups=False)
        .reset_index()
        .rename(columns={"q101": "province"})
    )
    province_out.to_csv(OUT_PROVINCES, index=False)
    print(f"wrote {OUT_PROVINCES.relative_to(PROJECT_ROOT)} ({len(province_out)} rows)")

    # Country-level: single row, weighted across all zones
    country_out = weighted_average(merged, PRED_COLS, WEIGHT_COL).to_frame().T
    country_out.to_csv(OUT_COUNTRY, index=False)
    print(f"wrote {OUT_COUNTRY.relative_to(PROJECT_ROOT)} (1 row)")


if __name__ == "__main__":
    main()
