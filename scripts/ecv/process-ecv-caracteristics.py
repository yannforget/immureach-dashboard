"""Compute ECV household/child characteristics from the raw survey microdata.

Reads the Stata exports in data/input/ecv/ (ECV_2022_* and ECV_2023_*), keeps
children inside the age window (`vs25`, age in completed months; 6-23 by
default, which is the population both files were collected on), and writes
public/data/ecv_caracteristics.csv -- one row per national / province / zone
domain, year and milieu, with a `_pct` / `_low` / `_high` triplet per variable
(point estimate and 95% confidence interval, 0-100).

`milieu` is the dashboard's rural/urbain ribbon filter, read off `q108`
("Milieu de localisation du menage"): every domain is estimated three times,
once on the whole sample (`all`) and once on each q108 modality (`urbain`,
`rural`). See MILIEUX.

This is the file behind the characteristics bar chart at the bottom right of
the dashboard's first tab. What each variable means, which column it is read
off and how the two rounds differ all live in scripts/indicators.py; adding an
entry to its INDICATORS table puts a `<root>_pct/_low/_high` family in the
header; to chart it, list the root in
ECV_CARACTERISTIC_KEYS and give it a French label in
ECV_CARACTERISTIC_VARIABLE_LABELS, plus an ECV_CARACTERISTIC_GROUPS entry when
several variables belong on one tab (src/lib/utils/constants.ts). Roots absent
from ECV_CARACTERISTIC_KEYS are parsed but never drawn.

Province and zone names are canonicalised against
data/output/boundaries/zones.geojson so the output joins directly onto the
dashboard geometry. Anything the geojson does not know about is reported and
dropped, so a renamed zone can never silently disappear from the chart.

Run from the project root. The R step estimates every (domain, variable) pair
one at a time and runs once per milieu, so the runtime grows with the number of
variables and milieux -- budget around half an hour for both years, all
variables and all three milieux; `--variables` / `--years` / `--milieux` cut
that down when debugging, and `--workdir` keeps the R extract and script so the
R step can be re-run by hand:

    python scripts/process-ecv-caracteristics.py
    python scripts/process-ecv-caracteristics.py --years 2022 --variables mere,gardienne
    python scripts/process-ecv-caracteristics.py --milieux all
    python scripts/process-ecv-caracteristics.py --workdir /tmp/ecv-carac-debug
"""

import argparse
import shutil
import subprocess
import sys
import tempfile
import time
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


def canonicalize_names(
    df: pd.DataFrame,
    provinces: dict[str, str],
    zones: dict[str, tuple[str, str]],
) -> pd.DataFrame:
    """Replace the survey's free-text names with the geojson spelling.

    Rows whose province|zone pair is unknown to the geojson are dropped: they
    could not be drawn on the map anyway, and keeping them would quietly
    inflate the province and national totals.
    """
    key = df["province"].map(utils.normalize) + "|" + df["zone"].map(utils.normalize)
    matched = key.map(zones)
    unknown = matched.isna()

    if unknown.any():
        missing = (
            df.loc[unknown, ["province", "zone"]]
            .value_counts()
            .rename("children")
            .reset_index()
        )
        print(
            f"  WARNING: {len(missing)} survey zone(s) "
            f"({int(unknown.sum()):,} children) are not in the boundaries file "
            "and are dropped:"
        )
        for row in missing.head(20).itertuples():
            print(f"    {row.province} / {row.zone} ({row.children:,} children)")
        if len(missing) > 20:
            print(f"    ... and {len(missing) - 20} more")
    else:
        print("  every survey zone matched a boundary zone")

    unknown_provinces = sorted(
        set(df["province"].map(utils.normalize)) - set(provinces)
    )
    if unknown_provinces:
        print(f"  WARNING: province(s) absent from the boundaries: {unknown_provinces}")

    df = df[~unknown].copy()
    df["province"] = [pair[0] for pair in matched[~unknown]]
    df["zone"] = [pair[1] for pair in matched[~unknown]]
    df["zone_key"] = df["province"] + " | " + df["zone"]
    df["psu_key"] = df["zone_key"] + " | " + df["area"]

    covered = set(
        df["zone_key"].map(
            lambda k: (
                utils.normalize(k.split(" | ")[0])
                + "|"
                + utils.normalize(k.split(" | ")[1])
            )
        )
    )
    never_surveyed = sorted(
        zones[k][0] + " / " + zones[k][1] for k in set(zones) - covered
    )
    if never_surveyed:
        print(
            f"  note: {len(never_surveyed)} boundary zone(s) have no survey data "
            "this year (they will simply be missing from the CSV), e.g. "
            f"{never_surveyed[:5]}"
        )
    return df


