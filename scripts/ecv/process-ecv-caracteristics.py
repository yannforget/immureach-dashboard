"""Compute ECV household/child characteristics from the raw survey microdata.

Reads the Stata exports in data/input/ecv/ (ECV_2022_* and ECV_2023_*) and
writes public/data/ecv_caracteristics.csv -- one row per national / province /
zone domain, year, age group and milieu, with a `_pct` / `_low` / `_high`
triplet per variable (point estimate and 95% confidence interval, 0-100).

`age_group` is the dashboard's age ribbon filter, read off `vs25` (age in
completed months): R estimates every domain once per window of AGE_GROUPS
(6-11, 12-23 and 6-23 months, both bounds included), each as a domain of the
same full-sample design.

`milieu` is the dashboard's rural/urbain ribbon filter, read off `q108`
("Milieu de localisation du menage"): every domain is estimated three times,
once on the whole sample (`all`) and once on each q108 modality (`urbain`,
`rural`). See MILIEUX.

This script only reads the file, cleans the geography names and hands the
WHOLE child-level sample -- with the raw source columns and an indicator spec
table -- to R (rscripts/rscript_caracteristics.R) via `subprocess`. Everything
else happens in R: the survey design is built on the full sample (strata =
province `q101`, PSU = aire de sante `q105`, weights = `ponderation`), the age
window, the drawable zones and the milieu are then taken as domains with
`subset()`, and R codes the indicators, counts the unweighted sample sizes and
computes the logit-transformed 95% CIs (`svyciprop(method = "logit")`).
Filtering the data before `svydesign()` would understate the design's PSU
counts per stratum and so misstate the variance.

This is the file behind the characteristics bar chart at the bottom right of
the dashboard's first tab. What each variable means, which column it is read
off and how the two rounds differ all live in scripts/ecv/indicators.py;
adding an entry to its INDICATORS table puts a `<root>_pct/_low/_high` family
in the header; to chart it, list the root in ECV_CARACTERISTIC_KEYS and give it
a French label in ECV_CARACTERISTIC_VARIABLE_LABELS, plus an
ECV_CARACTERISTIC_GROUPS entry when several variables belong on one tab
(src/lib/utils/constants.ts). Roots absent from ECV_CARACTERISTIC_KEYS are
parsed but never drawn.

Province and zone names are canonicalised against
data/output/boundaries/zones.geojson so the output joins directly onto the
dashboard geometry. Children in a zone the geojson does not know about are
reported and kept in the design (they are real PSUs of their stratum), but no
domain is estimated on them, so they do not count in any province or national
figure either.

Run from the project root. The R step estimates every (age group, milieu,
domain, variable) combination one at a time, so the runtime grows with the
number of variables, age groups and milieux -- budget around half an hour per
age group for both years, all variables and all three milieux; `--variables` /
`--years` / `--age-groups` / `--milieux` cut that down when debugging, and
`--workdir` keeps the R inputs and outputs so the R step can be re-run by hand:

    python -m scripts.ecv.process-ecv-caracteristics
    python -m scripts.ecv.process-ecv-caracteristics --years 2022 --variables mere,gardienne
    python -m scripts.ecv.process-ecv-caracteristics --milieux all
    python -m scripts.ecv.process-ecv-caracteristics --age-groups 6-23
    python -m scripts.ecv.process-ecv-caracteristics --workdir /tmp/ecv-carac-debug
"""

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pandas as pd

import scripts.ecv.constants as cst
from scripts.ecv import indicators, utils

# Survey design + geography columns, required in every file.
GEO_COLUMNS = [
    cst.STRATUM_COL,
    cst.ZONE_COL,
    cst.AREA_COL,
    cst.WEIGHT_COL,
    cst.AGE_COL,
    cst.MILIEU_COL,
]


def stata_columns(dta_path: Path) -> set[str]:
    """Column names in a Stata file, read from its header without any rows."""
    with pd.io.stata.StataReader(str(dta_path)) as reader:
        return set(reader.variable_labels())


