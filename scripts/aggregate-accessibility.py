#!/usr/bin/env python3
"""Aggregate ImmuReach accessibility data with DuckDB.

Reads per-year zone-level accessibility CSVs (travel time of children — total
and zero-dose — to the nearest health facility) and produces three levels of
aggregates: zone (passthrough, geometry dropped), province (level_2_name) and
national. Population counts (n, n_0d, n_{minutes}mn, n_0d_{minutes}mn) are
summed; mean_travel is averaged weighted by n; mean_travel_0d is averaged
weighted by n_0d. Median columns are skipped.

Outputs six CSV files (2 years x 3 levels) to data/output/accessibility/.

Run from the project root:

    uv run scripts/aggregate-accessibility.py
"""

from pathlib import Path

import duckdb

PROJECT_ROOT = Path(__file__).resolve().parent.parent
INPUT_DIR = PROJECT_ROOT / "data/input/immureach"
OUT_DIR = PROJECT_ROOT / "data/output/accessibility"

YEARS = [2022, 2023]

THRESHOLDS = [30, 60, 90, 120, 150, 180]

# Columns summed across rows when aggregating.
SUM_COLS = ["n", "n_0d"] + [
    col
    for t in THRESHOLDS
    for col in (f"n_{t}mn", f"n_0d_{t}mn")
]


def weighted_avg(col: str, weight: str) -> str:
    return (
        f"CASE WHEN sum({weight}) > 0 "
        f"THEN sum({col} * {weight}) / sum({weight}) ELSE NULL END AS {col}"
    )


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()

    sum_select = ", ".join(f"sum({c}) AS {c}" for c in SUM_COLS)
    mean_travel = weighted_avg("mean_travel", "n")
    mean_travel_0d = weighted_avg("mean_travel_0d", "n_0d")

    for year in YEARS:
        source = INPUT_DIR / f"accessibility_{year}.csv"
        source_sql = str(source).replace("'", "''")
        con.execute(
            f"CREATE OR REPLACE TEMP VIEW src AS "
            f"SELECT * EXCLUDE (geometry) FROM read_csv_auto('{source_sql}')"
        )

        zone_path = OUT_DIR / f"zone_{year}.csv"
        con.execute(
            f"COPY (SELECT * FROM src ORDER BY level_2_name, level_3_name) "
            f"TO '{zone_path}' (HEADER, DELIMITER ',')"
        )
        n_zone = con.execute("SELECT count(*) FROM src").fetchone()[0]
        print(f"wrote {zone_path.relative_to(PROJECT_ROOT)} ({n_zone} rows)")

        province_path = OUT_DIR / f"province_{year}.csv"
        con.execute(
            f"""
            COPY (
                SELECT
                    level_2_name,
                    {mean_travel},
                    {mean_travel_0d},
                    {sum_select}
                FROM src
                GROUP BY level_2_name
                ORDER BY level_2_name
            ) TO '{province_path}' (HEADER, DELIMITER ',')
            """
        )
        n_prov = con.execute(
            "SELECT count(DISTINCT level_2_name) FROM src"
        ).fetchone()[0]
        print(f"wrote {province_path.relative_to(PROJECT_ROOT)} ({n_prov} rows)")

        national_path = OUT_DIR / f"national_{year}.csv"
        con.execute(
            f"""
            COPY (
                SELECT
                    {mean_travel},
                    {mean_travel_0d},
                    {sum_select}
                FROM src
            ) TO '{national_path}' (HEADER, DELIMITER ',')
            """
        )
        print(f"wrote {national_path.relative_to(PROJECT_ROOT)} (1 row)")

    con.close()


if __name__ == "__main__":
    main()
