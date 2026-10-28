"""Compute ECV complete-series indicators for young children.

Reads the Stata exports in data/input/ecv/ (ECV_2022_* and ECV_2023_*) and,
for every vaccine of the routine schedule, estimates the share of children
who received EVERY dose of its series (see VACCINE_SERIES in constants.py):

  * bcg_cov    -- BCG (1 dose)
  * penta_cov  -- Penta1 + Penta2 + Penta3
  * polio_cov  -- VPO0 + VPO1 + VPO2 + VPO3
  * pcv_cov    -- PCV1 + PCV2 + PCV3
  * rota_cov   -- Rota1 + Rota2 + Rota3
  * vpi_cov    -- VPI (1 dose)
  * var_cov    -- measles (1 dose)
  * vaa_cov    -- yellow fever (1 dose)

each with its 95% CI (`<key>_cov_low` / `<key>_cov_high`). Doses are read off
the `<vaccine>_merg` columns (card and mother's recall merged, coded
1 = vaccinated, 2 = not vaccinated).

Like process-ecv-keys.py, this script only reads the file, cleans the
geography names and hands the WHOLE child-level sample plus the series
definitions to R (rscripts/rscript_indicators_ecv.R). R builds the survey
design on the full sample (strata = province `q101`, PSU = aire de sante
`q105`, weights = `ponderation`), codes the complete-series indicators, takes
each age window and milieu as domains with `subset()` and computes the
logit-transformed 95% CIs (`svyciprop(method = "logit")`).

Output: one row per national / province / zone domain, year, age group and
milieu (`all`, `urbain`, `rural`). `age_group` is the dashboard's age ribbon
filter, read off `vs25` (age in completed months): "<min>-<max>", both bounds
included (see AGE_GROUPS in constants.py), as in ecv_vaccination_coverage.csv.

Requires R with the `survey` package installed. Run from the project root:

    python -m scripts.ecv.process-ecv-indicators [--rscript /path/to/Rscript]
    python -m scripts.ecv.process-ecv-indicators --age-groups 6-23 --milieux all
"""

import argparse
import importlib
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pandas as pd

import scripts.ecv.constants as cst

# Reuse the key-figures loader: same columns, same name cleaning.
keys = importlib.import_module("scripts.ecv.process-ecv-keys")


def write_spec(path: Path) -> list[str]:
    """One row per series: its key and its `_merg` columns, `|`-separated."""
    spec = pd.DataFrame(
        {
            "key": list(cst.VACCINE_SERIES),
            "columns": [
                "|".join(cst.VACCINES_MAPPING[dose] for dose in doses)
                for doses in cst.VACCINE_SERIES.values()
            ],
        }
    )
    spec.to_csv(path, index=False)
    return list(spec["key"])


def run_survey_r(
    df: pd.DataFrame,
    rscript: str,
    workdir: Path,
    milieux: list[str],
    age_groups: list[str],
) -> pd.DataFrame:
    """Hand the child-level frame to R's `survey` and read the estimates back.

    Domains travel as integer ids rather than names so that accented zone
    names cannot be mangled crossing the Python/R boundary.
    """
    provinces = sorted(df["province"].unique())
    zones = sorted(df["zone_key"].unique())
    psus = sorted(df["psu_key"].unique())
    province_ids = {name: i for i, name in enumerate(provinces)}
    zone_ids = {name: i for i, name in enumerate(zones)}
    psu_ids = {name: i for i, name in enumerate(psus)}

    extract = pd.DataFrame(
        {
            "stratum_id": df["province"].map(province_ids),
            "province_id": df["province"].map(province_ids),
            "zone_id": df["zone_key"].map(zone_ids),
            "psu_id": df["psu_key"].map(psu_ids),
            "weight": df["weight"],
            "age": df["age"],
            "milieu": df["milieu"],
            **{col: df[col] for col in keys.VACCINES_COLUMNS},
        }
    )

    in_csv = workdir / "ecv_extract.csv"
    spec_csv = workdir / "ecv_series.csv"
    out_csv = workdir / "ecv_estimates.csv"
    extract.to_csv(in_csv, index=False)
    write_spec(spec_csv)

    proc = subprocess.run(
        [
            rscript,
            "--vanilla",
            str(cst.R_INDICATORS_PATH),
            str(in_csv),
            str(out_csv),
            str(spec_csv),
            ",".join(age_groups),
            ",".join(milieux),
        ],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"Rscript failed (exit {proc.returncode}).\n"
            f"--- stdout ---\n{proc.stdout}\n--- stderr ---\n{proc.stderr}"
        )

    id_to_province = {i: name for name, i in province_ids.items()}
    id_to_zone = {i: name for name, i in zone_ids.items()}

    if proc.stderr.strip():
        sys.stdout.flush()
        print(
            keys.label_domains(proc.stderr.rstrip(), id_to_province, id_to_zone),
            file=sys.stderr,
        )
        sys.stderr.flush()

    est = pd.read_csv(out_csv)
    zone_names = df.drop_duplicates("zone_key").set_index("zone_key")
    zone_key = est["domain_id"].map(id_to_zone)
    est["province"] = (
        est["domain_id"].map(id_to_province).where(est["level"] == "province")
    )
    is_zone = est["level"] == "zone"
    est.loc[is_zone, "province"] = zone_key[is_zone].map(zone_names["province"])
    est["zone"] = zone_key.map(zone_names["zone"]).where(is_zone)
    return est.drop(columns=["domain_id"])