def build_indicators(df: pd.DataFrame, variables: list[str], year: str) -> pd.DataFrame:
    """Add one 0/1 column per variable, NA where the answer does not apply.

    Every variable is an "is this child / caregiver X?" flag, so a
    design-weighted mean of the column is the percentage svyciprop estimates.
    Each variable's source column is resolved for `year`, because the BeSD
    batteries do not sit in the same columns in both rounds.
    """
    unexpected: dict[str, list] = {}
    gated: dict[str, tuple[str, int]] = {}
    missing_source: list[str] = []

    for key in variables:
        indicator = indicators.BY_KEY[key]
        src = indicator.source(year)

        # A variable the round simply does not carry: leave it entirely
        # missing rather than guess, and say so.
        if src is None or src.column not in df.columns:
            df[key] = pd.Series(pd.NA, index=df.index, dtype="Int64")
            missing_source.append(
                f"{key} ({src.column if src else 'no source for this year'})"
            )
            continue

        codes = pd.to_numeric(df[src.column], errors="coerce")

        values = pd.Series(pd.NA, index=df.index, dtype="Int64")
        values[codes.isin(src.yes)] = 1
        values[codes.isin(src.no)] = 0

        # Skipped by the questionnaire's own routing: the child was never
        # offered this option, which is a "did not report it", not a "don't
        # know". Only blank cells are filled -- an actual answer always wins.
        if src.gate is not None and src.gate[0] in df.columns:
            gate_col, asked = src.gate
            gate_codes = pd.to_numeric(df[gate_col], errors="coerce")
            skipped = codes.isna() & gate_codes.notna() & ~gate_codes.isin(asked)
            values[skipped] = 0
            if skipped.any():
                gated[key] = (gate_col, int(skipped.sum()))

        # A code that is neither a yes nor a no is usually "ne sait pas" and is
        # meant to be dropped, but it is also how a recoded column announces
        # itself: so report the ones that are not already accounted for.
        known = set(src.yes) | set(src.no)
        stray = codes.notna() & ~codes.isin(known)
        if stray.any():
            unexpected[key] = [
                (float(code), int(count))
                for code, count in codes[stray].value_counts().head(5).items()
            ]
        df[key] = values

    if missing_source:
        print(
            f"  WARNING: {len(missing_source)} variable(s) have no usable source "
            f"column in the {year} file and stay empty:"
        )
        for item in missing_source:
            print(f"    {item}")

    if gated:
        print("  children counted as a 'no' because the question was filtered out:")
        for key, (gate_col, count) in gated.items():
            print(f"    {key:<26} {count:>7,} skipped by `{gate_col}`")

    if unexpected:
        print("  codes outside the yes/no lists (dropped as missing):")
        for key, pairs in unexpected.items():
            src = indicators.BY_KEY[key].source(year)
            shown = ", ".join(f"{code:g} x{count:,}" for code, count in pairs)
            print(f"    {key:<26} ({src.column if src else '?'}) {shown}")

    return df


def report_indicators(df: pd.DataFrame, variables: list[str]) -> None:
    """Unweighted vs design-weighted national rate per variable, plus denominators.

    Printed for every run: it is the quickest way to spot a variable derived
    from the wrong column or the wrong code (a percentage that is the
    complement of what it should be shows up immediately).
    """
    print("  national rates per variable (unweighted / weighted, before R):")
    weight = df["weight"]
    total = len(df)
    for key in variables:
        values = df[key]
        mask = values.notna()
        if not mask.any():
            print(f"    {key:<26} ALL MISSING")
            continue
        unweighted = 100 * float(values[mask].mean())
        weighted = 100 * float((values[mask] * weight[mask]).sum() / weight[mask].sum())
        denom = int(mask.sum())
        flag = "  <-- no variation" if values[mask].nunique() < 2 else ""
        print(
            f"    {key:<26} {unweighted:5.1f} / {weighted:5.1f}   "
            f"n={denom:,} ({100 * denom / total:.0f}% of children){flag}"
        )

    # The modalities of one question have to add up: exactly one of them is a
    # 1 for every child who answered. A drift here means the source column
    # picked up a code the modality lists do not cover.
    for column, keys in indicators.PARTITIONS:
        if not set(keys) <= set(variables):
            continue
        answered = df[list(keys)].notna().all(axis=1)
        exclusive = bool((df.loc[answered, list(keys)].sum(axis=1) == 1).all())
        print(
            f"    cross-check: {' + '.join(keys)} = 100% of answered children"
            if exclusive
            else f"    WARNING: {list(keys)} do not partition `{column}`"
        )


