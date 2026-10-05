"""Compute ECV key figures for young children from the raw survey microdata.

Reads the Stata exports in data/input/ecv/ (ECV_2022_* and ECV_2023_*) and
derives the two headline indicators the dashboard shows, for children inside
the age window (`vs25`, age in completed months; see AGE_MIN_MONTHS):

  * penta_cov -- Penta3 coverage (3rd dose of the pentavalent vaccine)
  * zdc_cov   -- zero-dose children (no antigen at all)

Both are built from the `<vaccine>_merg` columns, which merge the vaccination
card with the mother's recall and are coded 1 = vaccinated, 2 = not vaccinated.

This script only reads the file, cleans the geography names and hands the
WHOLE child-level sample to R (rscripts/rscript_key_ecv.R) via `subprocess`.
Everything else happens in R: the survey design is built on the full sample
(strata = province `q101`, PSU = aire de sante `q105`, weights =
`ponderation`), the age window and the milieu are then taken as domains with
`subset()`, and R codes the indicators, counts the unweighted sample sizes and
computes the logit-transformed 95% CIs (`svyciprop(method = "logit")`).
Filtering the data before `svydesign()` would understate the design's PSU
counts per stratum and so misstate the variance.

Output mirrors the KeyEcvRow schema consumed by the dashboard
(src/types/index.ts): one row per national / province / zone domain, year and
milieu.

`milieu` is the dashboard's rural/urbain ribbon filter, read off `q108`
("Milieu de localisation du menage"): every domain is estimated three times,
once on the whole sample (`all`) and once on each q108 modality (`urbain`,
`rural`). See MILIEUX. `nb_zones` counts the health zones the *survey*
reached, so it reads the same under every milieu.

`survey_start` / `survey_end` bound the fieldwork in the domain: the first and
last interview date (`q117`) over every child of the file, whatever the age or
milieu. Implausible dates (typos, see MAX_UPLOAD_LAG_DAYS) are ignored.

Requires R with the `survey` package installed:

    Rscript -e 'install.packages("survey", repos = "https://cloud.r-project.org")'

Run from the project root:

    python -m scripts.ecv.process-ecv-keys
"""

import argparse
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pandas as pd

import scripts.ecv.constants as cst
from scripts.ecv import utils

# `<vaccine>_merg` columns common to the 2022 and 2023 questionnaires: card
# and history merged, coded 1 = vaccinated / 2 = not vaccinated. A child is
# zero-dose when every one of these is 2. The 2023 file additionally carries
# `vpi2_merg` / `var2_merg`; those are second doses, so they cannot turn a
# zero-dose child into a vaccinated one and are left out to keep the two years
# on the same definition.
VACCINES_COLUMNS = list(cst.VACCINES_MAPPING.values())

LOAD_COLUMNS = [
    cst.STRATUM_COL,
    cst.ZONE_COL,
    cst.AREA_COL,
    cst.WEIGHT_COL,
    cst.AGE_COL,
    cst.AREAS_TOTAL_COL,
    cst.MILIEU_COL,
    cst.INTERVIEW_DATE_COL,
    cst.SUBMISSION_DATE_COL,
] + VACCINES_COLUMNS


