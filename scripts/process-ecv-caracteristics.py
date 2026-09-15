"""Compute ECV household/child characteristics from the raw survey microdata.

Reads the Stata exports in data/input/ecv/ (ECV_2022_* and ECV_2023_*), keeps
children inside the age window (`vs25`, age in completed months; 6-23 by
default, which is the population both files were collected on), and writes
public/data/ecv_caracteristics.csv -- one row per national / province / zone
domain and year, with a `_pct` / `_low` / `_high` triplet per variable (point
estimate and 95% confidence interval, 0-100).

This is the file behind the characteristics bar chart at the bottom right of
the dashboard's first tab. The chart derives its tabs from the `<root>_pct`
columns it finds in the header (see src/hooks/ecv/useEcvCaracteristicsData.ts),
so adding a variable to INDICATORS below is enough to make it appear; give it
a French label and a tab grouping in ECV_CARACTERISTIC_VARIABLE_LABELS /
ECV_CARACTERISTIC_GROUPS (src/lib/utils/constants.ts) to control how it reads.

WHAT THE VARIABLES ARE. Grouped by theme; the source column and the codes
counted as "yes" are in INDICATORS, and every code outside the yes/no lists
("ne sait pas", "non-reponse", ...) becomes a missing value rather than a "no".

  Document de vaccination
    possession_carte      has a vaccination card/booklet (`vs26`), whether or
                          not the interviewer got to see it
    carte_ou_document     has a card *or* any other document from a health
                          worker -- the wider definition of the same question

  Mere / gardienne (who answered for the child)
    mere                  the respondent is the child's mother (`qa100`)
    gardienne             the respondent is another caregiver (same question);
                          mere + gardienne sum to 100% by construction

  Enregistrement de la naissance
    certificat_naissance  the child has a birth certificate (`vs25d`, seen or
                          declared)
    naissance_enregistree the birth was registered with the civil authority
                          (`vs25e`)

Province and zone names are canonicalised against
data/output/boundaries/zones.geojson so the output joins directly onto the
dashboard geometry. Anything the geojson does not know about is reported and
dropped, so a renamed zone can never silently disappear from the chart.

Run from the project root (~5 minutes for both years; `--variables` / `--years`
cut that down when debugging, `--workdir` keeps the R extract and script so the
R step can be re-run by hand):

    python run scripts/process-ecv-caracteristics.py
    python run scripts/process-ecv-caracteristics.py --years 2022 --variables mere,gardienne
    python run scripts/process-ecv-caracteristics.py --workdir /tmp/ecv-carac-debug
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
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
INPUT_DIR = PROJECT_ROOT / "data" / "input" / "ecv"
ZONES_GEOJSON = PROJECT_ROOT / "data" / "output" / "boundaries" / "zones.geojson"
OUT_CSV = PROJECT_ROOT / "public" / "data" / "ecv_caracteristics.csv"

YEARS = ("2022", "2023")
AGE_MIN_MONTHS = 6
AGE_MAX_MONTHS = 24

# Survey design + geography columns, identical to the coverage script.
STRATUM_COL = "q101"  # "Nom de la strate (de la province)"
ZONE_COL = "q103"  # "Nom de la zone de santé"
AREA_COL = "q105"  # "Nom de la grappe (de l'Aire de santé)" -- the PSU
WEIGHT_COL = "ponderation"
AGE_COL = "vs25"


@dataclass(frozen=True)
class Indicator:
    """One yes/no variable: which column it comes from and how it is coded.

    `yes` and `no` are the source codes counted as 1 and 0; every other code
    (and a blank cell) becomes a missing value, which drops the child from that
    variable's denominator only -- "ne sait pas" is not evidence of "no".
    """

    key: str
    column: str
    yes: tuple[int, ...]
    no: tuple[int, ...]
    label: str


# Output order: this is the order the chart's tabs appear in.
INDICATORS: tuple[Indicator, ...] = (
    # -- Document de vaccination -------------------------------------------
    # vs26: 1 = carte seule, 2 = autre document seul, 3 = les deux, 4 = rien.
    Indicator("possession_carte", "vs26", (1, 3), (2, 4), "Possession de carte"),
    Indicator("carte_ou_document", "vs26", (1, 2, 3), (4,), "Carte ou document"),
    # -- Mere / gardienne ---------------------------------------------------
    Indicator("mere", "qa100", (1,), (2,), "Mère"),
    Indicator("gardienne", "qa100", (2,), (1,), "Gardienne"),
    # -- Enregistrement de la naissance -------------------------------------
    # vs25d: 1 = oui vu, 2 = oui pas vu, 3 = non (8 = ne sait pas -> missing).
    Indicator("certificat_naissance", "vs25d", (1, 2), (3,), "Certificat de naissance"),
    # vs25e: 1 = oui, 2 = non (99 = NSP -> missing).
    Indicator("naissance_enregistree", "vs25e", (1,), (2,), "Naissance enregistrée"),
)

INDICATOR_BY_KEY = {ind.key: ind for ind in INDICATORS}
VARIABLES = [ind.key for ind in INDICATORS]
SOURCE_COLUMNS = sorted({ind.column for ind in INDICATORS})
LOAD_COLUMNS = [
    STRATUM_COL,
    ZONE_COL,
    AREA_COL,
    WEIGHT_COL,
    AGE_COL,
    *SOURCE_COLUMNS,
]

NAME_PREFIX_RE = re.compile(r"^[A-Za-z]{2}\s+")
NAME_SUFFIX_RE = re.compile(
    r"\s+(Province|Zone\s+de\s+Sant\w*|Aire\s+de\s+Sant\w*)\s*$",
    flags=re.IGNORECASE,
)

R_SCRIPT = r"""
# Design-based estimation of the ECV characteristics with 95% confidence intervals. 
# Called by scripts/process-ecv-caracteristics.py. Reads the child-level extract, 
# writes one row per (domain, indicator) with the point estimate and CI bounds as proportions.

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
# weights = `ponderation`. nest = TRUE because PSU ids are only
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
  # precision, not a tight estimate.
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
    """Canonical province / zone names from the dashboard's zone boundaries.

    Returns (province lookup, zone lookup), both keyed by the normalized name
    -- the zone one by "<province>|<zone>" because zone names repeat across
    provinces. Values are the cleaned names exactly as the dashboard's
    cleanName() produces them from level_2_name / level_3_name.
    """
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


