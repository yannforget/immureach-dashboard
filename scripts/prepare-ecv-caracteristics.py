"""Clean and reshape the EPSK ECV vaccination-coverage survey extract.

Reads the raw health-zone-level survey export and writes a tidy runtime CSV
consumed directly by the dashboard.

Input columns (raw, from EPSK): Year, Level, Province, ZS, Nbr_children,
Possession_carte_pct/_95CI, Mere_pct/_95CI, Gardienne_pct/_95CI

TO DO: Update weighted mean using weights instead of population, and tailor to stats

Run from the project root:

    uv run scripts/prepare-ecv-caracteristics.py
"""

import re
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
INPUT_DIR = PROJECT_ROOT / "data" / "input" / "espk"
OUT_CSV = PROJECT_ROOT / "public/data/ecv_caracteristics.csv"

METRICS = [
    "possession_carte",
    "mere",
    "gardienne",
]


def weighted_mean(values, weights):  ## NEED TO BE CHANGE FOR STATS ##
    weights = weights.fillna(0)
    values = values.fillna(0)
    if weights.sum() == 0:
        return None
    return (values * weights).sum() / weights.sum()


def parse_CI(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    """
    Parse Confidence Interval columns into two new columns _low _high and return the modified dataframe.
    """
    df = df.copy()
    for col in cols:
        values = (
            df[col]
            .astype(str)
            .str.replace(r"[\[\]]", "", regex=True)
            .str.split("-", expand=True)
        )

        prefix = re.sub(r"_95ci$", "", col)

        df[f"{prefix}_low"] = values[0].str.replace(",", ".", regex=False).astype(float)

        df[f"{prefix}_high"] = (
            values[1].str.replace(",", ".", regex=False).astype(float)
        )
    df = df.drop(cols, axis=1)
    return df


def process_file(csv_path: Path) -> pd.DataFrame:
    year = csv_path.stem[3:7]
    raw = pd.read_csv(csv_path)
    raw.columns = raw.columns.str.lower()
    raw[["province", "zs"]] = raw[["province", "zs"]].apply(lambda x: x.str.strip())
    raw = raw.rename(columns={"zs": "zone", "nbr_children": "nb_children"})

    df = parse_CI(raw, [metric + "_95ci" for metric in METRICS])
    metric_cols = [
        col for col in df.columns if any(col.startswith(f"{root}_") for root in METRICS)
    ]
    zone = df[
        [
            "province",
            "zone",
            "nb_children",  # to replace by weights
        ]
        + metric_cols
    ].copy()
    zone["level"] = "zone"
    zone["year"] = year

    weighted_cols = [
        col for col in metric_cols if col.endswith(("_pct", "_low", "_high"))
    ]
    province = (
        df.groupby("province")
        .apply(
            lambda g: pd.Series(
                {
                    "nb_children": g["nb_children"].sum(),
                    **{
                        col: weighted_mean(g[col], g["nb_children"]).round(1)
                        for col in weighted_cols
                    },
                }
            )
        )
        .reset_index()
    )
    province["zone"] = None
    province["level"] = "province"
    province["year"] = year

    national = pd.DataFrame(
        [
            {
                "province": None,
                "zone": None,
                "nb_children": df["nb_children"].sum(),
                **{
                    col: weighted_mean(df[col], df["nb_children"]).round(1)
                    for col in weighted_cols
                },
                "level": "national",
                "year": year,
            }
        ]
    )

    return pd.concat([zone, province, national], ignore_index=True)


def main() -> None:

    files = sorted(INPUT_DIR.glob("ECV*_Caracteristics.csv"))
    frames = [process_file(f) for f in files]
    output = pd.concat(frames, ignore_index=True)
    output.to_csv(OUT_CSV, index=False)
    print(f"wrote {OUT_CSV} ({len(output)} rows)")


if __name__ == "__main__":
    main()