def stata_columns(dta_path: Path) -> set[str]:
    """Column names in a Stata file, read from its header without any rows.

    `pd.read_stata(columns=...)` raises on a column the file does not have, and
    the two ECV rounds do not carry the same BeSD columns, so the load list is
    always intersected with this.
    """
    with pd.io.stata.StataReader(str(dta_path)) as reader:
        return set(reader.variable_labels())


def load_year(
    dta_path: Path,
    year: str,
    variables: list[str],
    provinces: dict[str, str],
    zones: dict[str, tuple[str, str]],
    age_min: int,
    age_max: int,
) -> pd.DataFrame:
    """Read one ECV Stata export into the tidy child-level frame used downstream."""
    print(f"  reading {dta_path.name} ...")
    started = time.perf_counter()

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
    load_columns = GEO_COLUMNS + [c for c in wanted if c in available]

    raw = pd.read_stata(dta_path, columns=load_columns, convert_categoricals=False)
    print(
        f"  loaded {len(raw):,} rows x {len(raw.columns)} columns in "
        f"{time.perf_counter() - started:.1f}s"
    )

    age = pd.to_numeric(raw[cst.AGE_COL], errors="coerce")
    in_range = age.between(age_min, age_max)
    print(
        f"  age filter `{cst.AGE_COL}`: {len(raw):,} children -> "
        f"{int(in_range.sum()):,} aged {age_min}-{age_max} months "
        f"({int((~in_range).sum()):,} dropped, {int(age.isna().sum()):,} with no age)"
    )
    if in_range.sum() == 0:
        raise ValueError(
            f"no child aged {age_min}-{age_max} months in {dta_path.name}; "
            f"`{cst.AGE_COL}` spans {age.min()}-{age.max()}"
        )
    df = raw[in_range].copy()

    df["province"] = utils.clean_name(df[cst.STRATUM_COL])
    df["zone"] = utils.clean_name(df[cst.ZONE_COL])
    df["area"] = utils.clean_name(df[cst.AREA_COL])
    df["weight"] = pd.to_numeric(df[cst.WEIGHT_COL], errors="coerce")
    df["milieu"] = pd.to_numeric(df[cst.MILIEU_COL], errors="coerce").map(
        cst.MILIEU_BY_CODE
    )

    # The milieu split is a filter, not an indicator: a child whose `q108` is
    # missing or carries an unexpected code still counts in the "all" domain,
    # it just never lands in a urbain/rural one. Report it so a file that codes
    # the question differently is caught rather than silently halving the split.
    unknown_milieu = df["milieu"].isna()
    seen = df["milieu"].value_counts().to_dict()
    print(
        f"  milieu `{cst.MILIEU_COL}`: "
        + ", ".join(f"{name} {n:,}" for name, n in sorted(seen.items()))
        + f" ({int(unknown_milieu.sum()):,} with no milieu)"
    )
    if unknown_milieu.any():
        print(
            f"  WARNING: {int(unknown_milieu.sum()):,} children carry a "
            f"`{cst.MILIEU_COL}` outside {sorted(cst.MILIEU_BY_CODE)}; they are counted "
            "in the `all` milieu only"
        )

    df = canonicalize_names(df, provinces, zones)
    df = build_indicators(df, variables, year)

    no_weight = int(df["weight"].isna().sum())
    if no_weight:
        print(
            f"  WARNING: dropping {no_weight:,} children without a `{cst.WEIGHT_COL}`"
        )
        df = df.dropna(subset=["weight"])
    nonpositive = int((df["weight"] <= 0).sum())
    if nonpositive:
        print(f"  WARNING: {nonpositive:,} children carry a weight <= 0")

    keep = [
        "province",
        "zone",
        "area",
        "zone_key",
        "psu_key",
        "weight",
        "milieu",
        *variables,
    ]
    return df[keep]


