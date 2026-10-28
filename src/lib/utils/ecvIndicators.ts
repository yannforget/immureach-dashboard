import { parseCsv } from '@/lib/utils/csv'
import type { EcvMetricValue, EcvSeriesKey, IndicatorsEcvRow, ProfileScopeLevel, Year } from '@/types'
import { ECV_SERIES_KEYS } from './constants'
import { parseAgeGroup, parseMilieu } from './ecvVaccCov'

function toNum(v: string | undefined): number | null {
  if (v === '' || v === undefined) return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

function toStr(v: string | undefined): string | null {
  return v === '' || v === undefined ? null : v
}

// public/data/indicators_ecv.csv, built by scripts/ecv/process-ecv-indicators.py:
// one row per (year, age group, milieu, domain), with one `<key>_cov` /
// `_cov_low` / `_cov_high` triple per vaccine series.
export function parseIndicatorsEcvCsv(text: string): IndicatorsEcvRow[] {
  return parseCsv(text).map(r => {
    const series = {} as Record<EcvSeriesKey, EcvMetricValue>
    for (const key of ECV_SERIES_KEYS) {
      series[key] = {
        pct: toNum(r[`${key}_cov`]),
        ciLow: toNum(r[`${key}_cov_low`]),
        ciHigh: toNum(r[`${key}_cov_high`]),
      }
    }
    return {
      year: Number(r.year) as Year,
      ageGroup: parseAgeGroup(r.age_group),
      milieu: parseMilieu(r.milieu),
      level: r.level as ProfileScopeLevel,
      province: toStr(r.province),
      zone: toStr(r.zone),
      nb_people: toNum(r.nb_people),
      series,
    }
  })
}
