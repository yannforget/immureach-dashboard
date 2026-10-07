import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import { useDashboardStore } from '@/store/dashboardStore'
import { CATEGORY_ORDER } from './useDeterminantData'
import type {
  DeterminantCategory,
  IndicatorValueMap,
  IndicatorsYear,
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

    if (level !== requestedLevel) {
      console.warn(
        `[indicators] no data at requested ${requestedLevel}, falling back to ${level}`,
      )
    }

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
    // Group by COM-B category (Capacité, Motivation, Opportunité, then
    // uncategorised), largest absolute gap first within each group.
    const categoryRank = (c: DeterminantCategory | null) =>
      c ? CATEGORY_ORDER.indexOf(c) : CATEGORY_ORDER.length
    items.sort(
      (a, b) =>
        categoryRank(a.category) - categoryRank(b.category) ||
        Math.abs(b.gap) - Math.abs(a.gap),
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
