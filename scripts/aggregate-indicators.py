#!/usr/bin/env python3
"""Aggregate ImmuReach household indicators with DuckDB.

Reads the household-level survey indicators and produces weighted aggregates at
three levels (zone, province, national), grouped by zero-dose status and survey
year. Survey weights ("ponderation") drive the weighted averages; sample size
(row count) and population (sum of weights) are always included.

Indicator averages are additionally min/max scaled to a 0-1 range. The scale for
each indicator is computed once per survey year from the *zone-level* averages,
pooling both zero-dose groups, and the same scale is applied to the zone,
province and national files of that year. This keeps the three levels comparable
within a year and keeps every scaled value inside [0, 1].

The scale bounds are *percentile-clipped* (5th/95th percentile of the zone
averages) rather than the raw min/max. Several indicators are heavily
right-skewed z-scores where a single outlier zone would otherwise stretch the
range and compress every typical value into a narrow band; clipping to the
p5/p95 bounds (and clamping scaled values to [0, 1]) keeps the bulk of the
distribution spread across the 0-1 range.

Outputs six CSV files (2 survey years x 3 levels) to data/output/indicators/.

Run from the project root:

    uv run scripts/aggregate-indicators.py
"""

from pathlib import Path

import duckdb

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SOURCE_CSV = PROJECT_ROOT / "data/input/immureach/indicators_households_complete.csv"
OUT_DIR = PROJECT_ROOT / "data/output/indicators"

# Numeric indicators averaged directly.
NUMERIC_INDICATORS = [
    "trust_in_hcw",
    "affordability",
    "missed_opportunities",
    "ease_to_vaccinate_children",
    "outreach",
    "community_norms",
    "fear_side_effects",
    "fear_diseases",
    "opinion_on_vaccines",
    "self_efficacy",
    "knowledge_diseases",
    "knowledge_vaccines",
    "household_travel_ohe",
]
# Boolean indicators: TRUE/FALSE -> 1/0 then averaged.
BOOLEAN_INDICATORS = ["is_max_ethnic_group"]

INDICATORS = NUMERIC_INDICATORS + BOOLEAN_INDICATORS

# Percentile bounds for the min/max scale, clipped to tame skewed outliers.
SCALE_LOW_Q = 0.05
SCALE_HIGH_Q = 0.95

# (level name, area columns selected from the source, output column aliases)
LEVELS = [
    ("zone", ["q101", "q103"], ["province", "zone"]),
    ("province", ["q101"], ["province"]),
    ("national", [], []),
]


def value_expr(indicator: str) -> str:
    """SQL expression yielding a numeric value for one household row."""
    if indicator in BOOLEAN_INDICATORS:
        return f"CASE WHEN {indicator} THEN 1.0 ELSE 0.0 END"
    return indicator


def weighted_avg_expr(indicator: str) -> str:
    """Population-weighted mean of an indicator across a group."""
    v = value_expr(indicator)
    return f"sum(ponderation * ({v})) / sum(ponderation) AS {indicator}"


def aggregate_sql(area_cols: list[str], area_aliases: list[str]) -> str:
    """Weighted aggregates grouped by survey year, area and zero-dose status."""
    select_areas = "".join(
        f"{col} AS {alias}, " for col, alias in zip(area_cols, area_aliases)
    )
    group_areas = "".join(f", {col}" for col in area_cols)
    avg_cols = ",\n        ".join(weighted_avg_expr(ind) for ind in INDICATORS)
    return f"""
        SELECT
            ecv,
            {select_areas}zero_dose_penta,
            count(*) AS n,
            sum(ponderation) AS population,
            {avg_cols}
        FROM households
        GROUP BY ecv{group_areas}, zero_dose_penta
    """


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    con = duckdb.connect()
    source = str(SOURCE_CSV).replace("'", "''")
    con.execute(
        f"CREATE VIEW households AS SELECT * FROM read_csv_auto('{source}')"
    )

    # Zone-level averages are the reference distribution for min/max scaling.
    con.execute(
        f"CREATE TABLE zone_agg AS {aggregate_sql(['q101', 'q103'], ['province', 'zone'])}"
    )

    # One percentile-clipped scale per indicator per survey year, pooled across
    # zero-dose groups (p5/p95 of the zone averages, not the raw min/max).
    scale_cols = ",\n            ".join(
        f"quantile_cont({ind}, {SCALE_LOW_Q}) AS {ind}_lo, "
        f"quantile_cont({ind}, {SCALE_HIGH_Q}) AS {ind}_hi"
        for ind in INDICATORS
    )
    con.execute(
        f"CREATE TABLE scaling AS SELECT ecv, {scale_cols} FROM zone_agg GROUP BY ecv"
    )

    years = [r[0] for r in con.execute("SELECT DISTINCT ecv FROM households ORDER BY ecv").fetchall()]

    for level, area_cols, area_aliases in LEVELS:
        if level == "zone":
            con.execute("CREATE OR REPLACE TEMP TABLE agg AS SELECT * FROM zone_agg")
        else:
            con.execute(
                f"CREATE OR REPLACE TEMP TABLE agg AS {aggregate_sql(area_cols, area_aliases)}"
            )

        # Build the scaled view: raw average followed by its 0-1 scaled value,
        # clamped to [0, 1] since values can fall outside the p5/p95 bounds.
        indicator_select = []
        for ind in INDICATORS:
            indicator_select.append(f"a.{ind}")
            indicator_select.append(
                f"coalesce(least(1.0, greatest(0.0, "
                f"(a.{ind} - s.{ind}_lo) / nullif(s.{ind}_hi - s.{ind}_lo, 0))), 0.0) "
                f"AS {ind}_scaled"
            )
        indicator_select_sql = ",\n            ".join(indicator_select)

        key_cols = "a.ecv, " + "".join(f"a.{alias}, " for alias in area_aliases)
        order_cols = "a.ecv, " + "".join(f"a.{alias}, " for alias in area_aliases) + "a.zero_dose_penta"

        for year in years:
            out_path = OUT_DIR / f"{level}_{year}.csv"
            con.execute(
                f"""
                COPY (
                    SELECT
                        {key_cols}a.zero_dose_penta,
                        a.n,
                        a.population,
                        {indicator_select_sql}
                    FROM agg a
                    JOIN scaling s USING (ecv)
                    WHERE a.ecv = ?
                    ORDER BY {order_cols}
                ) TO '{out_path}' (HEADER, DELIMITER ',')
                """,
                [year],
            )
            n_rows = con.execute(
                "SELECT count(*) FROM agg WHERE ecv = ?", [year]
            ).fetchone()[0]
            print(f"wrote {out_path.relative_to(PROJECT_ROOT)} ({n_rows} rows)")

    con.close()


if __name__ == "__main__":
    main()