def load_year(
    dta_path: Path,
    year: str,
    variables: list[str],
    provinces: dict[str, str],
    zones: dict[str, tuple[str, str]],
) -> tuple[pd.DataFrame, list[str]]:
    """Read one ECV Stata export into the child-level frame handed to R.

    No row is filtered out here: the age window and the milieu are domains R
    takes off the full-sample design. Returns the frame and the raw source
    columns it carries.
    """
    print(f"  reading {dta_path.name} ...")
    available = stata_columns(dta_path)
    absent_geo = [c for c in GEO_COLUMNS if c not in available]
    if absent_geo:
        raise ValueError(
            f"{dta_path.name} is missing the design/geography column(s) "
            f"{absent_geo}; it cannot be used for a design-based estimate."
        )
    wanted = indicators.source_columns(variables, year)
    absent = [c for c in wanted if c not in available]
    if absent:
        print(
            f"  note: {len(absent)} source column(s) are not in this round's "
            f"file: {absent}"
        )
    source_cols = [c for c in wanted if c in available]

    raw = pd.read_stata(
        dta_path, columns=GEO_COLUMNS + source_cols, convert_categoricals=False
    )

    df = pd.DataFrame(
        {
            "province": utils.clean_name(raw[cst.STRATUM_COL]),
            "zone": utils.clean_name(raw[cst.ZONE_COL]),
            "area": utils.clean_name(raw[cst.AREA_COL]),
            "weight": pd.to_numeric(raw[cst.WEIGHT_COL], errors="coerce"),
            "age": pd.to_numeric(raw[cst.AGE_COL], errors="coerce"),
            "milieu": pd.to_numeric(raw[cst.MILIEU_COL], errors="coerce").map(
                cst.MILIEU_BY_CODE
            ),
        }
    )
    for col in source_cols:
        df[col] = pd.to_numeric(raw[col], errors="coerce")

    # The design keys come from the survey's own names, so a zone the geojson
    # spells differently is still the same stratum / PSU. An aire de sante name
    # is not unique nationally, so key the PSU on the zone.
    df["psu_key"] = df["province"] + " | " + df["zone"] + " | " + df["area"]
    df = utils.canonicalize_names(df, provinces, zones)
    return df, source_cols


def indicator_spec(variables: list[str], year: str) -> pd.DataFrame:
    """The INDICATORS table resolved for `year`, as the flat rows R codes from.

    Codes are ";"-joined; `partition` names the question a variable is one
    modality of, only when every modality of it is being estimated.
    """
    partition_of = {
        key: column
        for column, keys in indicators.PARTITIONS
        if set(keys) <= set(variables)
        for key in keys
    }
    rows = []
    for key in variables:
        src = indicators.BY_KEY[key].source(year)
        rows.append(
            {
                "key": key,
                "column": src.column if src else None,
                "yes": ";".join(map(str, src.yes)) if src else None,
                "no": ";".join(map(str, src.no)) if src else None,
                "gate_column": src.gate[0] if src and src.gate else None,
                "gate_codes": (
                    ";".join(map(str, src.gate[1])) if src and src.gate else None
                ),
                "partition": partition_of.get(key),
            }
        )
    return pd.DataFrame(rows)


