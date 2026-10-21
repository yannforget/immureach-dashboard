import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import { useDashboardStore } from '@/store/dashboardStore'
import { CATEGORY_ORDER } from './useDeterminantData'
import type {
  DeterminantCategory,
  ProfileScopeLevel,
} from '@/types'

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

export interface IndicatorComparison {
  scopeLabel: string
  scopeLevel: ProfileScopeLevel
  requestedLevel: ProfileScopeLevel
  items: IndicatorRow[]
}

export function useIndicatorComparison(): IndicatorComparison | null {
  const { behaviourIndicators, covariates } = useData()
  const selectedYear = useDashboardStore((s) => s.selectedYear)

  return useMemo(() => {
    if (!behaviourIndicators) return null

    const yearBlock = behaviourIndicators[String(selectedYear)]
    if (!yearBlock) return null

    // The Déterminants tab has no province/zone filter: always national.
    const entry = yearBlock.national
    if (!entry) return null

    const categoryByKey = new Map(covariates.map((c) => [c.variable_name, c.Category]))

    const items: IndicatorRow[] = []
    for (const meta of behaviourIndicators.meta) {
      const pair = entry[meta.key]
      if (!pair || pair.zd == null || pair.vacc == null) continue
      const gap = pair.zd - pair.vacc
      items.push({
        key: meta.key,
        label: meta.label,
        description: meta.description ?? '',
        category: (CATEGORY_ORDER as string[]).includes(categoryByKey.get(meta.key) ?? '')
          ? (categoryByKey.get(meta.key) as DeterminantCategory)
          : null,
        zd: pair.zd,
        vacc: pair.vacc,
        zdRaw: pair.zd_raw,
        vaccRaw: pair.vacc_raw,
        gap,
      })
    }
    // Descending by vaccinated value (highest at the top), alphabetical on ties.
    items.sort(
      (a, b) =>
        b.vacc - a.vacc ||
        a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }),
    )

    return { scopeLabel: 'National', scopeLevel: 'national', requestedLevel: 'national', items }
  }, [behaviourIndicators, covariates, selectedYear])
}
