import { parseCsv } from '@/lib/csv'
import type { EcvMetricKey, EcvMetricValue, EcvVaccCovRow, ProfileScopeLevel } from '@/types'

// Keys in the exact order written by scripts/prepare-ecv-vaccination-coverage.py
// (`<key>_pct`, `<key>_ci_low`, `<key>_ci_high` columns).
export const ECV_METRIC_KEYS: EcvMetricKey[] = [
  'possession_carte',
  'couverture_de_base',
  'couverture_complete',
  'zero_dose',
  'bcg',
  'penta1',
  'penta2',
  'penta3',
  'polio0',
  'polio1',
  'polio2',
  'polio3',
  'pcv1',
  'pcv2',
  'pcv3',
  'rota1',
  'rota2',
  'rota3',
  'vpi',
  'var',
  'vaa',
]

export interface EcvMetricMeta {
  key: EcvMetricKey
  label: string
}

export const ECV_METRIC_META: Record<EcvMetricKey, EcvMetricMeta> = {
  possession_carte: { key: 'possession_carte', label: 'Possession de carte' },
  couverture_de_base: { key: 'couverture_de_base', label: 'Couverture de base' },
  couverture_complete: { key: 'couverture_complete', label: 'Couverture complète' },
  zero_dose: { key: 'zero_dose', label: 'Zéro dose' },
  bcg: { key: 'bcg', label: 'BCG' },
  penta1: { key: 'penta1', label: 'Penta1' },
  penta2: { key: 'penta2', label: 'Penta2' },
  penta3: { key: 'penta3', label: 'Penta3' },
  polio0: { key: 'polio0', label: 'Polio0' },
  polio1: { key: 'polio1', label: 'Polio1' },
  polio2: { key: 'polio2', label: 'Polio2' },
  polio3: { key: 'polio3', label: 'Polio3' },
  pcv1: { key: 'pcv1', label: 'PCV1' },
  pcv2: { key: 'pcv2', label: 'PCV2' },
  pcv3: { key: 'pcv3', label: 'PCV3' },
  rota1: { key: 'rota1', label: 'ROTA1' },
  rota2: { key: 'rota2', label: 'ROTA2' },
  rota3: { key: 'rota3', label: 'ROTA3' },
  vpi: { key: 'vpi', label: 'VPI' },
  var: { key: 'var', label: 'VAR (rougeole)' },
  vaa: { key: 'vaa', label: 'VAA (fièvre jaune)' },
}

// The metrics shown on the ECV bar chart: every vaccine-dose indicator
// *except* zero-dose (which drives the map) and the three summary/possession
// indicators (possession_carte, couverture_de_base, couverture_complete).
export const ECV_BAR_METRIC_KEYS: EcvMetricKey[] = ECV_METRIC_KEYS.filter(
  k => !['zero_dose', 'possession_carte', 'couverture_de_base', 'couverture_complete'].includes(k),
)

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