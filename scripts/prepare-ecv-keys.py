import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
INPUT_DIR = ROOT / "data" / "input" / "espk"
OUTPUT_FILE = ROOT / "public" / "data" / "key_ecv.csv"


def weighted_mean(values, weights):
    weights = weights.fillna(0)
    values = values.fillna(0)
    if weights.sum() == 0:
        return None
    return (values * weights).sum() / weights.sum()


def parse_ci(values) -> tuple[pd.Series, pd.Series]:
    """
    Parse 95%-CI cells shaped like "[13,0-36,6]" into low/high numeric Series
    (comma decimal separator, dash separator), mirroring
    prepare-ecv-vaccination-coverage.py.
    """
    split = (
        values.astype(str)
        .str.replace(r"[\[\]]", "", regex=True)
        .str.split("-", expand=True)
    )
    low = pd.to_numeric(split[0].str.replace(",", ".", regex=False), errors="coerce")
    high = pd.to_numeric(split[1].str.replace(",", ".", regex=False), errors="coerce")
    return low, high


def process_file(csv_path: Path) -> pd.DataFrame:
    year = csv_path.stem[3:7]
    df = pd.read_csv(csv_path)
    df = df.rename(
        columns={
            "Province": "province",
            "ZS": "zone",
            "Nbr_children": "nb_people",
            "NbreAS": "nb_areas_tot",
            "as_enq": "nb_areas",
            "Penta3_pct": "penta_cov",
            "Zero_dose_pct": "zdc_cov",
        }
    )
    df[["province", "zone"]] = df[["province", "zone"]].apply(
        lambda col: col.str.strip()
    )

    penta_low, penta_high = parse_ci(df["Penta3_95CI"])
    zdc_low, zdc_high = parse_ci(df["Zero_dose_95CI"])
    df["penta_cov_low"] = penta_low
    df["penta_cov_high"] = penta_high
    df["zdc_cov_low"] = zdc_low
    df["zdc_cov_high"] = zdc_high

    zone = df[
        [
            "province",
            "zone",
            "nb_people",
            "nb_areas",
            "nb_areas_tot",
            "penta_cov",
            "zdc_cov",
            "penta_cov_low",
            "penta_cov_high",
            "zdc_cov_low",
            "zdc_cov_high",
        ]
    ].copy()
    zone["nb_zones"] = 1
    zone["level"] = "zone"
    zone["year"] = year

    province = (
        df.groupby("province")
        .apply(
            lambda g: pd.Series(
                {
                    "nb_people": g["nb_people"].sum(),
                    "nb_zones": g["zone"].nunique(),
                    "nb_areas": g["nb_areas"].sum(),
                    "nb_areas_tot": g["nb_areas_tot"].sum(),
                    "penta_cov": weighted_mean(g["penta_cov"], g["nb_people"]),
                    "zdc_cov": weighted_mean(g["zdc_cov"], g["nb_people"]),
                    "penta_cov_low": weighted_mean(g["penta_cov_low"], g["nb_people"]),
                    "penta_cov_high": weighted_mean(g["penta_cov_high"], g["nb_people"]),
                    "zdc_cov_low": weighted_mean(g["zdc_cov_low"], g["nb_people"]),
                    "zdc_cov_high": weighted_mean(g["zdc_cov_high"], g["nb_people"]),
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
                "nb_people": df["nb_people"].sum(),
                "nb_zones": df["zone"].nunique(),
                "nb_areas": df["nb_areas"].sum(),
                "nb_areas_tot": df["nb_areas_tot"].sum(),
                "penta_cov": weighted_mean(df["penta_cov"], df["nb_people"]),
                "zdc_cov": weighted_mean(df["zdc_cov"], df["nb_people"]),
                "penta_cov_low": weighted_mean(df["penta_cov_low"], df["nb_people"]),
                "penta_cov_high": weighted_mean(df["penta_cov_high"], df["nb_people"]),
                "zdc_cov_low": weighted_mean(df["zdc_cov_low"], df["nb_people"]),
                "zdc_cov_high": weighted_mean(df["zdc_cov_high"], df["nb_people"]),
                "level": "national",
                "year": year,
            }
        ]
    )

    return pd.concat([zone, province, national], ignore_index=True)


def main():
    files = sorted(INPUT_DIR.glob("ECV*_vacc_cov_ZS.csv"))
    frames = [process_file(f) for f in files]
    output = pd.concat(frames, ignore_index=True)
    output.to_csv(OUTPUT_FILE, index=False)


if __name__ == "__main__":
    main()