def build_indicators(df: pd.DataFrame, variables: list[str]) -> pd.DataFrame:
    """Add one 0/1 column per variable, NA where the answer does not apply.

    Every variable is an "is this child / caregiver X?" flag, so a
    design-weighted mean of the column is the percentage svyciprop estimates.
    """
    unexpected: dict[str, list] = {}
    for key in variables:
        ind = INDICATOR_BY_KEY[key]
        codes = pd.to_numeric(df[ind.column], errors="coerce")

        values = pd.Series(pd.NA, index=df.index, dtype="Int64")
        values[codes.isin(ind.yes)] = 1
        values[codes.isin(ind.no)] = 0

        # A code that is neither a yes nor a no is usually "ne sait pas" and is
        # meant to be dropped, but it is also how a recoded column announces
        # itself: so report the ones that are not already accounted for.
        known = set(ind.yes) | set(ind.no)
        stray = codes.notna() & ~codes.isin(known)
        if stray.any():
            unexpected[ind.key] = [
                (float(code), int(count))
                for code, count in codes[stray].value_counts().head(5).items()
            ]
        df[key] = values

    if unexpected:
        print("  codes outside the yes/no lists (dropped as missing):")
        for key, pairs in unexpected.items():
            shown = ", ".join(f"{code:g} x{count:,}" for code, count in pairs)
            print(f"    {key:<24} ({INDICATOR_BY_KEY[key].column}) {shown}")

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
            print(f"    {key:<24} ALL MISSING")
            continue
        unweighted = 100 * float(values[mask].mean())
        weighted = 100 * float((values[mask] * weight[mask]).sum() / weight[mask].sum())
        denom = int(mask.sum())
        flag = "  <-- no variation" if values[mask].nunique() < 2 else ""
        print(
            f"    {key:<24} {unweighted:5.1f} / {weighted:5.1f}   "
            f"n={denom:,} ({100 * denom / total:.0f}% of children){flag}"
        )

    # mere and gardienne are the two answers to one question, so they have to
    # add up: a drift here means qa100 picked up a third code.
    if {"mere", "gardienne"} <= set(variables):
        both = df["mere"].notna() & df["gardienne"].notna()
        complementary = bool(
            (df.loc[both, "mere"] + df.loc[both, "gardienne"] == 1).all()
        )
        print(
            "    cross-check: mere + gardienne = 100% of answered children"
            if complementary
            else "    WARNING: mere and gardienne do not partition `qa100`"
        )


