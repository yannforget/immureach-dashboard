"""Compute ECV vaccination-coverage percentages from the raw survey microdata.

Reads the Stata exports in data/input/ecv/ (ECV_2022_* and ECV_2023_*), keeps
children inside the age window (`vs25`, age in completed months; 6-23 by
default, which is the population both files were collected on, so the filter
is close to a no-op -- see AGE_MIN_MONTHS), and writes
public/data/ecv_vaccination_coverage.csv -- one row per national / province /
zone domain, year, age group and milieu, with a `_pct` / `_low` / `_high` triplet per
metric (point estimate and 95% confidence interval, 0-100).

`milieu` is the dashboard's rural/urbain ribbon filter, read off `q108`
("Milieu de localisation du menage"): every domain is estimated three times,
once on the whole sample (`all`) and once on each q108 modality (`urbain`,
`rural`). See MILIEUX.

`age_group` is the dashboard's age ribbon filter, read off `vs25`: the milieu
split above is repeated for each AGE_GROUPS window (6-24, 6-11 and 12-23
months), so every domain carries 3 x 3 rows per year. `--age-groups 6-24`
reproduces the output from before the age split.

The 17 antigen metrics come straight from the `<vaccine>_merg` columns, which
merge the vaccination card with the mother's recall and are coded
1 = vaccinated, 2 = not vaccinated. The one derived metric is:
  * zero_dose -- every `_merg` column says "not vaccinated"

Point estimates and 95% CIs are NOT computed in Python: the survey is a
stratified two-stage cluster design (strata = province `q101`, PSU = aire de
santé `q105`, weights = `ponderation`), so this script shells out to R's
`survey` package via `subprocess`, exactly like scripts/process_ecv_keys.py.
The CI is logit-transformed (`svyciprop(method = "logit")`), which behaves
properly for the small zone-level domains where coverage sits near 0 or 100%.

Province and zone names are canonicalised against
data/output/boundaries/zones.geojson so the output joins directly onto the
dashboard geometry (the dashboard's cleanName() applied to `level_2_name` /
`level_3_name`). Anything the geojson does not know about is reported and
dropped, so a renamed zone can never silently disappear from the map.

Counts (nb_children, nb_as, as_enq) are unweighted sample sizes.

Run from the project root (~10 minutes for both years and all three milieux --
each milieu is a full R pass; `--metrics` / `--years` / `--milieux` cut that
down when debugging, `--workdir` keeps the R extract and script so the R step
can be re-run by hand):

    python scripts/process-ecv-vaccination-coverage.py
    python scripts/process-ecv-vaccination-coverage.py --years 2022 --metrics penta3,zero_dose
    python scripts/process-ecv-vaccination-coverage.py --milieux all
    python scripts/process-ecv-vaccination-coverage.py --workdir /tmp/ecv-debug
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
import unicodedata
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
INPUT_DIR = PROJECT_ROOT / "data" / "input" / "ecv"
ZONES_GEOJSON = PROJECT_ROOT / "data" / "output" / "boundaries" / "zones.geojson"
OUT_CSV = PROJECT_ROOT / "public" / "data" / "ecv_vaccination_coverage.csv"

YEARS = ("2022", "2023")

# The ECV_<year>_*.dta exports are named after the year the file was produced,
# which is the year *before* the survey actually went to the field. Rows are
# labelled with that collection year, so the dashboard reports when the data
# was gathered rather than when the export was cut. A file already named
# after its fieldwork year (ECV2026) is passed through unchanged.
COLLECTION_YEAR = {"2022": "2023", "2023": "2024"}

# Age window in completed months, read off `vs25` ("Quel âge a ... en mois ?").
# Both exports were collected on 6-23 month olds (2022 spans exactly 6..23;
# 2023 has 43 rows outside it), so this window keeps essentially every child in
# the file rather than the 12-23 subset the coverage module reports on. Widen
# or narrow it per run with --age-min / --age-max.
AGE_MIN_MONTHS = 6
AGE_MAX_MONTHS = 23

# Survey design + geography columns.
STRATUM_COL = "q101"  # "Nom de la strate (de la province)"
ZONE_COL = "q103"  # "Nom de la zone de santé"
AREA_COL = "q105"  # "Nom de la grappe (de l'Aire de santé)" -- the PSU
WEIGHT_COL = "ponderation"
AGE_COL = "vs25"
AREAS_TOTAL_COL = "nbre_as"  # health areas in the zone (sampling frame)
AREAS_SURVEYED_COL = "nbre_asenq"  # health areas actually surveyed, per the file
MILIEU_COL = "q108"  # "Milieu de localisation du ménage"

# `q108` modalities, per the Stata value labels: 1 = Urbain, 2 = Rurale. The
# dashboard's milieu ribbon filter reads the `milieu` column built from them.
MILIEU_BY_CODE = {1: "urbain", 2: "rural"}

# Every domain is estimated once per entry: "all" is the whole sample -- the
# only thing the file carried before the milieu split -- and the other two are
# the q108 modalities. Urban zone domains are sparse (only ~190 of the ~505
# zones have any urban child, a third of those from a single aire de santé),
# so expect empty cells and wide intervals there; the CI fallback in the R
# script handles them the same way it handles small zones.
MILIEUX = ("all", *MILIEU_BY_CODE.values())

# The dashboard's age ribbon filter. Every (milieu) domain is estimated once per
# entry, on the children whose `vs25` falls inside the inclusive window. "6-24"
# is the whole load window -- the only thing the file carried before the age
# split -- and the other two are the classic infant / second-year cohorts.
# A 24-month-old sits in "6-24" only, so the two cohorts do not add up to it.
AGE_GROUPS = {"6-24": (6, 23), "6-11": (6, 11), "12-23": (12, 23)}
DEFAULT_AGE_GROUP = "6-23"

# Dashboard metric key -> `<vaccine>_merg` column.
# The 2023 file additionally carries `vpi2_merg` / `var2_merg` (second doses);
# they have no 2022 counterpart and no dashboard metric, so they are ignored.
MERG_BY_METRIC = {
    "bcg": "bcg_merg",
    "penta1": "penta1_merg",
    "penta2": "penta2_merg",
    "penta3": "penta3_merg",
    "polio0": "vpo0_merg",
    "polio1": "vpo1_merg",
    "polio2": "vpo2_merg",
    "polio3": "vpo3_merg",
    "pcv1": "pcv1_merg",
    "pcv2": "pcv2_merg",
    "pcv3": "pcv3_merg",
    "rota1": "rota1_merg",
    "rota2": "rota2_merg",
    "rota3": "rota3_merg",
    "vpi": "vpi_merg",
    "var": "var_merg",
    "vaa": "vaa_merg",
}
MERG_COLUMNS = list(MERG_BY_METRIC.values())

# Output metric order (EcvMetricKey order, minus the three keys the dashboard
# never reads).
METRICS = ["zero_dose", *MERG_BY_METRIC]

VACCINATED = 1
NOT_VACCINATED = 2

# The file's own zero-dose flag. Not an output metric: it exists only so the
# derived zero_dose can be checked against it (see report_indicators).
ZERO_DOSE_REF_COL = "dose0_1"

LOAD_COLUMNS = [
    STRATUM_COL,
    ZONE_COL,
    AREA_COL,
    WEIGHT_COL,
    AGE_COL,
    AREAS_TOTAL_COL,
    AREAS_SURVEYED_COL,
    MILIEU_COL,
    ZERO_DOSE_REF_COL,
    *MERG_COLUMNS,
]

NAME_PREFIX_RE = re.compile(r"^[A-Za-z]{2}\s+")
NAME_SUFFIX_RE = re.compile(
    r"\s+(Province|Zone\s+de\s+Sant\w*|Aire\s+de\s+Sant\w*)\s*$",
    flags=re.IGNORECASE,
)

COUNT_COLS = ["nb_children", "nb_as", "as_enq"]

R_SCRIPT = r"""
# Design-based estimation of vaccination coverage with 95% confidence
# intervals. Called by scripts/process-ecv-vaccination-coverage.py. 
# Reads the child-level extract, writes one row per (domain, indicator) 
# with the point estimate and CI bounds as proportions.
if (!requireNamespace("survey", quietly = TRUE)) {
  stop("the R package 'survey' is not installed: install.packages(\"survey\")")
}
suppressPackageStartupMessages(library(survey))

