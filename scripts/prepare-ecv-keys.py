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

    zone = df[
        [
            "province",
            "zone",
            "nb_people",
            "nb_areas",
            "nb_areas_tot",
            "penta_cov",
            "zdc_cov",
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