def build_counts(df: pd.DataFrame) -> pd.DataFrame:
    """Unweighted number of children per national / province / zone domain."""
    zone = (
        df.groupby(["province", "zone", "zone_key"])
        .agg(nb_children=("weight", "size"))
        .reset_index()
    )
    zone["level"] = "zone"
    zone["domain_key"] = zone["zone_key"]

    province = df.groupby("province").agg(nb_children=("weight", "size")).reset_index()
    province["zone"] = None
    province["level"] = "province"
    province["domain_key"] = province["province"]

    national = pd.DataFrame(
        [
            {
                "province": None,
                "zone": None,
                "nb_children": len(df),
                "level": "national",
                "domain_key": "national",
            }
        ]
    )

    cols = ["level", "domain_key", "province", "zone", "nb_children"]
    counts = pd.concat([national[cols], province[cols], zone[cols]], ignore_index=True)

    small = counts[(counts["level"] == "zone") & (counts["nb_children"] < 30)]
    if len(small):
        print(
            f"  WARNING: {len(small)} zone(s) with fewer than 30 children -- their "
            "confidence intervals will be very wide:"
        )
        for row in small.head(10).itertuples():
            print(f"    {row.domain_key}: {row.nb_children} children")
    return counts


def run_survey_r(
    df: pd.DataFrame, variables: list[str], rscript: str, workdir: Path
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
            # Strata are the provinces; `q101` is literally "Nom de la strate".
            "stratum_id": df["province"].map(province_ids),
            "province_id": df["province"].map(province_ids),
            "zone_id": df["zone_key"].map(zone_ids),
            "psu_id": df["psu_key"].map(psu_ids),
            "weight": df["weight"],
            **{variable: df[variable] for variable in variables},
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
    labels_csv = workdir / "ecv_carac_domains.csv"
    extract.to_csv(in_csv, index=False)
    labels.to_csv(labels_csv, index=False, encoding="utf-8")
    print(
        f"  wrote the R extract: {len(extract):,} rows, "
        f"{len(provinces)} strata, {len(psus)} PSUs -> {in_csv}"
    )

    started = time.perf_counter()
    sys.stdout.flush()
    proc = subprocess.run(
        [
            rscript,
            "--vanilla",
            str(cst.R_CARACTERISTICS_PATH),
            str(in_csv),
            str(out_csv),
            ",".join(variables),
            str(labels_csv),
        ],
        stdout=subprocess.PIPE,
        stderr=None,
        text=True,
    )
    print(f"  R finished in {time.perf_counter() - started:.1f}s")
    if proc.returncode != 0:
        raise RuntimeError(
            f"Rscript failed (exit {proc.returncode}).\n--- stdout ---\n{proc.stdout}"
        )
    if proc.stdout.strip():
        print(f"  [R stdout] {proc.stdout.strip()}")

    id_to_province = {i: name for name, i in province_ids.items()}
    id_to_zone = {i: name for name, i in zone_ids.items()}

    est = pd.read_csv(out_csv)
    print(f"  read {len(est):,} raw estimates back from R")
    est["domain_key"] = [
        "national"
        if level == "national"
        else (id_to_province[did] if level == "province" else id_to_zone[did])
        for level, did in zip(est["level"], est["domain_id"])
    ]
    missing_ci = int(est["low"].isna().sum())
    if missing_ci:
        print(f"  WARNING: {missing_ci:,} estimate(s) came back without a CI")
    return est


def reshape_estimates(est: pd.DataFrame, variables: list[str]) -> pd.DataFrame:
    """Long R output -> one row per domain with the dashboard's column names."""
    wide = est.pivot(
        index=["level", "domain_key"],
        columns="indicator",
        values=["est", "low", "high"],
    )
    suffix = {"est": "pct", "low": "low", "high": "high"}
    wide.columns = [f"{variable}_{suffix[stat]}" for stat, variable in wide.columns]
    wide = wide.reset_index()
    # svyciprop returns proportions; the dashboard reads 0-100 percentages.
    value_cols = [c for c in wide.columns if c not in ("level", "domain_key")]
    wide[value_cols] = (wide[value_cols] * 100).round(1)
    ordered = [
        f"{variable}_{stat}"
        for variable in variables
        for stat in ("pct", "low", "high")
    ]
    return wide[["level", "domain_key", *ordered]]


def weighted_rates(df: pd.DataFrame, variables: list[str]) -> pd.DataFrame:
    """Design-weighted percentage per domain, computed independently in pandas.

    Only used to sanity-check what R returns: svyciprop's point estimate is the
    same Horvitz-Thompson ratio, so the two must agree closely. A disagreement
    means the R domain subsetting is selecting the wrong rows -- which is
    exactly the failure mode that silently produces NaN/0/100 zone estimates.
    """

    def rates(group: pd.DataFrame) -> dict[str, float | None]:
        out: dict[str, float | None] = {}
        for variable in variables:
            values = group[variable]
            mask = values.notna()
            weights = group["weight"][mask]
            out[f"{variable}_ref"] = (
                None
                if weights.sum() == 0
                else 100 * float((values[mask] * weights).sum() / weights.sum())
            )
        return out

    frames = [
        pd.DataFrame([{"level": "national", "domain_key": "national", **rates(df)}])
    ]
    for level, key in (("province", "province"), ("zone", "zone_key")):
        frames.append(
            pd.DataFrame(
                [
                    {"level": level, "domain_key": name, **rates(group)}
                    for name, group in df.groupby(key)
                ]
            )
        )
    return pd.concat(frames, ignore_index=True)


def check_against_reference(
    wide: pd.DataFrame,
    reference: pd.DataFrame,
    variables: list[str],
    tolerance: float = 1.0,
) -> None:
    """Warn if R's point estimates drift from the pandas weighted means."""
    merged = wide.merge(reference, on=["level", "domain_key"], how="left")
    problems: list[str] = []
    for variable in variables:
        ref = merged[f"{variable}_ref"]
        got = merged[f"{variable}_pct"]
        low, high = merged[f"{variable}_low"], merged[f"{variable}_high"]
        missing = got.isna() & ref.notna()
        drifted = (got - ref).abs() > tolerance
        for _, row in merged[missing | drifted.fillna(False)].iterrows():
            problems.append(
                f"    {row['level']:>8} {row['domain_key']}: {variable} "
                f"R={row[f'{variable}_pct']} vs weighted mean={row[f'{variable}_ref']}"
            )

        impossible = (low < 0) | (high > 100) | (low > got) | (high < got)
        for _, row in merged[impossible.fillna(False)].iterrows():
            problems.append(
                f"    {row['level']:>8} {row['domain_key']}: {variable} CI "
                f"[{row[f'{variable}_low']}, {row[f'{variable}_high']}] is out of range"
            )
    if problems:
        print(
            f"  WARNING: {len(problems)} estimate(s) disagree with the weighted "
            f"mean by more than {tolerance} point(s), are missing, or carry an "
            "impossible CI:"
        )
        for line in problems[:20]:
            print(line)
        if len(problems) > 20:
            print(f"    ... and {len(problems) - 20} more")
    else:
        print("  cross-check OK: every estimate matches its weighted mean")


def process_milieu(
    df: pd.DataFrame,
    year: str,
    milieu: str,
    variables: list[str],
    rscript: str,
    workdir: Path | None,
) -> pd.DataFrame:
    """Estimate every domain on one milieu subset of a year's children.

    The subset is taken before `svydesign()` is built rather than through
    `subset()` on a full-sample design. That matches what the R script already
    does for the province and zone domains (see the `domain()` comment there),
    so a milieu domain is estimated exactly the way a zone domain is.
    """
    counts = build_counts(df)
    print(
        f"  domains: {int((counts['level'] == 'province').sum())} provinces, "
        f"{int((counts['level'] == 'zone').sum())} zones, 1 national"
    )

    print("  running the R survey estimation ...")
    if workdir is None:
        with tempfile.TemporaryDirectory(prefix=f"ecv-carac-{year}-{milieu}-") as tmp:
            est = run_survey_r(df, variables, rscript, Path(tmp))
    else:
        run_dir = workdir / year / milieu
        run_dir.mkdir(parents=True, exist_ok=True)
        est = run_survey_r(df, variables, rscript, run_dir)
        print(f"  kept the R inputs/outputs in {run_dir}")

    wide = reshape_estimates(est, variables)
    check_against_reference(wide, weighted_rates(df, variables), variables)

    out = counts.merge(wide, on=["level", "domain_key"], how="left")
    unmatched = int(out[f"{variables[0]}_pct"].isna().sum())
    if unmatched:
        print(f"  WARNING: {unmatched} domain(s) got no estimate from R")
    out["nb_children"] = out["nb_children"].astype("Int64")
    out["year"] = cst.COLLECTION_YEAR.get(year, year)
    out["milieu"] = milieu
    print(f"  {len(out)} rows for {year} / {milieu}")
    return out.drop(columns=["domain_key"])


def process_file(
    dta_path: Path,
    year: str,
    variables: list[str],
    milieux: list[str],
    rscript: str,
    workdir: Path | None,
    age_min: int,
    age_max: int,
    provinces: dict[str, str],
    zones: dict[str, tuple[str, str]],
) -> pd.DataFrame:
    print(f"\n=== {year} ===")
    df = load_year(dta_path, year, variables, provinces, zones, age_min, age_max)
    print(
        f"  analysing {len(df):,} children in {df['province'].nunique()} provinces / "
        f"{df['zone_key'].nunique()} zones / {df['psu_key'].nunique()} areas"
    )
    report_indicators(df, variables)

    frames = []
    for milieu in milieux:
        subset = df if milieu == "all" else df[df["milieu"] == milieu]
        print(
            f"\n--- {year} / milieu={milieu}: {len(subset):,} children in "
            f"{subset['province'].nunique()} provinces / "
            f"{subset['zone_key'].nunique()} zones / "
            f"{subset['psu_key'].nunique()} areas ---"
        )
        if subset.empty:
            print(f"  WARNING: no child with milieu={milieu}; no rows emitted")
            continue
        frames.append(process_milieu(subset, year, milieu, variables, rscript, workdir))

    return pd.concat(frames, ignore_index=True)


def resolve_rscript(explicit: str | None) -> str:
    """Locate Rscript, failing with something actionable if it is missing."""
    rscript = explicit or shutil.which("Rscript")
    if rscript is None or not Path(rscript).exists():
        raise RuntimeError(
            "Rscript not found on PATH. This script delegates the survey-design "
            "estimation to R's `survey` package; install R and then run:\n"
            '  Rscript -e \'install.packages("survey", '
            'repos = "https://cloud.r-project.org")\'\n'
            "Or point at an existing interpreter with --rscript."
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

    started = time.perf_counter()
    print("ECV caracteristics")
    print(f"  input dir : {cst.INPUT_DIR}")
    print(f"  output    : {args.output}")
    print(f"  age window: {args.age_min}-{args.age_max} completed months")

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
    print(f"  years     : {years}")
    print(f"  variables : {len(variables)} -> {variables}")
    print(f"  milieux   : {milieux}")

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
                args.age_min,
                args.age_max,
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
        ["year", "milieu", "level", "province", "zone", "nb_children", *ordered]
    ]

    print("\n=== output ===")
    for level in ("national", "province", "zone"):
        at_level = output[output["level"] == level]
        for milieu in milieux:
            by_year = at_level[at_level["milieu"] == milieu].groupby("year").size()
            print(f"  {level:<9} {milieu:<7} rows per year: {by_year.to_dict()}")
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

    print("\n  national percentages:")
    for _, row in output[output["level"] == "national"].iterrows():
        print(
            f"    --- {row['year']} / {row['milieu']} ({row['nb_children']:,} children)"
        )
        for variable in variables:
            print(
                f"      {indicators.BY_KEY[variable].label:<28} "
                f"{row[f'{variable}_pct']:>5} "
                f"[{row[f'{variable}_low']}, {row[f'{variable}_high']}]"
            )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(args.output, index=False)
    print(
        f"wrote {args.output} ({len(output)} rows x {len(output.columns)} columns) "
        f"in {time.perf_counter() - started:.1f}s"
    )


if __name__ == "__main__":
    main()
