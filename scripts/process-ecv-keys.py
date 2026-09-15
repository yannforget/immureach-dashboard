"""Compute ECV key figures for young children from the raw survey microdata.

Reads the Stata exports in data/input/ecv/ (ECV_2022_* and ECV_2023_*), keeps
children inside the age window (`vs25`, age in completed months; 6-23 by
default, see AGE_MIN_MONTHS), and derives the two headline indicators the
dashboard shows:

  * penta_cov -- Penta3 coverage (3rd dose of the pentavalent vaccine)
  * zdc_cov   -- zero-dose children (no antigen at all)

Both are built from the `<vaccine>_merg` columns, which merge the vaccination
card with the mother's recall and are coded 1 = vaccinated, 2 = not vaccinated.

Point estimates and 95% confidence intervals are NOT computed in Python: the
survey is a stratified two-stage cluster design (strata = province `q101`,
PSU = aire de sante `q105`, weights = `ponderation`), so this script shells out
to R's `survey` package via `subprocess`. The CI is a logit-transformed
interval (`svyciprop(method = "logit")`), which behaves properly for the small
zone-level domains where coverage sits near 0% or 100%.

Counts (children, health zones, health areas) are unweighted sample sizes and
are computed here in pandas.

Output mirrors the KeyEcvRow schema consumed by the dashboard
(src/types/index.ts): one row per national / province / zone domain and year.

Requires R with the `survey` package installed:

    Rscript -e 'install.packages("survey", repos = "https://cloud.r-project.org")'

Run from the project root:

    python scripts/process_ecv.py
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
INPUT_DIR = PROJECT_ROOT / "data" / "input" / "ecv"
OUT_CSV = PROJECT_ROOT / "public" / "data" / "key_ecv.csv"

# Age window in completed months, read off `vs25` ("Quel age a ... en mois ?").
# Override per run with --age-min / --age-max.
#
# Note on the source files: the 2022 export is *already* confined to 6-24
# months (81,438 children, vs25 spans exactly 6..24) and the 2023 export very
# nearly so (83,371 of 83,414 rows), so the 6-23 window below is close to a
# no-op and keeps every child the survey collected. The narrower 12-23 window
# used previously selected only the ~48k-per-year subset (2022: 47,880 /
# 2023: 48,326); pass --age-min 12 to reproduce it.
AGE_MIN_MONTHS = 6
AGE_MAX_MONTHS = 24

# `<vaccine>_merg` columns common to the 2022 and 2023 questionnaires: card
# and history merged, coded 1 = vaccinated / 2 = not vaccinated. A child is
# zero-dose when every one of these is 2. The 2023 file additionally carries
# `vpi2_merg` / `var2_merg`; those are second doses, so they cannot turn a
# zero-dose child into a vaccinated one and are left out to keep the two years
# on the same definition.
MERG_COLUMNS = [
    "bcg_merg",
    "penta1_merg",
    "penta2_merg",
    "penta3_merg",
    "vpo0_merg",
    "vpo1_merg",
    "vpo2_merg",
    "vpo3_merg",
    "pcv1_merg",
    "pcv2_merg",
    "pcv3_merg",
    "vpi_merg",
    "rota1_merg",
    "rota2_merg",
    "rota3_merg",
    "var_merg",
    "vaa_merg",
]

VACCINATED = 1
NOT_VACCINATED = 2

# Survey design + geography columns.
STRATUM_COL = "q101"  # "Nom de la strate (de la province)"
ZONE_COL = "q103"  # "Nom de la zone de sante"
AREA_COL = "q105"  # "Nom de la grappe (de l'Aire de sante)" -- the PSU
WEIGHT_COL = "ponderation"
AGE_COL = "vs25"
AREAS_TOTAL_COL = "nbre_as"  # health areas in the zone (sampling frame)

LOAD_COLUMNS = [
    STRATUM_COL,
    ZONE_COL,
    AREA_COL,
    WEIGHT_COL,
    AGE_COL,
    AREAS_TOTAL_COL,
] + MERG_COLUMNS

# Names arrive as "kl Kwilu Province" / "bu Aketi Zone de Sante": a two-letter
# province code, the name, then the level suffix.
NAME_PREFIX_RE = re.compile(r"^[A-Za-z]{2}\s+")
NAME_SUFFIX_RE = re.compile(
    r"\s+(Province|Zone\s+de\s+Sant\w*|Aire\s+de\s+Sant\w*)\s*$",
    flags=re.IGNORECASE,
)

R_SCRIPT = r"""
# Design-based estimation of Penta3 coverage and zero-dose prevalence with 95%
# confidence intervals. Called by scripts/process_ecv.py; not meant to be run
# by hand. Reads the child-level extract, writes one row per
# (domain, indicator) with the point estimate and CI bounds as proportions.
if (!requireNamespace("survey", quietly = TRUE)) {
  stop("the R package 'survey' is not installed: install.packages(\"survey\")")
}
suppressPackageStartupMessages(library(survey))

