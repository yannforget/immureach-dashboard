# Design-based estimation of the ECV characteristics with 95% confidence intervals. 
# Called by scripts/process-ecv-caracteristics.py. Reads the child-level extract, 
# writes one row per (domain, indicator) with the point estimate and CI bounds as proportions.

if (!requireNamespace("survey", quietly = TRUE)) {
  stop("the R package `survey` is not installed; run: ",
       'install.packages("survey", repos = "https://cloud.r-project.org")')
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