def run_survey_r(
    df: pd.DataFrame,
    source_cols: list[str],
    spec: pd.DataFrame,
    rscript: str,
    workdir: Path,
    milieux: list[str],
    age_groups: list[str],
) -> pd.DataFrame:
    """Hand the child-level frame to R's `survey` and read the estimates back.

    R does the filtering (age windows, drawable zones, milieu), the indicator
    coding, the counts and the estimation; see rscript_caracteristics.R.
    Domains travel as integer ids rather than names so that accented zone
    names cannot be mangled crossing the Python/R boundary.
    """
    strata = sorted(df["province"].unique())
    psus = sorted(df["psu_key"].unique())
    geo = df[df["in_geo"]]
    provinces = sorted(geo["geo_province"].unique())
    zones = sorted(geo["geo_zone_key"].unique())
    stratum_ids = {name: i for i, name in enumerate(strata)}
    psu_ids = {name: i for i, name in enumerate(psus)}
    province_ids = {name: i for i, name in enumerate(provinces)}
    zone_ids = {name: i for i, name in enumerate(zones)}

    extract = pd.DataFrame(
        {
            # Strata are the provinces; `q101` is literally "Nom de la strate".
            "stratum_id": df["province"].map(stratum_ids),
            "psu_id": df["psu_key"].map(psu_ids),
            "province_id": df["geo_province"].map(province_ids).astype("Int64"),
            "zone_id": df["geo_zone_key"].map(zone_ids).astype("Int64"),
            "in_geo": df["in_geo"].astype(int),
            "weight": df["weight"],
            "age": df["age"],
            "milieu": df["milieu"],
            **{col: df[col] for col in source_cols},
        }
    )

    labels = pd.DataFrame(
        [
            {"level": "province", "id": i, "name": name}
            for name, i in province_ids.items()
        ]
        + [{"level": "zone", "id": i, "name": name} for name, i in zone_ids.items()]
    )

    in_csv = workdir / "ecv_carac_extract.csv"
    out_csv = workdir / "ecv_carac_estimates.csv"
    spec_csv = workdir / "ecv_carac_spec.csv"
    labels_csv = workdir / "ecv_carac_domains.csv"
    extract.to_csv(in_csv, index=False)
    spec.to_csv(spec_csv, index=False, encoding="utf-8")
    labels.to_csv(labels_csv, index=False, encoding="utf-8")

    sys.stdout.flush()
    # R's progress and reports go to stderr, straight to the terminal.
    proc = subprocess.run(
        [
            rscript,
            "--vanilla",
            str(cst.R_CARACTERISTICS_PATH),
            str(in_csv),
            str(out_csv),
            str(spec_csv),
            str(labels_csv),
            ",".join(age_groups),
            ",".join(milieux),
        ],
        stdout=subprocess.PIPE,
        stderr=None,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"Rscript failed (exit {proc.returncode}).\n--- stdout ---\n{proc.stdout}"
        )
    if proc.stdout.strip():
        print(f"  [R stdout] {proc.stdout.strip()}")

    id_to_province = {i: name for name, i in province_ids.items()}
    id_to_zone = {i: name for name, i in zone_ids.items()}
    zone_names = geo.drop_duplicates("geo_zone_key").set_index("geo_zone_key")

    est = pd.read_csv(out_csv)
    print(f"  read {len(est):,} rows back from R")
    is_zone = est["level"] == "zone"
    zone_key = est["domain_id"].map(id_to_zone)
    est["province"] = (
        est["domain_id"].map(id_to_province).where(est["level"] == "province")
    )
    est.loc[is_zone, "province"] = zone_key[is_zone].map(zone_names["geo_province"])
    est["zone"] = zone_key.map(zone_names["geo_zone"]).where(is_zone)
    return est.drop(columns=["domain_id"])


def process_file(
    dta_path: Path,
    year: str,
    variables: list[str],
    milieux: list[str],
    rscript: str,
    workdir: Path | None,
    age_groups: list[str],
    provinces: dict[str, str],
    zones: dict[str, tuple[str, str]],
) -> pd.DataFrame:
    print(f"\n=== {year} ===")
    df, source_cols = load_year(dta_path, year, variables, provinces, zones)
    spec = indicator_spec(variables, year)

    if workdir is None:
        with tempfile.TemporaryDirectory(prefix=f"ecv-carac-{year}-") as tmp:
            est = run_survey_r(
                df, source_cols, spec, rscript, Path(tmp), milieux, age_groups
            )
    else:
        run_dir = workdir / year
        run_dir.mkdir(parents=True, exist_ok=True)
        est = run_survey_r(df, source_cols, spec, rscript, run_dir, milieux, age_groups)
        print(f"  kept the R inputs/outputs in {run_dir}")

    unmatched = int(est[f"{variables[0]}_pct"].isna().sum())
    if unmatched:
        print(f"  WARNING: {unmatched} domain(s) got no estimate from R")
    est["nb_children"] = est["nb_children"].astype("Int64")
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
    print(f"  {len(est)} rows for {year}")
    return est.drop(columns=["age_rank", "milieu_rank", "level_rank"])