# Subsetting to a single zone can leave a stratum contributing one PSU; centre
# those on the grand mean rather than dropping the variance contribution.
options(survey.lonely.psu = "adjust")

# R defers warnings and keeps only the last 50 by default, then prints the
# unhelpful "There were 50 or more warnings" line and exits, taking them with
# it. Estimating ~1000 small domains legitimately produces thousands, so trap
# each one as it is signalled, tally it by message, and print a deduplicated
# summary at the end instead of relying on that buffer.
options(nwarnings = 10000L)

# Which estimator actually produced each domain's figure. Reported at the end
# so a silent mass fallback (the symptom of a broken domain subset) is visible.
tally <- new.env(parent = emptyenv())
tally$logit <- 0L
tally$beta <- 0L
tally$failed <- 0L

warn_log <- new.env(parent = emptyenv())

# Called from withCallingHandlers: record the warning against the domain that
# raised it, then muffle it so it does not also fill R's deferred buffer.
record_warning <- function(w, context) {
  key <- conditionMessage(w)
  entry <- warn_log[[key]]
  if (is.null(entry)) {
    warn_log[[key]] <- list(count = 1L, example = context)
  } else {
    entry$count <- entry$count + 1L
    warn_log[[key]] <- entry
  }
  invokeRestart("muffleWarning")
}

# message() writes to stderr, which process_ecv.py forwards to the terminal.
report_warnings <- function() {
  keys <- ls(warn_log, all.names = TRUE)
  if (length(keys) == 0L) {
    return(invisible(NULL))
  }
  counts <- vapply(keys, function(k) warn_log[[k]]$count, integer(1))
  message(sprintf(
    "\n%d distinct warning(s), %d in total, from the survey estimation:",
    length(keys), sum(counts)
  ))
  for (k in keys[order(-counts)]) {
    entry <- warn_log[[k]]
    message(sprintf("  [%dx] %s", entry$count, k))
    message(sprintf("        first seen at: %s", entry$example))
  }
}

args <- commandArgs(trailingOnly = TRUE)
in_csv <- args[1]
out_csv <- args[2]

d <- read.csv(in_csv, stringsAsFactors = FALSE)

# Stratified two-stage design: strata = province, PSU = aire de sante,
# weights = `ponderation`. nest = TRUE because PSU ids are only unique within a stratum.
design <- svydesign(
  ids = ~psu_id,
  strata = ~stratum_id,
  weights = ~weight,
  data = d,
  nest = TRUE
)

# Take a domain (subpopulation) of the design, i.e. what subset() does: drop
# the rows outside it. The theoretically tidier alternative, `drop = FALSE`,
# keeps every row and sets the excluded weights to zero so each stratum retains
# its full PSU count -- but with svyciprop it returns NaN or degenerate 0/100
# for most zone domains (whole strata end up entirely zero-weighted), so this
# uses the documented subset() behaviour instead. The cost is that a zone's
# stratum is reduced to that zone's PSUs, which makes its interval slightly
# conservative; survey.lonely.psu = "adjust" covers the resulting small strata.
domain <- function(dsn, keep) suppressWarnings(dsn[keep, ])

