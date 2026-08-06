import { parseCsv } from '@/lib/utils/csv'
import type { EcvMetricKey, EcvMetricValue, EcvVaccCovRow, ProfileScopeLevel } from '@/types'
import { ECV_METRIC_KEYS } from './constants'

export interface EcvMetricMeta {
  key: EcvMetricKey
  label: string
}

// Tolerant matching for province/zone names: lowercase, trim, strip accents,
// so "Kasaï" / "kasai " / "KASAI" all compare equal. Used to join this
// dataset's free-text Province/ZS values against the dashboard's cleaned
// geometry names (see cleanName in dataUtils.ts).
export function normalizeAreaName(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function toNum(v: string): number | null {
  if (v === '' || v === undefined) return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

function toStr(v: string): string | null {
  return v === '' || v === undefined ? null : v
}

export function parseEcvVaccCovCsv(text: string): EcvVaccCovRow[] {
  return parseCsv(text).map(r => {
    const metrics = {} as Record<EcvMetricKey, EcvMetricValue>
    for (const key of ECV_METRIC_KEYS) {
      metrics[key] = {
        pct: toNum(r[`${key}_pct`]),
        ciLow: toNum(r[`${key}_low`]),
        ciHigh: toNum(r[`${key}_high`]),
      }
    }

    return {
      year: Number(r.year),
      level: r.level as ProfileScopeLevel,
      province: toStr(r.province),
      zone: toStr(r.zone),
      nbrChildren: toNum(r.nb_children),
      nbreAs: toNum(r.nb_as),
      asEnq: toNum(r.as_enq),
      metrics,
    }
  })
}