def load_year(dta_path: Path) -> pd.DataFrame:
    """Read one ECV Stata export into the child-level frame handed to R."""
    raw = pd.read_stata(dta_path, columns=LOAD_COLUMNS, convert_categoricals=False)

    df = pd.DataFrame(
        {
            "province": utils.clean_name(raw[cst.STRATUM_COL]),
            "zone": utils.clean_name(raw[cst.ZONE_COL]),
            "area": utils.clean_name(raw[cst.AREA_COL]),
            "weight": pd.to_numeric(raw[cst.WEIGHT_COL], errors="coerce"),
            "age": pd.to_numeric(raw[cst.AGE_COL], errors="coerce"),
            "nb_areas_tot": pd.to_numeric(raw[cst.AREAS_TOTAL_COL], errors="coerce"),
            "milieu": pd.to_numeric(raw[cst.MILIEU_COL], errors="coerce").map(
                cst.MILIEU_BY_CODE
            ),
            # ISO strings: q117 is a string in the 2022 file, a date in 2023.
            "interview_date": pd.to_datetime(
                raw[cst.INTERVIEW_DATE_COL], errors="coerce"
            ).dt.strftime("%Y-%m-%d"),
            "submission_date": pd.to_datetime(
                raw[cst.SUBMISSION_DATE_COL], errors="coerce"
            ).dt.strftime("%Y-%m-%d"),
        }
    )
    for col in VACCINES_COLUMNS:
        df[col] = pd.to_numeric(raw[col], errors="coerce")

    # An aire de sante name is not unique nationally, so key the PSU on the zone.
    df["zone_key"] = df["province"] + " | " + df["zone"]
    df["psu_key"] = df["zone_key"] + " | " + df["area"]
    return df


def label_domains(
    text: str, id_to_province: dict[int, str], id_to_zone: dict[int, str]
) -> str:
    def repl(match: re.Match[str]) -> str:
        level, raw_id = match.group(1), int(match.group(2))
        name = (id_to_province if level == "province" else id_to_zone).get(raw_id)
        return f"{level} {name}" if name else match.group(0)

    return re.compile(r"\b(province|zone) id=(-?\d+)").sub(repl, text)