# svyciprop's logit interval keeps the bounds inside [0, 1] and stays sensible
# for the small, near-degenerate zone domains; fall back to the Wald interval
# on the rare domain where the logit fit cannot be evaluated.
prop_ci <- function(indicator, dsn) {
  values <- dsn$variables[[indicator]]
  keep <- !is.na(values) & is.finite(dsn$prob)
  if (!any(keep)) {
    return(c(NA_real_, NA_real_, NA_real_))
  }
  dsn <- domain(dsn, keep)
  f <- as.formula(paste0("~", indicator))

  # A degenerate fit does not necessarily raise: svyciprop can return NaN, or a
  # point estimate with NaN bounds, without erroring. So tryCatch alone is not
  # enough -- every tier's result is validated before it is accepted.
  #
  # "Collapsed" (lo == hi) is rejected as well as non-finite. When a domain has
  # zero events -- ~15% of zones have no zero-dose child at all -- the logit
  # fit runs its intercept off to -Inf and returns the interval [0, 0], which
  # claims certainty the true rate is exactly 0. With ~120 children the honest
  # upper bound is around 3/120, so [0, 0] is false precision, not a tight
  # estimate. Those are the domains the "algorithm did not converge" warnings
  # point at.
  usable <- function(v) {
    length(v) == 3L && all(is.finite(v)) && v[3] > v[2] &&
      v[2] >= 0 && v[3] <= 1
  }

  estimate <- function(method) {
    tryCatch(
      {
        est <- svyciprop(f, dsn, method = method, level = 0.95)
        ci <- as.numeric(confint(est))
        c(as.numeric(est), ci[1], ci[2])
      },
      error = function(e) c(NA_real_, NA_real_, NA_real_)
    )
  }

  logit <- estimate("logit")
  if (usable(logit)) {
    tally$logit <- tally$logit + 1L
    return(logit)
  }

  # The beta method inverts the incomplete beta function against the effective
  # sample size, the way binom.test does. It fits no glm, so it cannot fail to
  # converge, and it stays inside [0, 1] and gives a real upper bound at zero
  # events -- the two things the logit and Wald intervals get wrong here.
  beta <- estimate("beta")
  if (usable(beta)) {
    tally$beta <- tally$beta + 1L
    return(beta)
  }

  # Keep a usable point estimate even when neither interval is trustworthy.
  point <- if (is.finite(logit[1])) logit[1] else beta[1]
  tally$failed <- tally$failed + 1L
  c(point, NA_real_, NA_real_)
}

indicators <- c("penta3", "zero_dose")

# Domains to estimate: the whole sample, then each province, then each zone.
province_ids <- sort(unique(d$province_id))
zone_ids <- sort(unique(d$zone_id))

domains <- c(
  list(list(level = "national", id = -1L, keep = rep(TRUE, nrow(d)))),
  lapply(province_ids, function(pid) {
    list(level = "province", id = pid, keep = d$province_id == pid)
  }),
  lapply(zone_ids, function(zid) {
    list(level = "zone", id = zid, keep = d$zone_id == zid)
  })
)

n <- length(domains) * length(indicators)
res_level <- character(n)
res_id <- integer(n)
res_indicator <- character(n)
res_est <- numeric(n)
res_low <- numeric(n)
res_high <- numeric(n)

row <- 1L
for (dom in domains) {
  dsn <- if (dom$level == "national") design else domain(design, dom$keep)
  for (ind in indicators) {
    context <- paste0(dom$level, " id=", dom$id, ", indicator=", ind)
    v <- withCallingHandlers(
      prop_ci(ind, dsn),
      warning = function(w) record_warning(w, context)
    )
    res_level[row] <- dom$level
    res_id[row] <- as.integer(dom$id)
    res_indicator[row] <- ind
    res_est[row] <- v[1]
    res_low[row] <- v[2]
    res_high[row] <- v[3]
    row <- row + 1L
  }
}

out <- data.frame(
  level = res_level,
  domain_id = res_id,
  indicator = res_indicator,
  est = res_est,
  low = res_low,
  high = res_high,
  stringsAsFactors = FALSE
)

write.csv(out, out_csv, row.names = FALSE, na = "")

message(sprintf(
  "estimates: %d logit CI, %d beta CI (boundary domains), %d without a CI",
  tally$logit, tally$beta, tally$failed
))