def resolve_rscript(explicit: str | None) -> str:
    """Locate Rscript, failing with something actionable if it is missing."""
    rscript = explicit or shutil.which("Rscript")
    if rscript is None or not Path(rscript).exists():
        raise RuntimeError(
            "Rscript not found on PATH. This script delegates the survey-design "
            "estimation to R's `survey` package"
        )
    version = subprocess.run([rscript, "--version"], capture_output=True, text=True)
    print(f"  Rscript: {rscript} ({(version.stdout or version.stderr).strip()})")
    return rscript


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=cst.OUT_CARACTERISTICS_PATH,
        help=f"destination CSV (default: {cst.OUT_CARACTERISTICS_PATH.relative_to(cst.PROJECT_ROOT)})",
    )
    parser.add_argument(
        "--boundaries",
        type=Path,
        default=cst.ZONES_GEOJSON,
        help=f"zone boundaries (default: {cst.ZONES_GEOJSON.relative_to(cst.PROJECT_ROOT)})",
    )
    parser.add_argument(
        "--years",
        default=",".join(cst.YEARS),
        help=f"comma-separated source-file years to process, as named in the\n"
        f"ECV_<year>_*.dta filenames (default: {','.join(cst.YEARS)})",
    )
    parser.add_argument(
        "--variables",
        default=",".join(indicators.VARIABLES),
        help="comma-separated subset of variables, for quick debugging runs "
        f"(default: all {len(indicators.VARIABLES)})",
    )
    parser.add_argument(
        "--milieux",
        default=",".join(cst.MILIEUX),
        help="comma-separated subset of milieu domains to estimate; each one "
        "costs a full R pass over every province and zone "
        f"(default: {','.join(cst.MILIEUX)})",
    )
    parser.add_argument(
        "--age-groups",
        default=",".join(cst.AGE_GROUPS),
        help="comma-separated subset of age groups to estimate (both bounds "
        "included); each one costs a full R pass "
        f"(default: {','.join(cst.AGE_GROUPS)})",
    )
    parser.add_argument(
        "--rscript",
        default=None,
        help="path to the Rscript binary (default: the one on PATH)",
    )
    parser.add_argument(
        "--workdir",
        type=Path,
        default=None,
        help=(
            "keep each year's R extract, script and raw estimates in this "
            "directory instead of a temporary one (useful for re-running the "
            "R step by hand, e.g. to chase down warnings)"
        ),
    )
    args = parser.parse_args()

    print(f"  input dir : {cst.INPUT_DIR}")
    print(f"  output    : {args.output}")

    years = [y.strip() for y in args.years.split(",") if y.strip()]
    variables = [v.strip() for v in args.variables.split(",") if v.strip()]
    unknown = [v for v in variables if v not in indicators.BY_KEY]
    if unknown:
        raise SystemExit(
            f"unknown variable(s): {unknown}\nknown variables: {indicators.VARIABLES}"
        )
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
    print(f"  years     : {years}")
    print(f"  milieux   : {milieux}")
    print(f"  age groups: {age_groups} (completed months, bounds included)")

    rscript = resolve_rscript(args.rscript)
    provinces, zones = utils.load_geojson_names(args.boundaries)

    frames = []
    for year in years:
        matches = sorted(cst.INPUT_DIR.glob(f"ECV_{year}_*.dta"))
        if not matches:
            raise FileNotFoundError(f"no ECV_{year}_*.dta in {cst.INPUT_DIR}")
        if len(matches) > 1:
            print(
                f"  WARNING: {len(matches)} files match ECV_{year}_*.dta, using "
                f"{matches[0].name}"
            )
        frames.append(
            process_file(
                matches[0],
                year,
                variables,
                milieux,
                rscript,
                args.workdir,
                age_groups,
                provinces,
                zones,
            )
        )

    output = pd.concat(frames, ignore_index=True)
    ordered = [
        f"{variable}_{stat}"
        for variable in variables
        for stat in ("pct", "low", "high")
    ]
    output = output[
        [
            "year",
            "age_group",
            "milieu",
            "level",
            "province",
            "zone",
            "nb_children",
            *ordered,
        ]
    ]

    print("\n=== output ===")
    for level in ("national", "province", "zone"):
        at_level = output[output["level"] == level]
        for age_group in age_groups:
            for milieu in milieux:
                by_year = (
                    at_level[
                        (at_level["age_group"] == age_group)
                        & (at_level["milieu"] == milieu)
                    ]
                    .groupby("year")
                    .size()
                )
                print(
                    f"  {level:<9} {age_group:<5} {milieu:<7} rows per year: "
                    f"{by_year.to_dict()}"
                )
    empty = [c for c in ordered if output[c].isna().all()]
    if empty:
        print(f"  WARNING: {len(empty)} column(s) are entirely empty: {empty}")
    missing_pct = {
        c: int(output[c].isna().sum()) for c in ordered if c.endswith("_pct")
    }
    missing_pct = {c: n for c, n in missing_pct.items() if n}
    if missing_pct:
        print(f"  note: rows without a point estimate, per variable: {missing_pct}")
    missing_ci = sum(
        int(output[c].isna().sum()) for c in ordered if c.endswith(("_low", "_high"))
    )
    print(f"  missing CI bounds across the file: {missing_ci:,}")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(args.output, index=False)


if __name__ == "__main__":
    main()