# Subsetting to a single zone can leave a stratum contributing one PSU; centre
# those on the grand mean rather than dropping the variance contribution.
options(survey.lonely.psu = "adjust")
options(nwarnings = 10000L)

# Which estimator actually produced each figure. Reported at the end so a
# silent mass fallback (the symptom of a broken domain subset) is visible.
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

# message() writes to stderr, which the Python side forwards to the terminal.
report_warnings <- function() {
  keys <- ls(warn_log, all.names = TRUE)
  if (length(keys) == 0L) {
    message("no warnings from the survey estimation")
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
indicators <- strsplit(args[3], ",", fixed = TRUE)[[1]]
labels_csv <- args[4]

# Domains travel as integer ids (accents do not survive the round trip
# reliably), so read the id -> name table back in: a warning that names a
# number the reader cannot act on is not worth printing.
labels <- read.csv(labels_csv, stringsAsFactors = FALSE, encoding = "UTF-8")
label_of <- function(level, id) {
  hit <- labels$name[labels$level == level & labels$id == id]
  if (length(hit) == 0L) paste0(level, " id=", id) else paste0(level, " ", hit[1])
}

d <- read.csv(in_csv, stringsAsFactors = FALSE)
message(sprintf(
  "  [R] %d rows, %d indicator(s): %s",
  nrow(d), length(indicators), paste(indicators, collapse = ", ")
))

missing <- setdiff(indicators, names(d))
if (length(missing) > 0L) {
  stop(sprintf("indicator column(s) absent from the extract: %s",
               paste(missing, collapse = ", ")))
}

# Stratified two-stage design: strata = province, PSU = aire de santé,
# weights = the survey's `ponderation`. nest = TRUE because PSU ids are only
# unique within a stratum.
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
# for the small, near-degenerate zone domains; fall back to the beta interval
# on the domains where the logit fit cannot be evaluated.
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
  # zero events, the logit fit runs its intercept off to -Inf and returns the
  # interval [0, 0], which claims certainty the true rate is exactly 0. With
  # ~120 children the honest upper bound is around 3/120, so [0, 0] is false
  # precision, not a tight estimate. Those are the domains the "algorithm did
  # not converge" warnings point at.
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

# Domains to estimate: the whole sample, then each province, then each zone.
province_ids <- sort(unique(d$province_id))
zone_ids <- sort(unique(d$zone_id))

domains <- c(
  list(list(level = "national", id = -1L, label = "national",
            keep = rep(TRUE, nrow(d)))),
  lapply(province_ids, function(pid) {
    list(level = "province", id = pid, label = label_of("province", pid),
         keep = d$province_id == pid)
  }),
  lapply(zone_ids, function(zid) {
    list(level = "zone", id = zid, label = label_of("zone", zid),
         keep = d$zone_id == zid)
  })
)
message(sprintf(
  "  [R] %d domains (1 national, %d provinces, %d zones) x %d indicators = %d estimates",
  length(domains), length(province_ids), length(zone_ids), length(indicators),
  length(domains) * length(indicators)
))

n <- length(domains) * length(indicators)
res_level <- character(n)
res_id <- integer(n)
res_indicator <- character(n)
res_est <- numeric(n)
res_low <- numeric(n)
res_high <- numeric(n)

started <- Sys.time()
row <- 1L
for (i in seq_along(domains)) {
  dom <- domains[[i]]
  dsn <- if (dom$level == "national") design else domain(design, dom$keep)
  for (ind in indicators) {
    context <- paste0(dom$label, ", indicator=", ind)
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
  # Progress, so a run that is merely slow is distinguishable from one stuck.
  if (i %% 50L == 0L || i == length(domains)) {
    elapsed <- max(0, as.numeric(difftime(Sys.time(), started, units = "secs")))
    message(sprintf(
      "  [R] %d/%d domains, %d estimates, %.0fs elapsed (~%.0fs left)",
      i, length(domains), row - 1L, elapsed,
      elapsed / i * (length(domains) - i)
    ))
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
  "  [R] estimates: %d logit CI, %d beta CI (boundary domains), %d without a CI",
  tally$logit, tally$beta, tally$failed
))

report_warnings()
"""


def clean_name(series: pd.Series) -> pd.Series:
    """Strip the province code prefix and the level suffix off."""
    return (
        series.astype(str)
        .str.replace(NAME_PREFIX_RE, "", regex=True)
        .str.replace(NAME_SUFFIX_RE, "", regex=True)
        .str.strip()
    )


def normalize(name: str) -> str:
    """Accent- and case-insensitive key for joining names across sources."""
    stripped = NAME_SUFFIX_RE.sub("", NAME_PREFIX_RE.sub("", str(name))).strip()
    decomposed = unicodedata.normalize("NFD", stripped)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()


def load_geojson_names(path: Path) -> tuple[dict[str, str], dict[str, tuple[str, str]]]:
    """Canonical province / zone names from the dashboard's zone boundaries."""
    if not path.exists():
        raise FileNotFoundError(
            f"zone boundaries not found: {path}\n"
            "Run scripts/generate-boundaries.py first."
        )
    geo = json.loads(path.read_text(encoding="utf-8"))
    features = geo.get("features", [])
    provinces: dict[str, str] = {}
    zones: dict[str, tuple[str, str]] = {}
    for feature in features:
        props = feature.get("properties", {})
        raw_province = props.get("level_2_name")
        raw_zone = props.get("level_3_name")
        if not raw_province or not raw_zone:
            print(f"  WARNING: geojson feature without a name: {props}")
            continue
        province = NAME_SUFFIX_RE.sub(
            "", NAME_PREFIX_RE.sub("", str(raw_province))
        ).strip()
        zone = NAME_SUFFIX_RE.sub("", NAME_PREFIX_RE.sub("", str(raw_zone))).strip()
        provinces[normalize(province)] = province
        zones[f"{normalize(province)}|{normalize(zone)}"] = (province, zone)
    print(
        f"  {path.relative_to(PROJECT_ROOT)}: {len(features)} features -> "
        f"{len(provinces)} provinces, {len(zones)} zones"
    )
    if len(zones) != len(features):
        print(
            f"  WARNING: {len(features) - len(zones)} feature(s) collapsed onto an "
            "existing province|zone key (duplicate geometry?)"
        )
    return provinces, zones


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
    key = df["province"].map(normalize) + "|" + df["zone"].map(normalize)
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

    unknown_provinces = sorted(set(df["province"].map(normalize)) - set(provinces))
    if unknown_provinces:
        print(f"  WARNING: province(s) absent from the boundaries: {unknown_provinces}")

    df = df[~unknown].copy()
    df["province"] = [pair[0] for pair in matched[~unknown]]
    df["zone"] = [pair[1] for pair in matched[~unknown]]
    df["zone_key"] = df["province"] + " | " + df["zone"]
    df["psu_key"] = df["zone_key"] + " | " + df["area"]

    covered = set(
        df["zone_key"].map(
            lambda k: normalize(k.split(" | ")[0]) + "|" + normalize(k.split(" | ")[1])
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


def build_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Add one 0/1 column per dashboard metric, NA where the answer is unknown.

    Every metric is an "is this child X?" flag, so a design-weighted mean of
    the column is the coverage proportion which is exactly what svyciprop
    estimates on the R side.
    """
    merg = df[MERG_COLUMNS].apply(pd.to_numeric, errors="coerce")

    unexpected = {}
    for col in MERG_COLUMNS:
        bad = merg[col].notna() & ~merg[col].isin([VACCINATED, NOT_VACCINATED])
        if bad.any():
            unexpected[col] = sorted(merg.loc[bad, col].unique())[:5]
    if unexpected:
        print(
            "  WARNING: `_merg` codes other than 1/2 (treated as 'not "
            f"vaccinated'): {unexpected}"
        )

    for metric, col in MERG_BY_METRIC.items():
        values = (merg[col] == VACCINATED).astype("Int64")
        values[merg[col].isna()] = pd.NA
        df[metric] = values

    # Zero-dose: no antigen at all, i.e. every merged vaccine column says "not
    # vaccinated".
    zero_dose = (merg == NOT_VACCINATED).all(axis=1).astype("Int64")
    zero_dose[merg.isna().any(axis=1)] = pd.NA
    df["zero_dose"] = zero_dose

    # Kept alongside the metrics purely so report_indicators() can compare the
    # derived zero-dose against the one the survey file ships with.
    df["zero_dose_ref"] = pd.to_numeric(df[ZERO_DOSE_REF_COL], errors="coerce")

    return df


def report_indicators(df: pd.DataFrame, metrics: list[str]) -> None:
    """Unweighted vs design-weighted national rate per metric, plus NA counts.

    Printed for every run: it is the quickest way to spot a metric that has
    been derived from the wrong column or the wrong code (a coverage that is
    the complement of what it should be shows up immediately).
    """
    print("  national rates per metric (unweighted / weighted, before R):")
    weight = df["weight"]
    for metric in metrics:
        values = df[metric]
        mask = values.notna()
        if not mask.any():
            print(f"    {metric:<20} ALL MISSING")
            continue
        unweighted = 100 * float(values[mask].mean())
        weighted = 100 * float((values[mask] * weight[mask]).sum() / weight[mask].sum())
        missing = int((~mask).sum())
        flag = "  <-- no variation" if values[mask].nunique() < 2 else ""
        print(
            f"    {metric:<20} {unweighted:5.1f} / {weighted:5.1f}   "
            f"n={int(mask.sum()):,} missing={missing:,}{flag}"
        )

    # The file ships its own zero-dose flag; the derived one must track it.
    if "zero_dose_ref" in df.columns and "zero_dose" in df.columns:
        ref = df["zero_dose_ref"]
        both = df["zero_dose"].notna() & ref.notna()
        if both.any():
            agreement = 100 * float(
                (df.loc[both, "zero_dose"].astype(int) == (ref[both] == 1)).mean()
            )
            print(
                f"    cross-check: derived zero_dose agrees with "
                f"`{ZERO_DOSE_REF_COL}` on {agreement:.1f}% of children "
                f"({100 * float((ref[both] == 1).mean()):.1f}% flagged there)"
            )
            if agreement < 95:
                print(
                    "    WARNING: the two zero-dose definitions disagree on more "
                    "than 5% of children -- check the `_merg` column list"
                )


def load_year(
    dta_path: Path,
    provinces: dict[str, str],
    zones: dict[str, tuple[str, str]],
    age_min: int,
    age_max: int,
) -> pd.DataFrame:
    """Read one ECV Stata export into the tidy child-level frame used downstream."""
    print(f"  reading {dta_path.name} ...")
    started = time.perf_counter()
    raw = pd.read_stata(dta_path, columns=LOAD_COLUMNS, convert_categoricals=False)
    print(
        f"  loaded {len(raw):,} rows x {len(raw.columns)} columns in "
        f"{time.perf_counter() - started:.1f}s"
    )

    age = pd.to_numeric(raw[AGE_COL], errors="coerce")
    in_range = age.between(age_min, age_max)
    # Report what the age filter actually removed, so a window that silently
    # matches (or drops) the whole file is obvious from the run log.
    print(
        f"  age filter `{AGE_COL}`: {len(raw):,} children -> "
        f"{int(in_range.sum()):,} aged {age_min}-{age_max} months "
        f"({int((~in_range).sum()):,} dropped, {int(age.isna().sum()):,} with no age)"
    )
    if in_range.sum() == 0:
        raise ValueError(
            f"no child aged {age_min}-{age_max} months in {dta_path.name}; "
            f"`{AGE_COL}` spans {age.min()}-{age.max()}"
        )
    df = raw[in_range].copy()

    df["province"] = clean_name(df[STRATUM_COL])
    df["zone"] = clean_name(df[ZONE_COL])
    df["area"] = clean_name(df[AREA_COL])
    df["weight"] = pd.to_numeric(df[WEIGHT_COL], errors="coerce")
    df["nb_as"] = pd.to_numeric(df[AREAS_TOTAL_COL], errors="coerce")
    df["as_enq_file"] = pd.to_numeric(df[AREAS_SURVEYED_COL], errors="coerce")
    df["age"] = age[in_range]
    df["milieu"] = pd.to_numeric(df[MILIEU_COL], errors="coerce").map(MILIEU_BY_CODE)

    # The milieu split is a filter, not an indicator: a child whose `q108` is
    # missing or carries an unexpected code still counts in the "all" domain,
    # it just never lands in a urbain/rural one. Report it so a file that codes
    # the question differently is caught rather than silently halving the split.
    unknown_milieu = df["milieu"].isna()
    counts = df["milieu"].value_counts().to_dict()
    print(
        f"  milieu `{MILIEU_COL}`: "
        + ", ".join(f"{name} {n:,}" for name, n in sorted(counts.items()))
        + f" ({int(unknown_milieu.sum()):,} with no milieu)"
    )
    if unknown_milieu.any():
        codes = sorted(
            pd.to_numeric(df.loc[unknown_milieu, MILIEU_COL], errors="coerce")
            .dropna()
            .unique()
            .tolist()
        )
        print(
            f"  WARNING: {int(unknown_milieu.sum()):,} children carry a `{MILIEU_COL}` "
            f"outside {sorted(MILIEU_BY_CODE)} (codes seen: {codes or 'none, all blank'}); "
            "they are counted in the `all` milieu only"
        )

    df = canonicalize_names(df, provinces, zones)
    df = build_indicators(df)

    no_weight = int(df["weight"].isna().sum())
    if no_weight:
        print(f"  WARNING: dropping {no_weight:,} children without a `{WEIGHT_COL}`")
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
        "nb_as",
        "as_enq_file",
        "age",
        "milieu",
        "zero_dose_ref",
        *METRICS,
    ]
    return df[keep]


def build_counts(df: pd.DataFrame, check_as_enq: bool = True) -> pd.DataFrame:
    """Unweighted sample sizes per domain: children, health areas surveyed/total.

    `check_as_enq` compares the distinct PSU count against the file's own
    `nbre_asenq`. It only holds on the full sample: inside a milieu subset a
    zone keeps just the aires de santé that have a child of that milieu, so the
    two legitimately differ and the check is skipped.
    """
    zone_totals = df.groupby("zone_key")["nb_as"].max()

    zone = (
        df.groupby(["province", "zone", "zone_key"])
        .agg(nb_children=("weight", "size"), as_enq=("psu_key", "nunique"))
        .reset_index()
    )
    zone["nb_as"] = zone["zone_key"].map(zone_totals)
    zone["level"] = "zone"
    zone["domain_key"] = zone["zone_key"]

    # `nbre_asenq` is the file's own count of surveyed areas; the distinct PSU
    # count must reproduce it, and a mismatch means the PSU key is wrong.
    if check_as_enq:
        counted = zone.set_index("zone_key")["as_enq"]
        declared = df.groupby("zone_key")["as_enq_file"].max().reindex(counted.index)
        mismatch = pd.DataFrame({"counted": counted, "declared": declared})
        mismatch = mismatch[
            mismatch["declared"].notna() & (mismatch["counted"] != mismatch["declared"])
        ]
        if len(mismatch):
            print(
                f"  WARNING: {len(mismatch)} zone(s) where the distinct PSU count "
                f"differs from `{AREAS_SURVEYED_COL}`:"
            )
            for zone_key, row in mismatch.head(10).iterrows():
                print(
                    f"    {zone_key}: counted {int(row['counted'])}, file says "
                    f"{row['declared']:.0f}"
                )
        else:
            print(f"  as_enq matches `{AREAS_SURVEYED_COL}` in every zone")

    province = (
        df.groupby("province")
        .agg(nb_children=("weight", "size"), as_enq=("psu_key", "nunique"))
        .reset_index()
    )
    province["nb_as"] = province["province"].map(
        df.drop_duplicates("zone_key").groupby("province")["nb_as"].sum()
    )
    province["zone"] = None
    province["level"] = "province"
    province["domain_key"] = province["province"]

    national = pd.DataFrame(
        [
            {
                "province": None,
                "zone": None,
                "nb_children": len(df),
                "as_enq": df["psu_key"].nunique(),
                "nb_as": df.drop_duplicates("zone_key")["nb_as"].sum(),
                "level": "national",
                "domain_key": "national",
            }
        ]
    )

    cols = ["level", "domain_key", "province", "zone", *COUNT_COLS]
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
    df: pd.DataFrame, metrics: list[str], rscript: str, workdir: Path
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
            **{metric: df[metric] for metric in metrics},
        }
    )

    labels = pd.DataFrame(
        [
            {"level": "province", "id": i, "name": name}
            for name, i in province_ids.items()
        ]
        + [{"level": "zone", "id": i, "name": name} for name, i in zone_ids.items()]
    )

    in_csv = workdir / "ecv_extract.csv"
    out_csv = workdir / "ecv_estimates.csv"
    labels_csv = workdir / "ecv_domains.csv"
    r_file = workdir / "ecv_survey.R"
    extract.to_csv(in_csv, index=False)
    labels.to_csv(labels_csv, index=False, encoding="utf-8")
    r_file.write_text(R_SCRIPT, encoding="utf-8")
    print(
        f"  wrote the R extract: {len(extract):,} rows, "
        f"{len(provinces)} strata, {len(psus)} PSUs -> {in_csv}"
    )

    started = time.perf_counter()
    # R writes its progress, warnings *and* its fatal error to stderr, so tee
    # it: echo each line as it arrives (the run takes minutes and the progress
    # lines are the only sign it is alive) and keep a copy for the exception
    # below. Inheriting stderr instead would print the error to the terminal
    # but leave the raised RuntimeError carrying nothing but an empty stdout.
    #
    # Reading stderr to EOF before draining stdout cannot deadlock here: the R
    # script writes nothing to stdout, so that pipe never fills.
    sys.stdout.flush()
    proc = subprocess.Popen(
        [
            rscript,
            "--vanilla",
            str(r_file),
            str(in_csv),
            str(out_csv),
            ",".join(metrics),
            str(labels_csv),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    assert proc.stderr is not None
    stderr_lines: list[str] = []
    for line in proc.stderr:
        sys.stderr.write(line)
        stderr_lines.append(line)
    sys.stderr.flush()
    stdout, _ = proc.communicate()
    print(f"  R finished in {time.perf_counter() - started:.1f}s")
    if proc.returncode != 0:
        # Keep the tail: a failure late in the run is preceded by thousands of
        # progress lines, and the message that matters is the last one.
        tail = "".join(stderr_lines[-40:]).strip()
        raise RuntimeError(
            f"Rscript failed (exit {proc.returncode}).\n"
            f"--- stderr (last {min(len(stderr_lines), 40)} line(s)) ---\n{tail}\n"
            f"--- stdout ---\n{stdout}"
        )
    if stdout.strip():
        print(f"  [R stdout] {stdout.strip()}")

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


def reshape_estimates(est: pd.DataFrame, metrics: list[str]) -> pd.DataFrame:
    """Long R output -> one row per domain with the dashboard's column names."""
    wide = est.pivot(
        index=["level", "domain_key"],
        columns="indicator",
        values=["est", "low", "high"],
    )
    suffix = {"est": "pct", "low": "low", "high": "high"}
    wide.columns = [f"{metric}_{suffix[stat]}" for stat, metric in wide.columns]
    wide = wide.reset_index()
    # svyciprop returns proportions; the dashboard reads 0-100 percentages.
    value_cols = [c for c in wide.columns if c not in ("level", "domain_key")]
    wide[value_cols] = (wide[value_cols] * 100).round(1)
    ordered = [
        f"{metric}_{stat}" for metric in metrics for stat in ("pct", "low", "high")
    ]
    return wide[["level", "domain_key", *ordered]]


def weighted_rates(df: pd.DataFrame, metrics: list[str]) -> pd.DataFrame:
    """Design-weighted percentage per domain, computed independently in pandas.

    Only used to sanity-check what R returns: svyciprop's point estimate is the
    same Horvitz-Thompson ratio, so the two must agree closely. A disagreement
    means the R domain subsetting is selecting the wrong rows -- which is
    exactly the failure mode that silently produces NaN/0/100 zone estimates.
    """

    def rates(group: pd.DataFrame) -> dict[str, float | None]:
        out: dict[str, float | None] = {}
        for metric in metrics:
            values = group[metric]
            mask = values.notna()
            weights = group["weight"][mask]
            out[f"{metric}_ref"] = (
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
    metrics: list[str],
    tolerance: float = 1.0,
) -> None:
    """Warn if R's point estimates drift from the pandas weighted means."""
    merged = wide.merge(reference, on=["level", "domain_key"], how="left")
    problems: list[str] = []
    for metric in metrics:
        ref = merged[f"{metric}_ref"]
        got = merged[f"{metric}_pct"]
        low, high = merged[f"{metric}_low"], merged[f"{metric}_high"]
        missing = got.isna() & ref.notna()
        drifted = (got - ref).abs() > tolerance
        for _, row in merged[missing | drifted.fillna(False)].iterrows():
            problems.append(
                f"    {row['level']:>8} {row['domain_key']}: {metric} "
                f"R={row[f'{metric}_pct']} vs weighted mean={row[f'{metric}_ref']}"
            )
        # A CI outside [0, 100], or one that does not contain the estimate, is
        # not a confidence interval -- flag it even when the estimate is right.
        impossible = (low < 0) | (high > 100) | (low > got) | (high < got)
        for _, row in merged[impossible.fillna(False)].iterrows():
            problems.append(
                f"    {row['level']:>8} {row['domain_key']}: {metric} CI "
                f"[{row[f'{metric}_low']}, {row[f'{metric}_high']}] is out of range"
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
    age_group: str,
    milieu: str,
    metrics: list[str],
    rscript: str,
    workdir: Path | None,
) -> pd.DataFrame:
    """Estimate every domain on one milieu subset of a year's children.

    The subset is taken before `svydesign()` is built rather than through
    `subset()` on a full-sample design. That matches what the R script already
    does for the province and zone domains (see the `domain()` comment there),
    so a milieu domain is estimated exactly the way a zone domain is.
    """
    counts = build_counts(
        df, check_as_enq=milieu == "all" and age_group == DEFAULT_AGE_GROUP
    )
    print(
        f"  domains: {int((counts['level'] == 'province').sum())} provinces, "
        f"{int((counts['level'] == 'zone').sum())} zones, 1 national"
    )

    print("  running the R survey estimation ...")
    if workdir is None:
        with tempfile.TemporaryDirectory(
            prefix=f"ecv-{year}-{age_group}-{milieu}-"
        ) as tmp:
            est = run_survey_r(df, metrics, rscript, Path(tmp))
    else:
        # Keep the extract, the generated R script and the raw estimates so the
        # R step can be re-run and debugged by hand.
        run_dir = workdir / year / age_group / milieu
        run_dir.mkdir(parents=True, exist_ok=True)
        est = run_survey_r(df, metrics, rscript, run_dir)
        print(f"  kept the R inputs/outputs in {run_dir}")

    wide = reshape_estimates(est, metrics)
    check_against_reference(wide, weighted_rates(df, metrics), metrics)

    out = counts.merge(wide, on=["level", "domain_key"], how="left")
    unmatched = int(out[f"{metrics[0]}_pct"].isna().sum())
    if unmatched:
        print(f"  WARNING: {unmatched} domain(s) got no estimate from R")
    out[COUNT_COLS] = out[COUNT_COLS].astype("Int64")
    out["year"] = COLLECTION_YEAR.get(year, year)
    out["age_group"] = age_group
    out["milieu"] = milieu
    print(f"  {len(out)} rows for {year} / {age_group} months / {milieu}")
    return out.drop(columns=["domain_key"])


def process_file(
    dta_path: Path,
    year: str,
    metrics: list[str],
    milieux: list[str],
    age_groups: list[str],
    rscript: str,
    workdir: Path | None,
    age_min: int,
    age_max: int,
    provinces: dict[str, str],
    zones: dict[str, tuple[str, str]],
) -> pd.DataFrame:
    print(f"\n=== {year} ===")
    df = load_year(dta_path, provinces, zones, age_min, age_max)
    print(
        f"  analysing {len(df):,} children in {df['province'].nunique()} provinces / "
        f"{df['zone_key'].nunique()} zones / {df['psu_key'].nunique()} areas"
    )
    report_indicators(df, metrics)

    frames = []
    for age_group in age_groups:
        lo, hi = AGE_GROUPS[age_group]
        in_age = df[df["age"].between(lo, hi)]
        for milieu in milieux:
            subset = in_age if milieu == "all" else in_age[in_age["milieu"] == milieu]
            print(
                f"\n--- {year} / age={age_group} / milieu={milieu}: "
                f"{len(subset):,} children in "
                f"{subset['province'].nunique()} provinces / "
                f"{subset['zone_key'].nunique()} zones / "
                f"{subset['psu_key'].nunique()} areas ---"
            )
            if subset.empty:
                print(
                    f"  WARNING: no child aged {age_group} months with "
                    f"milieu={milieu}; no rows emitted"
                )
                continue
            frames.append(
                process_milieu(
                    subset, year, age_group, milieu, metrics, rscript, workdir
                )
            )

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
        default=OUT_CSV,
        help=f"destination CSV (default: {OUT_CSV.relative_to(PROJECT_ROOT)})",
    )
    parser.add_argument(
        "--boundaries",
        type=Path,
        default=ZONES_GEOJSON,
        help=f"zone boundaries (default: {ZONES_GEOJSON.relative_to(PROJECT_ROOT)})",
    )
    parser.add_argument(
        "--years",
        default=",".join(YEARS),
        help=f"comma-separated source-file years to process, as named in the\n"
        f"ECV_<year>_*.dta filenames (default: {','.join(YEARS)})",
    )
    parser.add_argument(
        "--metrics",
        default=",".join(METRICS),
        help="comma-separated subset of metrics, for quick debugging runs "
        f"(default: all {len(METRICS)})",
    )
    parser.add_argument(
        "--milieux",
        default=",".join(MILIEUX),
        help="comma-separated subset of milieu domains to estimate; each one "
        "costs a full R pass over every province and zone "
        f"(default: {','.join(MILIEUX)})",
    )
    parser.add_argument(
        "--age-groups",
        default=",".join(AGE_GROUPS),
        help="comma-separated subset of age groups (months, inclusive) to "
        "estimate; each one costs a full R pass per milieu "
        f"(default: {','.join(AGE_GROUPS)})",
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
    print("ECV vaccination coverage")
    print(f"  input dir : {INPUT_DIR}")
    print(f"  output    : {args.output}")
    print(f"  age window: {args.age_min}-{args.age_max} completed months")

    years = [y.strip() for y in args.years.split(",") if y.strip()]
    metrics = [m.strip() for m in args.metrics.split(",") if m.strip()]
    unknown = [m for m in metrics if m not in METRICS]
    if unknown:
        raise SystemExit(f"unknown metric(s): {unknown}\nknown metrics: {METRICS}")
    milieux = [m.strip() for m in args.milieux.split(",") if m.strip()]
    unknown = [m for m in milieux if m not in MILIEUX]
    if unknown:
        raise SystemExit(f"unknown milieu(x): {unknown}\nknown milieux: {MILIEUX}")
    print(f"  years     : {years}")
    print(f"  metrics   : {len(metrics)} -> {metrics}")
    age_groups = [a.strip() for a in args.age_groups.split(",") if a.strip()]
    unknown = [a for a in age_groups if a not in AGE_GROUPS]
    if unknown:
        raise SystemExit(
            f"unknown age group(s): {unknown}\nknown age groups: {list(AGE_GROUPS)}"
        )
    print(f"  milieux   : {milieux}")
    print(f"  age groups: {age_groups}")

    rscript = resolve_rscript(args.rscript)
    provinces, zones = load_geojson_names(args.boundaries)

    frames = []
    for year in years:
        matches = sorted(INPUT_DIR.glob(f"ECV_{year}_*.dta"))
        if not matches:
            raise FileNotFoundError(f"no ECV_{year}_*.dta in {INPUT_DIR}")
        if len(matches) > 1:
            print(
                f"  WARNING: {len(matches)} files match ECV_{year}_*.dta, using "
                f"{matches[0].name}"
            )
        frames.append(
            process_file(
                matches[0],
                year,
                metrics,
                milieux,
                age_groups,
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
        f"{metric}_{stat}" for metric in metrics for stat in ("pct", "low", "high")
    ]
    output = output[
        [
            "year",
            "age_group",
            "milieu",
            "level",
            "province",
            "zone",
            *COUNT_COLS,
            *ordered,
        ]
    ]

    print("\n=== output ===")
    for level in ("national", "province", "zone"):
        at_level = output[output["level"] == level]
        for age_group in age_groups:
            for milieu in milieux:
                sel = at_level[
                    (at_level["age_group"] == age_group)
                    & (at_level["milieu"] == milieu)
                ]
                by_year = sel.groupby("year").size()
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
        print(f"  note: rows without a point estimate, per metric: {missing_pct}")
    missing_ci = sum(
        int(output[c].isna().sum()) for c in ordered if c.endswith(("_low", "_high"))
    )
    print(f"  missing CI bounds across the file: {missing_ci:,}")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(args.output, index=False)
    print(
        f"wrote {args.output} ({len(output)} rows x {len(output.columns)} columns) "
        f"in {time.perf_counter() - started:.1f}s"
    )


if __name__ == "__main__":
    main()
