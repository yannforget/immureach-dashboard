# Design-based estimation of Penta3 coverage and zero-dose prevalence with 95%
# confidence intervals. Called by scripts/ecv/process-ecv-keys.py.
#
# Reads the child-level extract of the WHOLE file (every age, every milieu),
# builds the survey design on it, and only then restricts to the age window
# and the milieu with subset(). Taking the domains off the full-sample design,
# rather than filtering the data before svydesign(), keeps every stratum's
# full PSU count in the variance estimate.
#
# Also derives the indicators from the `<vaccine>_merg` columns and the
# unweighted sample sizes, and writes one row per (milieu, domain) with the
# dashboard's column names, estimates as 0-100 percentages.
#
# Usage: Rscript rscript_key_ecv.R <in_csv> <out_csv> <age_min> <age_max> <milieux>
#   milieux: comma-separated subset of all,urbain,rural
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

# `<vaccine>_merg` coding: card and mother's recall merged.
VACCINATED <- 1
NOT_VACCINATED <- 2

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

# message() writes to stderr, which process-ecv-keys.py forwards to the terminal.
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
age_min <- as.numeric(args[3])
age_max <- as.numeric(args[4])
milieux <- strsplit(args[5], ",", fixed = TRUE)[[1]]

# Python writes a missing milieu as an empty field.
d <- read.csv(in_csv, stringsAsFactors = FALSE, na.strings = c("", "NA"))

# --- Indicators -------------------------------------------------------------

merg_cols <- grep("_merg$", names(d), value = TRUE)
merg <- as.matrix(d[merg_cols])

d$penta3 <- ifelse(
  is.na(d$penta3_merg), NA_integer_, as.integer(d$penta3_merg == VACCINATED)
)
# Zero-dose: no antigen at all, i.e. every merged vaccine column says "not
# vaccinated". Unknown as soon as one column is missing.
d$zero_dose <- ifelse(
  rowSums(is.na(merg)) > 0,
  NA_integer_,
  as.integer(rowSums(merg != NOT_VACCINATED) == 0)
)

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

eligible <- subset(design, age >= age_min & age <= age_max)

# The same selection on the plain data frame, for the unweighted counts and
# the cross-check. Kept separate from the design on purpose: the cross-check
# is only worth something if it does not reuse the design's own subsetting.
in_age <- !is.na(d$age) & d$age >= age_min & d$age <= age_max
message(sprintf(
  "  [R] %s children in file -> %s aged %g-%g months (%s outside the window)",
  format(nrow(d), big.mark = ","), format(sum(in_age), big.mark = ","),
  age_min, age_max, format(sum(!in_age), big.mark = ",")
))
milieu_counts <- table(d$milieu[in_age])
message(sprintf(
  "  [R] milieu: %s (%s with no milieu)",
  paste(names(milieu_counts), format(as.integer(milieu_counts), big.mark = ","),
    collapse = ", "
  ),
  format(sum(in_age & is.na(d$milieu)), big.mark = ",")
))

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

# --- Counts -----------------------------------------------------------------

# Unweighted sample sizes of one domain. `nb_zones` is the exception: it counts
# the health zones the *survey* reached, so it is taken from the whole
# age-window sample and reads the same under every milieu -- otherwise
# switching the ribbon to `urbain` makes it look as if the survey suddenly
# covered a third of the country.
count_domain <- function(rows, level, zones_reached) {
  zone_totals <- tapply(rows$nb_areas_tot, rows$zone_id, function(x) {
    if (all(is.na(x))) NA_real_ else max(x, na.rm = TRUE)
  })
  c(
    nb_people = nrow(rows),
    nb_zones = if (level == "zone") 1L else length(zones_reached),
    nb_areas = length(unique(rows$psu_id)),
    nb_areas_tot = if (level == "zone") zone_totals[[1]] else sum(zone_totals, na.rm = TRUE)
  )
}

# --- Estimation -------------------------------------------------------------

indicators <- c(penta3 = "penta_cov", zero_dose = "zdc_cov")
results <- list()
drift <- character(0)

for (m in milieux) {
  in_milieu <- if (m == "all") rep(TRUE, nrow(d)) else !is.na(d$milieu) & d$milieu == m
  sel <- in_age & in_milieu
  message(sprintf(
    "  [R] --- milieu=%s: %s children in %d zones / %d areas ---",
    m, format(sum(sel), big.mark = ","),
    length(unique(d$zone_id[sel])), length(unique(d$psu_id[sel]))
  ))
  if (!any(sel)) {
    message(sprintf("  [R] WARNING: no child with milieu=%s; no rows emitted", m))
    next
  }
  milieu_design <- if (m == "all") eligible else subset(eligible, milieu == m)
  mvars <- milieu_design$variables

  # Domains present in this milieu: the whole sample, each province, each zone.
  domains <- c(
    list(list(
      level = "national", id = -1L, keep = rep(TRUE, nrow(mvars)),
      rows = sel, zones_reached = unique(d$zone_id[in_age])
    )),
    lapply(sort(unique(d$province_id[sel])), function(pid) {
      list(
        level = "province", id = pid, keep = mvars$province_id == pid,
        rows = sel & d$province_id == pid,
        zones_reached = unique(d$zone_id[in_age & d$province_id == pid])
      )
    }),
    lapply(sort(unique(d$zone_id[sel])), function(zid) {
      list(
        level = "zone", id = zid, keep = mvars$zone_id == zid,
        rows = sel & d$zone_id == zid, zones_reached = zid
      )
    })
  )

  for (dom in domains) {
    dsn <- if (dom$level == "national") milieu_design else domain(milieu_design, dom$keep)
    rows <- d[dom$rows, ]
    out_row <- c(
      list(milieu = m, level = dom$level, domain_id = as.integer(dom$id)),
      as.list(count_domain(rows, dom$level, dom$zones_reached))
    )
    for (ind in names(indicators)) {
      context <- paste0("milieu=", m, ", ", dom$level, " id=", dom$id, ", indicator=", ind)
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
      col <- indicators[[ind]]
      out_row[[col]] <- pct[1]
      out_row[[paste0(col, "_low")]] <- pct[2]
      out_row[[paste0(col, "_high")]] <- pct[3]
    }
    results[[length(results) + 1L]] <- as.data.frame(out_row, stringsAsFactors = FALSE)
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