report_warnings()
"""


def clean_name(series: pd.Series) -> pd.Series:
    """Strip the province code prefix and the level suffix off a geography name."""
    return (
        series.astype(str)
        .str.replace(NAME_PREFIX_RE, "", regex=True)
        .str.replace(NAME_SUFFIX_RE, "", regex=True)
        .str.strip()
    )


def load_year(
    dta_path: Path,
    age_min: int = AGE_MIN_MONTHS,
    age_max: int = AGE_MAX_MONTHS,
) -> pd.DataFrame:
    """Read one ECV Stata export into the tidy child-level frame used downstream."""
    raw = pd.read_stata(dta_path, columns=LOAD_COLUMNS, convert_categoricals=False)

    age = pd.to_numeric(raw[AGE_COL], errors="coerce")
    in_range = age.between(age_min, age_max)
    # Report what the age filter actually removed, so a window that silently
    # matches (or drops) the whole file is obvious from the run log.
    print(
        f"  {len(raw):,} children in file -> {int(in_range.sum()):,} aged "
        f"{age_min}-{age_max} months ({int((~in_range).sum()):,} dropped)"
    )
    df = raw[in_range].copy()

    df["province"] = clean_name(df[STRATUM_COL])
    df["zone"] = clean_name(df[ZONE_COL])
    df["area"] = clean_name(df[AREA_COL])
    df["weight"] = pd.to_numeric(df[WEIGHT_COL], errors="coerce")
    df["nb_areas_tot"] = pd.to_numeric(df[AREAS_TOTAL_COL], errors="coerce")

    merg = df[MERG_COLUMNS].apply(pd.to_numeric, errors="coerce")
    df["penta3"] = (merg["penta3_merg"] == VACCINATED).astype("Int64")
    df.loc[merg["penta3_merg"].isna(), "penta3"] = pd.NA
    # Zero-dose: no antigen at all, i.e. every merged vaccine column says "not
    # vaccinated". Unknown as soon as one column is missing.
    df["zero_dose"] = (merg == NOT_VACCINATED).all(axis=1).astype("Int64")
    df.loc[merg.isna().any(axis=1), "zero_dose"] = pd.NA

    # An aire de sante name is not unique nationally, so key the PSU on the zone.
    df["zone_key"] = df["province"] + " | " + df["zone"]
    df["psu_key"] = df["zone_key"] + " | " + df["area"]

    df = df.dropna(subset=["weight"])
    return df[
        [
            "province",
            "zone",
            "area",
            "zone_key",
            "psu_key",
            "weight",
            "nb_areas_tot",
            "penta3",
            "zero_dose",
        ]
    ]


def build_counts(df: pd.DataFrame) -> pd.DataFrame:
    """Unweighted sample sizes per domain: children, zones, areas surveyed/total."""
    zone_totals = df.groupby("zone_key")["nb_areas_tot"].max()

    zone = (
        df.groupby(["province", "zone", "zone_key"])
        .agg(nb_people=("weight", "size"), nb_areas=("psu_key", "nunique"))
        .reset_index()
    )
    zone["nb_zones"] = 1
    zone["nb_areas_tot"] = zone["zone_key"].map(zone_totals)
    zone["level"] = "zone"
    zone["domain_key"] = zone["zone_key"]

    province = (
        df.groupby("province")
        .agg(
            nb_people=("weight", "size"),
            nb_zones=("zone_key", "nunique"),
            nb_areas=("psu_key", "nunique"),
        )
        .reset_index()
    )
    province["nb_areas_tot"] = province["province"].map(
        df.drop_duplicates("zone_key").groupby("province")["nb_areas_tot"].sum()
    )
    province["zone"] = None
    province["level"] = "province"
    province["domain_key"] = province["province"]

    national = pd.DataFrame(
        [
            {
                "province": None,
                "zone": None,
                "nb_people": len(df),
                "nb_zones": df["zone_key"].nunique(),
                "nb_areas": df["psu_key"].nunique(),
                "nb_areas_tot": df.drop_duplicates("zone_key")["nb_areas_tot"].sum(),
                "level": "national",
                "domain_key": "national",
            }
        ]
    )

    cols = [
        "level",
        "domain_key",
        "province",
        "zone",
        "nb_people",
        "nb_zones",
        "nb_areas",
        "nb_areas_tot",
    ]
    return pd.concat([national, province[cols], zone[cols]], ignore_index=True)[cols]


# R only ever sees integer domain ids (see run_survey_r), so its warning
# summary reads "zone id=12". Swap the ids back for names on the way out,
# otherwise the warnings name a number the reader cannot act on.
DOMAIN_REF_RE = re.compile(r"\b(province|zone) id=(-?\d+)")


def label_domains(
    text: str, id_to_province: dict[int, str], id_to_zone: dict[int, str]
) -> str:
    def repl(match: re.Match[str]) -> str:
        level, raw_id = match.group(1), int(match.group(2))
        name = (id_to_province if level == "province" else id_to_zone).get(raw_id)
        return f"{level} {name}" if name else match.group(0)

    return DOMAIN_REF_RE.sub(repl, text)


def run_survey_r(df: pd.DataFrame, workdir: Path) -> pd.DataFrame:
    """Hand the child-level frame to R's `survey` and read the estimates back.

    Domains travel as integer ids rather than names so that accented zone
    names cannot be mangled crossing the Python/R boundary.
    """
    rscript = shutil.which("Rscript")
    if rscript is None:
        raise RuntimeError(
            "Rscript not found on PATH. This script delegates the survey-design "
            "estimation to R's `survey` package; install R and then run:\n"
            '  Rscript -e \'install.packages("survey", '
            'repos = "https://cloud.r-project.org")\''
        )

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
            "penta3": df["penta3"],
            "zero_dose": df["zero_dose"],
        }
    )

    in_csv = workdir / "ecv_extract.csv"
    out_csv = workdir / "ecv_estimates.csv"
    r_file = workdir / "ecv_survey.R"
    extract.to_csv(in_csv, index=False)
    r_file.write_text(R_SCRIPT, encoding="utf-8")

    proc = subprocess.run(
        [rscript, "--vanilla", str(r_file), str(in_csv), str(out_csv)],
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
        # R's warning summary arrives on stderr; flush stdout first so the two
        # streams stay in order when the output is piped or redirected.
        sys.stdout.flush()
        print(
            label_domains(proc.stderr.strip(), id_to_province, id_to_zone),
            file=sys.stderr,
        )
        sys.stderr.flush()

    est = pd.read_csv(out_csv)
    est["domain_key"] = [
        "national"
        if level == "national"
        else (id_to_province[did] if level == "province" else id_to_zone[did])
        for level, did in zip(est["level"], est["domain_id"])
    ]
    return est


def reshape_estimates(est: pd.DataFrame) -> pd.DataFrame:
    """Long R output -> one row per domain with the dashboard's column names."""
    name_by_indicator = {"penta3": "penta_cov", "zero_dose": "zdc_cov"}
    wide = est.assign(prefix=est["indicator"].map(name_by_indicator)).pivot(
        index=["level", "domain_key"], columns="prefix", values=["est", "low", "high"]
    )
    wide.columns = [
        f"{prefix}" if stat == "est" else f"{prefix}_{stat}"
        for stat, prefix in wide.columns
    ]
    wide = wide.reset_index()
    # svyciprop returns proportions; the dashboard reads 0-100 percentages.
    value_cols = [c for c in wide.columns if c not in ("level", "domain_key")]
    wide[value_cols] = (wide[value_cols] * 100).round(1)
    return wide


