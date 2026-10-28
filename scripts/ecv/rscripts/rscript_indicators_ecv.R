# Design-based estimation of complete vaccination series (every dose of a
# vaccine's schedule received) with 95% confidence intervals. Called by
# scripts/ecv/process-ecv-indicators.py.
#
# Reads the child-level extract of the WHOLE file (every age, every milieu),
# builds the survey design on it, and only then restricts to each age window
# and milieu with subset(), so every stratum keeps its full PSU count in the
# variance estimate (same approach as rscript_key_ecv.R).
#
# Writes one row per (age group, milieu, domain): the unweighted sample size and, for
# each series, `<key>_cov`, `<key>_cov_low`, `<key>_cov_high` as 0-100
# percentages.
#
# Usage: Rscript rscript_indicators_ecv.R <in_csv> <out_csv> <spec_csv> <age_groups> <milieux>
#   spec_csv:   one row per series: key, columns (its `_merg` columns, `|`-separated)
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

# R defers warnings and keeps only the last 50 by default, then prints the
# unhelpful "There were 50 or more warnings" line and exits, taking them with
# it. Estimating ~1000 small domains legitimately produces thousands, so trap
# each one as it is signalled, tally it by message, and print a deduplicated
# summary at the end instead of relying on that buffer.
options(nwarnings = 10000L)

# `<vaccine>_merg` coding: card and mother's recall merged (2 = not vaccinated).
VACCINATED <- 1

# Largest gap (in percentage points) tolerated between svyciprop's point
# estimate and a plain weighted mean computed straight off the data frame.
CROSS_CHECK_TOLERANCE <- 1.0

# Which estimator actually produced each domain's figure. Reported at the end
# so a silent mass fallback (the symptom of a broken domain subset) is visible.
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

# message() writes to stderr, which process-ecv-indicators.py forwards to the terminal.
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
spec_csv <- args[3]
age_groups <- strsplit(args[4], ",", fixed = TRUE)[[1]]
milieux <- strsplit(args[5], ",", fixed = TRUE)[[1]]

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

# Python writes a missing milieu as an empty field.
d <- read.csv(in_csv, stringsAsFactors = FALSE, na.strings = c("", "NA"))
spec <- read.csv(spec_csv, stringsAsFactors = FALSE)

# --- Indicators -------------------------------------------------------------

# A series is complete when every one of its doses is coded VACCINATED.
# Unknown as soon as one of its doses is missing.
series <- setNames(strsplit(spec$columns, "|", fixed = TRUE), spec$key)
for (key in names(series)) {
  cols <- series[[key]]
  missing_cols <- setdiff(cols, names(d))
  if (length(missing_cols) > 0L) {
    stop(sprintf("series %s: column(s) not in the extract: %s", key, paste(missing_cols, collapse = ", ")))
  }
  doses <- as.matrix(d[cols])
  d[[key]] <- ifelse(
    rowSums(is.na(doses)) > 0,
    NA_integer_,
    as.integer(rowSums(doses == VACCINATED) == length(cols))
  )
  message(sprintf("  [R] series %s = %s", key, paste(cols, collapse = " & ")))
}

# --- Design -----------------------------------------------------------------

# svydesign() cannot take a missing weight, so those rows cannot be part of
# the design at all. This is the only row filter applied before svydesign().
no_weight <- is.na(d$weight)
if (any(no_weight)) {
  message(sprintf("  [R] %d row(s) without a weight dropped", sum(no_weight)))
  d <- d[!no_weight, ]
}

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
# the rows outside it while keeping the full sample's design information. The
# alternative, `drop = FALSE`, keeps every row and sets the excluded weights to
# zero -- but with svyciprop it returns NaN or degenerate 0/100 for most zone
# domains (whole strata end up entirely zero-weighted), so this uses the
# documented subset() behaviour instead. survey.lonely.psu = "adjust" covers
# the small strata a single zone leaves behind.
domain <- function(dsn, keep) suppressWarnings(dsn[keep, ])

# svyciprop's logit interval keeps the bounds inside [0, 1] and stays sensible
# for the small, near-degenerate zone domains; fall back to the beta interval
# on the rare domain where the logit fit cannot be evaluated.
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

# --- Estimation -------------------------------------------------------------

results <- list()
drift <- character(0)

for (ag in age_groups) {
  b <- age_bounds[[ag]]
  age_design <- subset(design, age >= b[1] & age <= b[2])
  # The same selection on the plain data frame, for the unweighted counts and
  # the cross-check.
  in_age <- !is.na(d$age) & d$age >= b[1] & d$age <= b[2]

  for (m in milieux) {
    in_milieu <- if (m == "all") rep(TRUE, nrow(d)) else !is.na(d$milieu) & d$milieu == m
    sel <- in_age & in_milieu
    message(sprintf(
      "  [R] --- age=%s, milieu=%s: %s children in %d zones ---",
      ag, m, format(sum(sel), big.mark = ","), length(unique(d$zone_id[sel]))
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
        list(level = "province", id = pid, keep = mvars$province_id == pid,
             rows = sel & d$province_id == pid)
      }),
      lapply(sort(unique(d$zone_id[sel])), function(zid) {
        list(level = "zone", id = zid, keep = mvars$zone_id == zid,
             rows = sel & d$zone_id == zid)
      })
    )

    for (dom in domains) {
      dsn <- if (dom$level == "national") milieu_design else domain(milieu_design, dom$keep)
      rows <- d[dom$rows, ]
      out_row <- list(
        age_group = ag, milieu = m, level = dom$level, domain_id = as.integer(dom$id),
        nb_people = nrow(rows)
      )
      for (key in names(series)) {
        context <- paste0("age=", ag, ", milieu=", m, ", ", dom$level, " id=", dom$id, ", series=", key)
        v <- withCallingHandlers(
          prop_ci(key, dsn),
          warning = function(w) record_warning(w, context)
        )
        ref <- weighted_rate(rows, key)
        if ((is.na(v[1]) && !is.na(ref)) ||
          (!is.na(v[1]) && !is.na(ref) && abs(v[1] - ref) * 100 > CROSS_CHECK_TOLERANCE)) {
          drift <- c(drift, sprintf(
            "    %s: R=%.1f vs weighted mean=%.1f", context, v[1] * 100, ref * 100
          ))
        }
        # svyciprop returns proportions; the dashboard reads 0-100 percentages.
        pct <- round(v * 100, 1)
        col <- paste0(key, "_cov")
        out_row[[col]] <- pct[1]
        out_row[[paste0(col, "_low")]] <- pct[2]
        out_row[[paste0(col, "_high")]] <- pct[3]
      }
      results[[length(results) + 1L]] <- as.data.frame(out_row, stringsAsFactors = FALSE)
    }
  }
}

out <- do.call(rbind, results)
write.csv(out, out_csv, row.names = FALSE, na = "")

message(sprintf(
  "  [R] estimates: %d logit CI, %d beta CI (logit fallback), %d at 0%%/100%% (no CI), %d without a CI",
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
