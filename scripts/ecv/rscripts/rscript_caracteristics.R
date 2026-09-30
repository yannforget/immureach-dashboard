# Design-based estimation of the ECV characteristics with 95% confidence
# intervals. Called by scripts/ecv/process-ecv-caracteristics.py.
#
# Reads the child-level extract of the WHOLE file (every age, every milieu,
# every zone), builds the survey design on it, and only then restricts to the
# age window, the zones the dashboard can draw and the milieu with subset().
# Taking the domains off the full-sample design, rather than filtering the data
# before svydesign(), keeps every stratum's full PSU count in the variance
# estimate. Every domain is estimated once per age window and milieu.
#
# Also codes the indicators from the raw source columns (following the spec
# table the Python side derives from scripts/ecv/indicators.py), counts the
# unweighted sample sizes, and writes one row per (age group, milieu, domain)
# with the dashboard's column names, estimates as 0-100 percentages.
#
# Usage: Rscript rscript_caracteristics.R <in_csv> <out_csv> <spec_csv>
#          <labels_csv> <age_groups> <milieux>
#   spec_csv:   one row per indicator: key, column, yes, no, gate_column,
#               gate_codes, partition (codes are ";"-separated)
#   labels_csv: level, id, name -- domain id -> name, for readable messages
#   age_groups: comma-separated age windows, "<min>-<max>" completed months,
#               both bounds included (e.g. 6-11,12-23,6-23)
#   milieux:    comma-separated subset of all,urbain,rural

if (!requireNamespace("survey", quietly = TRUE)) {
  stop("The R package `survey` is not installed!")
}
suppressPackageStartupMessages(library(survey))

# Subsetting to a single zone can leave a stratum contributing one PSU; centre
# those on the grand mean rather than dropping the variance contribution.
options(survey.lonely.psu = "adjust")

# R defers warnings and keeps only the last 50 by default; estimating
# thousands of small domains legitimately produces far more, so each one is
# trapped, tallied by message, and summarised at the end instead.
options(nwarnings = 10000L)

# Largest gap (in percentage points) tolerated between svyciprop's point
# estimate and a plain weighted mean computed straight off the data frame.
CROSS_CHECK_TOLERANCE <- 1.0

# Zones below this many children get a warning: their CIs will be very wide.
SMALL_ZONE <- 30L

# Which estimator actually produced each figure. Reported at the end so a
# silent mass fallback (the symptom of a broken domain subset) is visible.
tally <- new.env(parent = emptyenv())
tally$logit <- 0L
tally$beta <- 0L
tally$boundary <- 0L
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
    message("  [R] no warnings from the survey estimation")
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

fmt <- function(x) format(x, big.mark = ",")

args <- commandArgs(trailingOnly = TRUE)
in_csv <- args[1]
out_csv <- args[2]
spec_csv <- args[3]
labels_csv <- args[4]
age_groups <- strsplit(args[5], ",", fixed = TRUE)[[1]]
milieux <- strsplit(args[6], ",", fixed = TRUE)[[1]]

# Age windows are labelled "<min>-<max>" in completed months (`vs25`), BOTH
# bounds included: "6-11" keeps the 11-month-olds, "12-23" the 23-month-olds.
parse_age_group <- function(label) {
  bounds <- suppressWarnings(as.numeric(strsplit(label, "-", fixed = TRUE)[[1]]))
  if (length(bounds) != 2L || anyNA(bounds) || bounds[1] > bounds[2]) {
    stop(sprintf("malformed age group '%s': expected <min>-<max>", label))
  }
  bounds
}
age_bounds <- setNames(lapply(age_groups, parse_age_group), age_groups)
in_age_group <- function(ag) {
  b <- age_bounds[[ag]]
  !is.na(d$age) & d$age >= b[1] & d$age <= b[2]
}

# Domains travel as integer ids (accents do not survive the round trip
# reliably), so read the id -> name table back in: a warning that names a
# number the reader cannot act on is not worth printing.
labels <- read.csv(labels_csv, stringsAsFactors = FALSE, encoding = "UTF-8")
label_of <- function(level, id) {
  if (level == "national") {
    return("national")
  }
  hit <- labels$name[labels$level == level & labels$id == id]
  if (length(hit) == 0L) paste0(level, " id=", id) else paste0(level, " ", hit[1])
}

# Codes are read as text so "1;3" is not mangled into a number.
spec <- read.csv(spec_csv, colClasses = "character", na.strings = "",
                 encoding = "UTF-8")
