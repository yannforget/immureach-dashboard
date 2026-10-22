import { CATEGORY_ORDER } from '@/hooks/determinants/useDeterminantData'
import type { DeterminantCategory, IndicatorMeta, IndicatorValueMap } from '@/types'

export interface IndicatorRow {
  key: string
  label: string
  description: string
  // COM-B category from covariates_description.csv (joined on key ==
  // variable_name); null when the indicator is not listed there.
  category: DeterminantCategory | null
  zd: number
  vacc: number
  zdRaw: number | null
  vaccRaw: number | null
  gap: number
}

// One row per indicator of `meta` that has both a zero-dose and a vaccinated
// value in `entry`, in `meta` order. Shared by the dumbbell chart and the
// map, so both read the very same numbers.
export function buildIndicatorRows(
  entry: IndicatorValueMap,
  meta: IndicatorMeta[],
  categoryByKey: Map<string, string>,
): IndicatorRow[] {
  const rows: IndicatorRow[] = []
  for (const m of meta) {
    const pair = entry[m.key]
    if (!pair || pair.zd == null || pair.vacc == null) continue
    const category = categoryByKey.get(m.key) ?? ''
    rows.push({
      key: m.key,
      label: m.label,
      description: m.description ?? '',
      category: (CATEGORY_ORDER as string[]).includes(category)
        ? (category as DeterminantCategory)
        : null,
      zd: pair.zd,
      vacc: pair.vacc,
      zdRaw: pair.zd_raw,
      vaccRaw: pair.vacc_raw,
      gap: pair.zd - pair.vacc,
    })
  }
  return rows
}

// The indicator that most separates zero-dose from vaccinated children: the
// largest absolute gap, whatever its sign. Indicators without a COM-B
// category are skipped, since the map paints an area by that category.
export function topGapIndicator(rows: IndicatorRow[]): IndicatorRow | null {
  let best: IndicatorRow | null = null
  for (const r of rows) {
    if (!r.category) continue
    if (!best || Math.abs(r.gap) > Math.abs(best.gap)) best = r
  }
  return best
}