def process_file(
    dta_path: Path,
    year: str,
    rscript: str,
    milieux: list[str],
    workdir: Path | None,
    age_groups: list[str],
) -> pd.DataFrame:
    print(f"reading {dta_path.name} ...")
    df = keys.load_year(dta_path)
    print(
        f"  {len(df):,} children in {df['zone_key'].nunique()} zones / "
        f"{df['psu_key'].nunique()} areas"
    )

    print("  running R survey estimation ...")
    if workdir is None:
        with tempfile.TemporaryDirectory(prefix=f"ecv-ind-{year}-") as tmp:
            est = run_survey_r(df, rscript, Path(tmp), milieux, age_groups)
    else:
        run_dir = workdir / year
        run_dir.mkdir(parents=True, exist_ok=True)
        est = run_survey_r(df, rscript, run_dir, milieux, age_groups)
        print(f"  kept R inputs/outputs in {run_dir}")

    est["nb_people"] = est["nb_people"].astype("Int64")
    est["year"] = cst.COLLECTION_YEAR.get(year, year)
    # Age group and milieu in the order asked for, then national / province /
    # zone by name.
    est["age_rank"] = est["age_group"].map({a: i for i, a in enumerate(age_groups)})
    est["milieu_rank"] = est["milieu"].map({m: i for i, m in enumerate(milieux)})
    est["level_rank"] = est["level"].map({"national": 0, "province": 1, "zone": 2})
    est = est.sort_values(
        ["age_rank", "milieu_rank", "level_rank", "province", "zone"],
        na_position="first",
    )
    return est.drop(columns=["age_rank", "milieu_rank", "level_rank"])


def resolve_rscript(explicit: str | None) -> str:
    """Locate Rscript, failing with something actionable if it is missing."""
    rscript = explicit or shutil.which("Rscript")
    if not cst.R_INDICATORS_PATH.exists():
        raise RuntimeError(f"R survey script not found: {cst.R_INDICATORS_PATH}")
    if rscript is None or not Path(rscript).exists():
        raise RuntimeError(
            "Rscript not found on PATH (pass --rscript). This script delegates "
            "the survey-design estimation to R's `survey` package."
        )
    return rscript


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=cst.OUT_INDICATORS_ECV_PATH,
        help="destination CSV (default: "
        f"{cst.OUT_INDICATORS_ECV_PATH.relative_to(cst.PROJECT_ROOT)})",
    )
    parser.add_argument(
        "--rscript",
        default=None,
        help="path to the Rscript executable (default: Rscript on PATH)",
    )
    parser.add_argument(
        "--milieux",
        default=",".join(cst.MILIEUX),
        help="comma-separated subset of milieu domains to estimate "
        f"(default: {','.join(cst.MILIEUX)})",
    )
    parser.add_argument(
        "--age-groups",
        default=",".join(cst.AGE_GROUPS),
        help="comma-separated subset of age groups to estimate (both bounds "
        f"included, completed months; default: {','.join(cst.AGE_GROUPS)})",
    )
    parser.add_argument(
        "--workdir",
        type=Path,
        default=None,
        help="keep each year's R extract and raw estimates in this directory "
        "instead of a temporary one",
    )
    args = parser.parse_args()

    milieux = [m.strip() for m in args.milieux.split(",") if m.strip()]
    unknown = [m for m in milieux if m not in cst.MILIEUX]
    if unknown:
        raise SystemExit(f"unknown milieu(x): {unknown}\nknown milieux: {cst.MILIEUX}")
    age_groups = [a.strip() for a in args.age_groups.split(",") if a.strip()]
    unknown = [a for a in age_groups if a not in cst.AGE_GROUPS]
    if unknown:
        raise SystemExit(
            f"unknown age group(s): {unknown}\nknown age groups: {list(cst.AGE_GROUPS)}"
        )
    rscript = resolve_rscript(args.rscript)

    frames = []
    for year in cst.COLLECTION_YEAR:
        matches = sorted(cst.INPUT_DIR.glob(f"ECV_{year}_*.dta"))
        if not matches:
            raise FileNotFoundError(f"no ECV_{year}_*.dta in {cst.INPUT_DIR}")
        frames.append(
            process_file(
                matches[0],
                year,
                rscript,
                milieux,
                args.workdir,
                age_groups,
            )
        )

    output = pd.concat(frames, ignore_index=True)
    indicator_cols = [
        f"{key}_cov{suffix}"
        for key in cst.VACCINE_SERIES
        for suffix in ("", "_low", "_high")
    ]
    output = output[
        ["year", "age_group", "milieu", "level", "province", "zone", "nb_people", *indicator_cols]
    ]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(args.output, index=False)
    print(f"wrote {args.output} ({len(output)} rows)")


if __name__ == "__main__":
    main()