indicators <- spec$key
parse_codes <- function(x) {
  if (is.na(x)) numeric(0) else as.numeric(strsplit(x, ";", fixed = TRUE)[[1]])
}

# Python writes a missing milieu / domain id as an empty field.
d <- read.csv(in_csv, stringsAsFactors = FALSE, na.strings = c("", "NA"))

# svydesign() cannot take a missing weight, so those rows cannot be part of
# the design at all. This is the only row filter applied before svydesign().
no_weight <- is.na(d$weight)
if (any(no_weight)) {
  message(sprintf("  [R] WARNING: %s row(s) without a weight dropped", fmt(sum(no_weight))))
  d <- d[!no_weight, ]
}
if (any(d$weight <= 0)) {
  message(sprintf("  [R] WARNING: %s row(s) carry a weight <= 0", fmt(sum(d$weight <= 0))))
}

# --- Selection ---------------------------------------------------------------

# The selection on the plain data frame, for the unweighted counts, the
# indicator reports and the cross-check. Kept separate from the design on
# purpose: the cross-check is only worth something if it does not reuse the
# design's own subsetting.
#
# A child is eligible when it falls in at least one age window; each window is
# then estimated as a domain of its own in the estimation loop.
in_age <- Reduce(`|`, lapply(age_groups, in_age_group))
# `in_geo` = the zone is in the dashboard's boundaries. Rows outside stay in the
# design (they are real PSUs of their stratum) but are never estimated on.
in_geo <- d$in_geo == 1
eligible_rows <- in_age & in_geo

for (ag in age_groups) {
  message(sprintf(
    "  [R] %s children in file -> %s aged %s months",
    fmt(nrow(d)), fmt(sum(in_age_group(ag))), ag
  ))
  if (!any(in_age_group(ag))) {
    stop(sprintf("no child aged %s months; age spans %s-%s", ag,
                 min(d$age, na.rm = TRUE), max(d$age, na.rm = TRUE)))
  }
}
message(sprintf(
  "  [R] %s child(ren) outside every age window, %s with no age",
  fmt(sum(!in_age)), fmt(sum(is.na(d$age)))
))
if (any(in_age & !in_geo)) {
  message(sprintf(
    "  [R] %s child(ren) in an age window sit in zones outside the boundaries: kept in the design, never estimated on",
    fmt(sum(in_age & !in_geo))
  ))
}

# The milieu split is a domain, not an indicator: a child whose milieu is
# missing still counts in the "all" domain, it just never lands in an
# urbain/rural one. Reported so a file coding the question differently is
# caught rather than silently halving the split.
milieu_counts <- table(d$milieu[eligible_rows])
message(sprintf(
  "  [R] milieu: %s (%s with no milieu, counted in `all` only)",
  paste(names(milieu_counts), fmt(as.integer(milieu_counts)), collapse = ", "),
  fmt(sum(eligible_rows & is.na(d$milieu)))
))

# --- Indicators --------------------------------------------------------------

# Every indicator is a 0/1 flag, NA where the answer does not apply, so a
# design-weighted mean of the column is the percentage svyciprop estimates.
# `yes` codes -> 1, `no` codes -> 0, anything else ("ne sait pas", blank) -> NA.
# A child the questionnaire routed past the question (gate answered outside
# `gate_codes`) did not report it: a 0, not a missing value. Coded on every row;
# reported on the eligible children only.
missing_source <- character(0)
gated <- character(0)
stray <- character(0)

for (i in seq_len(nrow(spec))) {
  s <- spec[i, ]
  key <- s$key

  # A variable the round simply does not carry: leave it entirely missing
  # rather than guess, and say so.
  if (is.na(s$column) || !(s$column %in% names(d))) {
    d[[key]] <- NA_integer_
    missing_source <- c(missing_source, sprintf(
      "    %s (%s)", key, if (is.na(s$column)) "no source for this year" else s$column
    ))
    next
  }

  codes <- suppressWarnings(as.numeric(d[[s$column]]))
  yes <- parse_codes(s$yes)
  no <- parse_codes(s$no)
  v <- rep(NA_integer_, nrow(d))
  v[codes %in% yes] <- 1L
  v[codes %in% no] <- 0L

  # Only blank cells are filled -- an actual answer always wins.
  if (!is.na(s$gate_column) && s$gate_column %in% names(d)) {
    gate <- suppressWarnings(as.numeric(d[[s$gate_column]]))
    skipped <- is.na(codes) & !is.na(gate) & !(gate %in% parse_codes(s$gate_codes))
    v[skipped] <- 0L
    if (any(skipped & eligible_rows)) {
      gated <- c(gated, sprintf(
        "    %-26s %7s skipped by `%s`", key, fmt(sum(skipped & eligible_rows)), s$gate_column
      ))
    }
  }

  # A code that is neither a yes nor a no is usually "ne sait pas" and meant
  # to be dropped, but it is also how a recoded column announces itself.
  odd <- eligible_rows & !is.na(codes) & !(codes %in% c(yes, no))
  if (any(odd)) {
    tab <- head(sort(table(codes[odd]), decreasing = TRUE), 5L)
    stray <- c(stray, sprintf(
      "    %-26s (%s) %s", key, s$column,
      paste(sprintf("%s x%s", names(tab), fmt(as.integer(tab))), collapse = ", ")
    ))
  }
  d[[key]] <- v
}