def run_survey_r(
    df: pd.DataFrame,
    workdir: Path,
    milieux: list[str],
    age_min: int,
    age_max: int,
) -> pd.DataFrame:
    """Hand the child-level frame to R's `survey` and read the estimates back.

    R does the filtering (age window, milieu), the indicator coding, the
    counts and the estimation; see rscript_key_ecv.R. Domains travel as
    integer ids rather than names so that accented zone names cannot be
    mangled crossing the Python/R boundary.
    """
    rscript = shutil.which("Rscript")
    if rscript is None:
        raise RuntimeError(
            "Rscript not found on PATH. This script delegates the survey-design "
            "estimation to R's `survey` package."
        )

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
            "nb_areas_tot": df["nb_areas_tot"],
            "interview_date": df["interview_date"],
            "submission_date": df["submission_date"],
            **{col: df[col] for col in VACCINES_COLUMNS},
        }
    )

    in_csv = workdir / "ecv_extract.csv"
    out_csv = workdir / "ecv_estimates.csv"
    extract.to_csv(in_csv, index=False)

    proc = subprocess.run(
        [
            rscript,
            "--vanilla",
            str(cst.R_KEY_PATH),
            str(in_csv),
            str(out_csv),
            str(age_min),
            str(age_max),
            ",".join(milieux),
            str(cst.MAX_UPLOAD_LAG_DAYS),
        ],
        capture_output=True,
        text=True,
    )
    # capture_output=True with text=True makes proc.stdout/proc.stderr plain
    # strings -- they are not file objects, so no .read()/.readline() on them.
    if proc.returncode != 0:
        raise RuntimeError(
            f"Rscript failed (exit {proc.returncode}).\n"
            f"--- stdout ---\n{proc.stdout}\n--- stderr ---\n{proc.stderr}"
        )

    id_to_province = {i: name for name, i in province_ids.items()}
    id_to_zone = {i: name for name, i in zone_ids.items()}

    if proc.stderr.strip():
        # R reports its progress, cross-check and warning summary on stderr;
        # flush stdout first so the two streams stay in order when piped.
        sys.stdout.flush()
        print(
            label_domains(proc.stderr.rstrip(), id_to_province, id_to_zone),
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
    milieux: list[str],
    workdir: Path | None = None,
    age_min: int = cst.AGE_MIN_MONTHS,
    age_max: int = cst.AGE_MAX_MONTHS,
) -> pd.DataFrame:
    print(f"reading {dta_path.name} ...")
    df = load_year(dta_path)
    print(
        f"  {len(df):,} children in {df['zone_key'].nunique()} zones / "
        f"{df['psu_key'].nunique()} areas"
    )

    print("  running R survey estimation ...")
    if workdir is None:
        with tempfile.TemporaryDirectory(prefix=f"ecv-{year}-") as tmp:
            estimations = run_survey_r(df, Path(tmp), milieux, age_min, age_max)
    else:
        run_dir = workdir / year
        run_dir.mkdir(parents=True, exist_ok=True)
        estimations = run_survey_r(df, run_dir, milieux, age_min, age_max)
        print(f"  kept R inputs/outputs in {run_dir}")

    count_cols = ["nb_people", "nb_zones", "nb_areas", "nb_areas_tot"]
    estimations[count_cols] = estimations[count_cols].astype("Int64")
    estimations["year"] = cst.COLLECTION_YEAR.get(year, year)
    # Milieu in the order asked for, then national / province / zone by name.
    estimations["milieu_rank"] = estimations["milieu"].map(
        {m: i for i, m in enumerate(milieux)}
    )
    estimations["level_rank"] = estimations["level"].map(
        {"national": 0, "province": 1, "zone": 2}
    )
    estimations = estimations.sort_values(
        ["milieu_rank", "level_rank", "province", "zone"], na_position="first"
    )
    return estimations.drop(columns=["milieu_rank", "level_rank"])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=cst.OUT_KEY_ECV_PATH,
        help=f"destination CSV (default: {cst.OUT_KEY_ECV_PATH.relative_to(cst.PROJECT_ROOT)})",
    )
    parser.add_argument(
        "--milieux",
        default=",".join(cst.MILIEUX),
        help="comma-separated subset of milieu domains to estimate "
        f"(default: {','.join(cst.MILIEUX)})",
    )
    parser.add_argument(
        "--age-min",
        type=int,
        default=cst.AGE_MIN_MONTHS,
        help=f"youngest age in completed months (default: {cst.AGE_MIN_MONTHS})",
    )
    parser.add_argument(
        "--age-max",
        type=int,
        default=cst.AGE_MAX_MONTHS,
        help=f"oldest age in completed months (default: {cst.AGE_MAX_MONTHS})",
    )
    parser.add_argument(
        "--workdir",
        type=Path,
        default=None,
        help=(
            "keep each year's R extract and raw estimates in this "
            "directory instead of a temporary one (useful for re-running the "
            "R step by hand, e.g. to chase down warnings)"
        ),
    )
    args = parser.parse_args()

    milieux = [m.strip() for m in args.milieux.split(",") if m.strip()]
    unknown = [m for m in milieux if m not in cst.MILIEUX]
    if unknown:
        raise SystemExit(f"unknown milieu(x): {unknown}\nknown milieux: {cst.MILIEUX}")

    frames = []
    for year in cst.COLLECTION_YEAR:
        matches = sorted(cst.INPUT_DIR.glob(f"ECV_{year}_*.dta"))
        if not matches:
            raise FileNotFoundError(f"no ECV_{year}_*.dta in {cst.INPUT_DIR}")
        frames.append(
            process_file(
                matches[0], year, milieux, args.workdir, args.age_min, args.age_max
            )
        )

    output = pd.concat(frames, ignore_index=True)
    output = output[
        [
            "year",
            "milieu",
            "level",
            "province",
            "zone",
            "nb_people",
            "nb_zones",
            "nb_areas",
            "nb_areas_tot",
            "survey_start",
            "survey_end",
            "penta_cov",
            "penta_cov_low",
            "penta_cov_high",
            "zdc_cov",
            "zdc_cov_low",
            "zdc_cov_high",
        ]
    ]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(args.output, index=False)
    print(f"wrote {args.output} ({len(output)} rows)")


if __name__ == "__main__":
    main()
