# Design-based estimation of vaccination coverage with 95% confidence
# intervals. Called by scripts/ecv/process-ecv-vaccination-coverage.py.
#
# Reads the child-level extract of the WHOLE file (every age, every milieu,
# every zone), builds the survey design on it, and only then restricts to the
# age window, the zones the dashboard can draw and the milieu with subset().
# Taking the domains off the full-sample design, rather than filtering the data
# before svydesign(), keeps every stratum's full PSU count in the variance
# estimate. Every domain is estimated once per age window and milieu.
#
# Also codes the indicators from the `<vaccine>_merg` columns, counts the
# unweighted sample sizes, and writes one row per (age group, milieu, domain)
# with the dashboard's column names, estimates as 0-100 percentages.
#
# Usage: Rscript rscript_vaccination_coverage.R <in_csv> <out_csv> <spec_csv>
#          <labels_csv> <age_groups> <milieux>
#   spec_csv:   one row per metric: key, column (the `_merg` column it is read
#               off; empty for zero_dose, which is derived from all of them)
#   labels_csv: level, id, name -- domain id -> name, for readable messages
#   age_groups: comma-separated age windows, "<min>-<max>" completed months,
#               both bounds included (e.g. 6-11,12-23,6-23)
#   milieux:    comma-separated subset of all,urbain,rural

if (!requireNamespace("survey", quietly = TRUE)) {
  stop("the R package 'survey' is not installed: install.packages(\"survey\")")
}
suppressPackageStartupMessages(library(survey))

# Subsetting to a single zone can leave a stratum contributing one PSU; centre
# those on the grand mean rather than dropping the variance contribution.
options(survey.lonely.psu = "adjust")

# R defers warnings and keeps only the last 50 by default; estimating
# thousands of small domains legitimately produces far more, so each one is
# trapped, tallied by message, and summarised at the end instead.
options(nwarnings = 10000L)

# `<vaccine>_merg` coding: card and mother's recall merged.
VACCINATED <- 1
NOT_VACCINATED <- 2

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
# `nbre_asenq` can only be reproduced on the widest window: a narrower one
# legitimately misses the aires de sante without a child of that age.
widest_age_group <- age_groups[which.max(vapply(age_bounds, diff, numeric(1)))]
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

spec <- read.csv(spec_csv, colClasses = "character", na.strings = "",
                 encoding = "UTF-8")
indicators <- spec$key

# Python writes a missing milieu / domain id as an empty field.
d <- read.csv(in_csv, stringsAsFactors = FALSE, na.strings = c("", "NA"))

missing_cols <- setdiff(na.omit(spec$column), names(d))
if (length(missing_cols) > 0L) {
  stop(sprintf("source column(s) absent from the extract: %s",
               paste(missing_cols, collapse = ", ")))
}

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

# Every metric is an "is this child X?" flag, NA where the answer is unknown,
# so a design-weighted mean of the column is the coverage proportion
# svyciprop estimates. Coded on every row; reported on the eligible children.
merg_cols <- grep("_merg$", names(d), value = TRUE)
merg <- as.matrix(d[merg_cols])

unexpected <- character(0)
for (col in merg_cols) {
  bad <- eligible_rows & !is.na(d[[col]]) & !(d[[col]] %in% c(VACCINATED, NOT_VACCINATED))
  if (any(bad)) {
    unexpected <- c(unexpected, sprintf(
      "    %s: %s", col, paste(head(sort(unique(d[[col]][bad])), 5L), collapse = ", ")
    ))
  }
}
if (length(unexpected) > 0L) {
  message("  [R] WARNING: `_merg` codes other than 1/2 (treated as 'not vaccinated'):")
  for (line in unexpected) message(line)
}

for (i in seq_len(nrow(spec))) {
  key <- spec$key[i]
  col <- spec$column[i]
  if (is.na(col)) next
  d[[key]] <- ifelse(is.na(d[[col]]), NA_integer_, as.integer(d[[col]] == VACCINATED))
}