if (length(missing_source) > 0L) {
  message(sprintf(
    "  [R] WARNING: %d variable(s) have no usable source column in this file and stay empty:",
    length(missing_source)
  ))
  for (line in missing_source) message(line)
}
if (length(gated) > 0L) {
  message("  [R] children counted as a 'no' because the question was filtered out:")
  for (line in gated) message(line)
}
if (length(stray) > 0L) {
  message("  [R] codes outside the yes/no lists (dropped as missing):")
  for (line in stray) message(line)
}

# The modalities of one question have to add up: exactly one of them is a 1
# for every child who answered. A drift here means the source column picked up
# a code the modality lists do not cover.
for (p in unique(na.omit(spec$partition))) {
  keys <- spec$key[!is.na(spec$partition) & spec$partition == p]
  m <- as.matrix(d[eligible_rows, keys, drop = FALSE])
  answered <- rowSums(is.na(m)) == 0
  if (all(rowSums(m[answered, , drop = FALSE]) == 1)) {
    message(sprintf("    cross-check: %s = 100%% of answered children", paste(keys, collapse = " + ")))
  } else {
    message(sprintf("    WARNING: %s do not partition `%s`", paste(keys, collapse = ", "), p))
  }
}

# === Design ==================================================================

# Stratified two-stage design: strata = province, PSU = aire de sante,
# weights = `ponderation`. nest = TRUE because PSU ids are only unique within a
# stratum. Built on the whole file; the drawable zones, then each age window
# and milieu, are domains of it.
design <- svydesign(
  ids = ~psu_id,
  strata = ~stratum_id,
  weights = ~weight,
  data = d,
  nest = TRUE
)

eligible <- subset(design, in_geo == 1)

# Take a domain (subpopulation) of the design, i.e. what subset() does: drop
# the rows outside it while keeping the full sample's design information. The
# alternative, `drop = FALSE`, keeps every row and sets the excluded weights to
# zero -- but with svyciprop it returns NaN or degenerate 0/100 for most zone
# domains (whole strata end up entirely zero-weighted), so this uses the
# documented subset() behaviour instead. survey.lonely.psu = "adjust" covers
# the small strata a single zone leaves behind.
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

  # Every child in the domain has the same outcome (observed 0% or 100%). No
  # interval method gives a meaningful answer here: logit collapses to [0, 0]
  # or [1, 1] (or fails to converge) and beta reports a bound driven entirely
  # by the effective sample size. Report the point estimate with no interval,
  # which the dashboard shows as NA.
  observed <- values[keep]
  if (all(observed == 0) || all(observed == 1)) {
    tally$boundary <- tally$boundary + 1L
    return(c(observed[1], NA_real_, NA_real_))
  }

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

# Design-weighted mean straight off the data frame. svyciprop's point estimate
# is the same Horvitz-Thompson ratio, so the two must agree closely; a
# disagreement means the design subsetting selected the wrong rows -- exactly
# the failure mode that once silently produced NaN/0/100 zone estimates.
weighted_rate <- function(rows, indicator) {
  values <- rows[[indicator]]
  ok <- !is.na(values)
  if (sum(rows$weight[ok]) == 0) {
    return(NA_real_)
  }
  sum(values[ok] * rows$weight[ok]) / sum(rows$weight[ok])
}

# --- Estimation --------------------------------------------------------------

results <- list()
drift <- character(0)
started <- Sys.time()

