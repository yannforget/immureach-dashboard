import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import { useDashboardStore } from '@/store/dashboardStore'
import { buildIndicatorRows, type IndicatorRow } from '@/lib/utils/behaviourIndicators'
import type {
  IndicatorValueMap,
  IndicatorsYear,
  ProfileScopeLevel,
} from '@/types'

export type { IndicatorRow }

export interface IndicatorComparison {
  scopeLabel: string
  scopeLevel: ProfileScopeLevel
  requestedLevel: ProfileScopeLevel
  items: IndicatorRow[]
}

function pickEntry(
  yearBlock: IndicatorsYear | undefined,
  province: string | null,
  zoneName: string | null,
): { entry: IndicatorValueMap | null; level: ProfileScopeLevel } {
  if (!yearBlock) return { entry: null, level: 'national' }
  if (zoneName) {
    const z = yearBlock.zones[zoneName]
    if (z) return { entry: z, level: 'zone' }
  }
  if (province) {
    const p = yearBlock.provinces[province]
    if (p) return { entry: p, level: 'province' }
  }
  return { entry: yearBlock.national, level: 'national' }
}

export function useIndicatorComparison(): IndicatorComparison | null {
  const { behaviourIndicators, zones, covariates } = useData()
  const selectedProvince = useDashboardStore((s) => s.selectedProvince)
  const selectedZoneId = useDashboardStore((s) => s.selectedZoneId)
  const selectedYear = useDashboardStore((s) => s.selectedYear)

  return useMemo(() => {
    if (!behaviourIndicators) return null

    const yearBlock = behaviourIndicators[String(selectedYear)]
    if (!yearBlock) return null

    const zoneRow = selectedZoneId ? zones.find((z) => z.id === selectedZoneId) : null
    const requestedLevel: ProfileScopeLevel = zoneRow
      ? 'zone'
      : selectedProvince
      ? 'province'
      : 'national'

    const { entry, level } = pickEntry(
      yearBlock,
      selectedProvince,
      zoneRow ? zoneRow.displayName : null,
    )
    if (!entry) return null

    const categoryByKey = new Map(covariates.map((c) => [c.variable_name, c.Category]))

    const items = buildIndicatorRows(entry, behaviourIndicators.meta, categoryByKey)
    // Descending by vaccinated value (highest at the top), alphabetical on ties.
    items.sort(
      (a, b) =>
        b.vacc - a.vacc ||
        a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }),
    )

    const scopeLabel =
      level === 'zone'
        ? zoneRow!.displayName
        : level === 'province'
        ? selectedProvince ?? '—'
        : 'National'

    return { scopeLabel, scopeLevel: level, requestedLevel, items }
  }, [behaviourIndicators, zones, covariates, selectedProvince, selectedZoneId, selectedYear])
}