# Zero-dose: no antigen at all, i.e. every merged vaccine column says "not
# vaccinated". Unknown as soon as one column is missing.
if ("zero_dose" %in% indicators) {
  d$zero_dose <- ifelse(
    rowSums(is.na(merg)) > 0,
    NA_integer_,
    as.integer(rowSums(merg != NOT_VACCINATED) == 0)
  )
}

e <- d[eligible_rows, ]
for (ind in indicators) {
  values <- e[[ind]]
  ok <- !is.na(values)
  if (!any(ok)) {
    message(sprintf("    %-20s ALL MISSING", ind))
    next
  }
  flag <- if (length(unique(values[ok])) < 2L) "  <-- no variation" else ""
}

# The file ships its own zero-dose flag (`dose0_1`); the derived one must track it.
if ("zero_dose" %in% indicators && "zero_dose_ref" %in% names(e)) {
  both <- !is.na(e$zero_dose) & !is.na(e$zero_dose_ref)
  if (any(both)) {
    agreement <- 100 * mean(e$zero_dose[both] == as.integer(e$zero_dose_ref[both] == 1))
    message(sprintf(
      "    cross-check: derived zero_dose agrees with `dose0_1` on %.1f%% of children (%.1f%% flagged there)",
      agreement, 100 * mean(e$zero_dose_ref[both] == 1)
    ))
    if (agreement < 95) {
      message("    WARNING: the two zero-dose definitions disagree on more than 5% of children -- check the `_merg` column list")
    }
  }
}
rm(e)

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

# --- Counts ------------------------------------------------------------------

# Unweighted sample sizes of one domain: children, health areas surveyed
# (distinct PSUs) and health areas in the zones' sampling frame (`nbre_as`).
max_or_na <- function(x) if (all(is.na(x))) NA_real_ else max(x, na.rm = TRUE)
count_domain <- function(rows, level) {
  zone_totals <- tapply(rows$nb_as, rows$zone_id, max_or_na)
  c(
    nb_children = nrow(rows),
    nb_as = if (level == "zone") zone_totals[[1]] else sum(zone_totals, na.rm = TRUE),
    as_enq = length(unique(rows$psu_id))
  )
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
    check_as_enq <- m == "all" && ag == widest_age_group
    in_milieu <- if (m == "all") rep(TRUE, nrow(d)) else !is.na(d$milieu) & d$milieu == m
    sel <- eligible_rows & in_ag & in_milieu
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
    as_enq_mismatch <- character(0)
    for (i in seq_along(domains)) {
      dom <- domains[[i]]
      label <- label_of(dom$level, dom$id)
      dsn <- if (dom$level == "national") milieu_design else domain(milieu_design, dom$keep)
      rows <- d[dom$rows, ]
      counts <- count_domain(rows, dom$level)

      if (dom$level == "zone") {
        if (nrow(rows) < SMALL_ZONE) {
          small <- c(small, sprintf("    %s: %d children", label, nrow(rows)))
        }
        # `nbre_asenq` is the file's own count of surveyed areas; the distinct
        # PSU count must reproduce it, and a mismatch means the PSU key is wrong.
        # Only on the full sample (milieu `all`, widest age window): inside a
        # milieu or a narrower window a zone keeps just the aires de sante that
        # have a child of that milieu / age, so the two legitimately differ.
        declared <- max_or_na(rows$as_enq_file)
        if (check_as_enq && !is.na(declared) && counts[["as_enq"]] != declared) {
          as_enq_mismatch <- c(as_enq_mismatch, sprintf(
            "    %s: counted %d, file says %g", label, counts[["as_enq"]], declared
          ))
        }
      }

      out_row <- c(
        list(age_group = ag, milieu = m, level = dom$level, domain_id = as.integer(dom$id)),
        as.list(counts)
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

    if (check_as_enq) {
      if (length(as_enq_mismatch) > 0L) {
        message(sprintf(
          "  [R] WARNING: %d zone(s) where the distinct PSU count differs from `nbre_asenq`:",
          length(as_enq_mismatch)
        ))
        for (line in head(as_enq_mismatch, 10L)) message(line)
      } else {
        message("  [R] as_enq matches `nbre_asenq` in every zone")
      }
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