for (ag in age_groups) {
  b <- age_bounds[[ag]]
  in_ag <- in_age_group(ag)
  age_design <- subset(eligible, age >= b[1] & age <= b[2])

  for (m in milieux) {
    in_milieu <- if (m == "all") rep(TRUE, nrow(d)) else !is.na(d$milieu) & d$milieu == m
    sel <- eligible_rows & in_ag & in_milieu
    message(sprintf(
      "\n  [R] --- age=%s, milieu=%s: %s children in %d provinces / %d zones / %d areas ---",
      ag, m, fmt(sum(sel)), length(unique(d$province_id[sel])),
      length(unique(d$zone_id[sel])), length(unique(d$psu_id[sel]))
    ))
    if (!any(sel)) {
      message(sprintf("  [R] WARNING: no child aged %s months with milieu=%s; no rows emitted", ag, m))
      next
    }
    milieu_design <- if (m == "all") age_design else subset(age_design, milieu == m)
    mvars <- milieu_design$variables

    # Domains present in this milieu: the whole sample, each province, each zone.
    domains <- c(
      list(list(level = "national", id = -1L, keep = rep(TRUE, nrow(mvars)), rows = sel)),
      lapply(sort(unique(d$province_id[sel])), function(pid) {
        list(level = "province", id = pid, keep = mvars$province_id %in% pid,
             rows = sel & d$province_id %in% pid)
      }),
      lapply(sort(unique(d$zone_id[sel])), function(zid) {
        list(level = "zone", id = zid, keep = mvars$zone_id %in% zid,
             rows = sel & d$zone_id %in% zid)
      })
    )

    small <- character(0)
    for (i in seq_along(domains)) {
      dom <- domains[[i]]
      label <- label_of(dom$level, dom$id)
      dsn <- if (dom$level == "national") milieu_design else domain(milieu_design, dom$keep)
      rows <- d[dom$rows, ]
      if (dom$level == "zone" && nrow(rows) < SMALL_ZONE) {
        small <- c(small, sprintf("    %s: %d children", label, nrow(rows)))
      }

      out_row <- list(
        age_group = ag, milieu = m, level = dom$level, domain_id = as.integer(dom$id),
        nb_children = nrow(rows)
      )
      for (ind in indicators) {
        context <- paste0("age=", ag, ", milieu=", m, ", ", label, ", indicator=", ind)
        v <- withCallingHandlers(
          prop_ci(ind, dsn),
          warning = function(w) record_warning(w, context)
        )
        ref <- weighted_rate(rows, ind)
        if ((is.na(v[1]) && !is.na(ref)) ||
          (!is.na(v[1]) && !is.na(ref) && abs(v[1] - ref) * 100 > CROSS_CHECK_TOLERANCE)) {
          drift <- c(drift, sprintf(
            "    %s: R=%.1f vs weighted mean=%.1f", context, v[1] * 100, ref * 100
          ))
        }
        # svyciprop returns proportions; the dashboard reads 0-100 percentages.
        pct <- round(v * 100, 1)
        out_row[[paste0(ind, "_pct")]] <- pct[1]
        out_row[[paste0(ind, "_low")]] <- pct[2]
        out_row[[paste0(ind, "_high")]] <- pct[3]
      }
      results[[length(results) + 1L]] <- as.data.frame(out_row, stringsAsFactors = FALSE)
    }

    if (length(small) > 0L) {
      message(sprintf(
        "  [R] WARNING: %d zone(s) with fewer than %d children -- their confidence intervals will be very wide:",
        length(small), SMALL_ZONE
      ))
      for (line in head(small, 10L)) message(line)
      if (length(small) > 10L) message(sprintf("    ... and %d more", length(small) - 10L))
    }
  }
}

out <- do.call(rbind, results)
write.csv(out, out_csv, row.names = FALSE, na = "", fileEncoding = "UTF-8")

message(sprintf(
  "\n  [R] estimates: %d logit CI, %d beta CI (logit fallback), %d at 0%%/100%% (no CI), %d without a CI",
  tally$logit, tally$beta, tally$boundary, tally$failed
))
if (length(drift) > 0L) {
  message(sprintf(
    "  [R] WARNING: %d estimate(s) disagree with the weighted mean by more than %g point(s) or are missing:",
    length(drift), CROSS_CHECK_TOLERANCE
  ))
  for (line in head(drift, 20L)) message(line)
  if (length(drift) > 20L) message(sprintf("    ... and %d more", length(drift) - 20L))
} else {
  message("  [R] cross-check OK: all estimates match the weighted means")
}

report_warnings()