def weighted_rates(df: pd.DataFrame) -> pd.DataFrame:
    """Design-weighted percentage per domain, computed independently in pandas.

    Only used to sanity-check what R returns: svyciprop's point estimate is the
    same Horvitz-Thompson ratio, so the two must agree closely. A disagreement
    means the R domain subsetting is selecting the wrong rows -- which is
    exactly the failure mode that silently produced NaN/0/100 zone estimates.
    """

    def rate(group: pd.DataFrame, col: str) -> float | None:
        values = group[col]
        mask = values.notna()
        weights = group["weight"][mask]
        if weights.sum() == 0:
            return None
        return 100 * float((values[mask] * weights).sum() / weights.sum())

    frames = []
    for level, keys in (("province", ["province"]), ("zone", ["zone_key"])):
        grouped = df.groupby(keys[0])
        frames.append(
            pd.DataFrame(
                {
                    "level": level,
                    "domain_key": list(grouped.groups),
                    "penta_cov_ref": [rate(g, "penta3") for _, g in grouped],
                    "zdc_cov_ref": [rate(g, "zero_dose") for _, g in grouped],
                }
            )
        )
    frames.append(
        pd.DataFrame(
            {
                "level": ["national"],
                "domain_key": ["national"],
                "penta_cov_ref": [rate(df, "penta3")],
                "zdc_cov_ref": [rate(df, "zero_dose")],
            }
        )
    )
    return pd.concat(frames, ignore_index=True)