def load_year(
    dta_path: Path,
    variables: list[str],
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

    df = canonicalize_names(df, provinces, zones)
    df = build_indicators(df, variables)

    no_weight = int(df["weight"].isna().sum())
    if no_weight:
        print(f"  WARNING: dropping {no_weight:,} children without a `{WEIGHT_COL}`")
        df = df.dropna(subset=["weight"])
    nonpositive = int((df["weight"] <= 0).sum())
    if nonpositive:
        print(f"  WARNING: {nonpositive:,} children carry a weight <= 0")

    keep = ["province", "zone", "area", "zone_key", "psu_key", "weight", *variables]
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
    r_file = workdir / "ecv_carac_survey.R"
    extract.to_csv(in_csv, index=False)
    labels.to_csv(labels_csv, index=False, encoding="utf-8")
    r_file.write_text(R_SCRIPT, encoding="utf-8")
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
            str(r_file),
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


def process_file(
    dta_path: Path,
    year: str,
    variables: list[str],
    rscript: str,
    workdir: Path | None,
    age_min: int,
    age_max: int,
    provinces: dict[str, str],
    zones: dict[str, tuple[str, str]],
) -> pd.DataFrame:
    print(f"\n=== {year} ===")
    df = load_year(dta_path, variables, provinces, zones, age_min, age_max)
    print(
        f"  analysing {len(df):,} children in {df['province'].nunique()} provinces / "
        f"{df['zone_key'].nunique()} zones / {df['psu_key'].nunique()} areas"
    )
    report_indicators(df, variables)

    counts = build_counts(df)
    print(
        f"  domains: {int((counts['level'] == 'province').sum())} provinces, "
        f"{int((counts['level'] == 'zone').sum())} zones, 1 national"
    )

    print("  running the R survey estimation ...")
    if workdir is None:
        with tempfile.TemporaryDirectory(prefix=f"ecv-carac-{year}-") as tmp:
            est = run_survey_r(df, variables, rscript, Path(tmp))
    else:
        year_dir = workdir / year
        year_dir.mkdir(parents=True, exist_ok=True)
        est = run_survey_r(df, variables, rscript, year_dir)
        print(f"  kept the R inputs/outputs in {year_dir}")

    wide = reshape_estimates(est, variables)
    check_against_reference(wide, weighted_rates(df, variables), variables)

    out = counts.merge(wide, on=["level", "domain_key"], how="left")
    unmatched = int(out[f"{variables[0]}_pct"].isna().sum())
    if unmatched:
        print(f"  WARNING: {unmatched} domain(s) got no estimate from R")
    out["nb_children"] = out["nb_children"].astype("Int64")
    out["year"] = year
    print(f"  {len(out)} rows for {year}")
    return out.drop(columns=["domain_key"])


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
        help=f"comma-separated survey years to process (default: {','.join(YEARS)})",
    )
    parser.add_argument(
        "--variables",
        default=",".join(VARIABLES),
        help="comma-separated subset of variables, for quick debugging runs "
        f"(default: all {len(VARIABLES)})",
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
    print("ECV caracteristics")
    print(f"  input dir : {INPUT_DIR}")
    print(f"  output    : {args.output}")
    print(f"  age window: {args.age_min}-{args.age_max} completed months")

    years = [y.strip() for y in args.years.split(",") if y.strip()]
    variables = [v.strip() for v in args.variables.split(",") if v.strip()]
    unknown = [v for v in variables if v not in INDICATOR_BY_KEY]
    if unknown:
        raise SystemExit(
            f"unknown variable(s): {unknown}\nknown variables: {VARIABLES}"
        )
    print(f"  years     : {years}")
    print(f"  variables : {len(variables)} -> {variables}")

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
                variables,
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
    output = output[["year", "level", "province", "zone", "nb_children", *ordered]]

    print("\n=== output ===")
    for level in ("national", "province", "zone"):
        by_year = output[output["level"] == level].groupby("year").size().to_dict()
        print(f"  {level:<9} rows per year: {by_year}")
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
        print(f"    --- {row['year']} ({row['nb_children']:,} children)")
        for variable in variables:
            print(
                f"      {INDICATOR_BY_KEY[variable].label:<28} "
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
