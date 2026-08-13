import { parseCsv } from '@/lib/utils/csv'
import type { EcvCaracteristicValue, EcvCaracteristicsRow, ProfileScopeLevel } from '@/types'

function toNum(v: string): number | null {
  if (v === '' || v === undefined) return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

function toStr(v: string): string | null {
  return v === '' || v === undefined ? null : v
}

// Parses public/data/ecv_caracteristics.csv. Every `<root>_pct` column
// present in the header is stored under `values[root]` (with its optional
// `_low`/`_high` CI siblings), so columns added later in the same
// `<root>_pct/_low/_high` shape are handled without code changes.
export function parseEcvCaracteristicsCsv(text: string): EcvCaracteristicsRow[] {
  const rows = parseCsv(text)
  if (rows.length === 0) return []

  const roots: string[] = []
  for (const key of Object.keys(rows[0])) {
    if (key.endsWith('_pct')) {
      roots.push(key.slice(0, -'_pct'.length))
    }
  }

  return rows.map(r => {
    const values: Record<string, EcvCaracteristicValue> = {}
    for (const root of roots) {
      values[root] = {
        pct: toNum(r[`${root}_pct`]),
        low: toNum(r[`${root}_low`]),
        high: toNum(r[`${root}_high`]),
      }
    }

    return {
      year: Number(r.year),
      level: r.level as ProfileScopeLevel,
      province: toStr(r.province),
      zone: toStr(r.zone),
      nbChildren: toNum(r.nb_children),
      values,
    }
  })
}