def check_against_reference(
    wide: pd.DataFrame, reference: pd.DataFrame, tolerance: float = 1.0
) -> None:
    """Warn if R's point estimates drift from the pandas weighted means."""
    merged = wide.merge(reference, on=["level", "domain_key"], how="left")
    problems = []
    for metric in ("penta_cov", "zdc_cov"):
        ref = merged[f"{metric}_ref"]
        got = merged[metric]
        low, high = merged[f"{metric}_low"], merged[f"{metric}_high"]
        missing = got.isna() & ref.notna()
        drifted = (got - ref).abs() > tolerance
        for _, row in merged[missing | drifted].iterrows():
            problems.append(
                f"    {row['level']:>8} {row['domain_key']}: {metric} "
                f"R={row[metric]} vs weighted mean={row[f'{metric}_ref']:.1f}"
            )
        # A CI outside [0, 100], or one collapsed onto a point, is not a
        # confidence interval: flag it even when the estimate itself is right.
        impossible = (low < 0) | (high > 100) | (low > got) | (high < got)
        collapsed = (high <= low) & ref.notna()
        for _, row in merged[impossible.fillna(False)].iterrows():
            problems.append(
                f"    {row['level']:>8} {row['domain_key']}: {metric} CI "
                f"[{row[f'{metric}_low']}, {row[f'{metric}_high']}] is out of range"
            )
        for _, row in merged[collapsed.fillna(False)].iterrows():
            problems.append(
                f"    {row['level']:>8} {row['domain_key']}: {metric} CI "
                f"[{row[f'{metric}_low']}, {row[f'{metric}_high']}] is collapsed"
            )
    if problems:
        sys.stdout.flush()
        print(
            f"  WARNING: {len(problems)} estimate(s) disagree with the "
            f"weighted mean by more than {tolerance} point(s) or are missing:",
            file=sys.stderr,
        )
        for line in problems[:20]:
            print(line, file=sys.stderr)
        if len(problems) > 20:
            print(f"    ... and {len(problems) - 20} more", file=sys.stderr)
        sys.stderr.flush()
    else:
        print("  cross-check OK: all estimates match the weighted means")


def process_file(
    dta_path: Path,
    year: str,
    workdir: Path | None = None,
    age_min: int = AGE_MIN_MONTHS,
    age_max: int = AGE_MAX_MONTHS,
) -> pd.DataFrame:
    print(f"reading {dta_path.name} ...")
    df = load_year(dta_path, age_min, age_max)
    print(
        f"  analysing {len(df):,} children in "
        f"{df['zone_key'].nunique()} zones / {df['psu_key'].nunique()} areas"
    )

    counts = build_counts(df)

    print("  running R survey estimation ...")
    if workdir is None:
        with tempfile.TemporaryDirectory(prefix=f"ecv-{year}-") as tmp:
            est = run_survey_r(df, Path(tmp))
    else:
        # Keep the extract, the generated R script and the raw estimates so the
        # R step can be re-run and debugged by hand.
        year_dir = workdir / year
        year_dir.mkdir(parents=True, exist_ok=True)
        est = run_survey_r(df, year_dir)
        print(f"  kept R inputs/outputs in {year_dir}")
    wide = reshape_estimates(est)
    check_against_reference(wide, weighted_rates(df))

    out = counts.merge(wide, on=["level", "domain_key"], how="left")
    count_cols = ["nb_people", "nb_zones", "nb_areas", "nb_areas_tot"]
    out[count_cols] = out[count_cols].astype("Int64")
    out["year"] = year
    return out.drop(columns=["domain_key"])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=OUT_CSV,
        help=f"destination CSV (default: {OUT_CSV.relative_to(PROJECT_ROOT)})",
    )
    parser.add_argument(
        "--age-min",
        type=int,
        default=AGE_MIN_MONTHS,
        help=f"youngest age in completed months (default: {AGE_MIN_MONTHS})",
    )
    parser.add_argument(
        "--age-max",
        type=int,
        default=AGE_MAX_MONTHS,
        help=f"oldest age in completed months (default: {AGE_MAX_MONTHS})",
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

    frames = []
    for year in ("2022", "2023"):
        matches = sorted(INPUT_DIR.glob(f"ECV_{year}_*.dta"))
        if not matches:
            raise FileNotFoundError(f"no ECV_{year}_*.dta in {INPUT_DIR}")
        frames.append(
            process_file(matches[0], year, args.workdir, args.age_min, args.age_max)
        )

    output = pd.concat(frames, ignore_index=True)
    output = output[
        [
            "year",
            "level",
            "province",
            "zone",
            "nb_people",
            "nb_zones",
            "nb_areas",
            "nb_areas_tot",
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
