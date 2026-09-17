import { parseCsv } from '@/lib/utils/csv'
import type { EcvMetricKey, EcvMetricValue, EcvVaccCovRow, Milieu, ProfileScopeLevel } from '@/types'
import { MILIEUX } from '@/types'
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

// Join key for anything resolved at zone level. Zone names are not unique in
// the DRC -- "Bili" exists in both Nord Ubangi and Bas Uele, "Lubunga" in both
// Kasai Central and Tshopo -- so joining the ECV CSVs onto the boundaries by
// zone name alone silently hands one province's estimates to the other's
// shape. Every zone-level join therefore goes through the (province, zone)
// pair, exactly like the (level_2_name, level_3_name) key the ECV scripts
// canonicalise against data/output/boundaries/zones.geojson.
//
// Returns '' when either half is missing, so a half-known area never matches.
export function zoneJoinKey(
  province: string | null | undefined,
  zone: string | null | undefined,
): string {
  const p = normalizeAreaName(province)
  const z = normalizeAreaName(zone)
  return p && z ? `${p}|${z}` : ''
}

// Reads the `milieu` column the ECV scripts write from the survey's `q108`.
// A CSV generated before the milieu split has no such column, and a row of an
// unknown milieu would silently vanish from every chart, so both cases fall
// back to 'all' — the whole-sample domain, which is what those files hold.
export function parseMilieu(value: string | undefined): Milieu {
  const milieu = value?.trim() as Milieu | undefined
  return milieu && MILIEUX.includes(milieu) ? milieu : 'all'
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
      milieu: parseMilieu(r.milieu),
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