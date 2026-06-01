import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import { useDashboardStore } from '@/store/dashboardStore'
import type {
  IndicatorValueMap,
  IndicatorsYear,
  ProfileScopeLevel,
} from '@/types'

export interface IndicatorRow {
  key: string
  label: string
  description: string
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
  const { profile, zones } = useData()
  const selectedProvince = useDashboardStore((s) => s.selectedProvince)
  const selectedZoneId = useDashboardStore((s) => s.selectedZoneId)
  const selectedYear = useDashboardStore((s) => s.selectedYear)

  return useMemo(() => {
    if (!profile) return null

    const yearBlock = profile.indicators[String(selectedYear)]
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

    const items: IndicatorRow[] = []
    for (const meta of profile.indicators.meta) {
      const pair = entry[meta.key]
      if (!pair || pair.zd == null || pair.vacc == null) continue
      const gap = pair.zd - pair.vacc
      items.push({
        key: meta.key,
        label: meta.label,
        description: meta.description ?? '',
        zd: pair.zd,
        vacc: pair.vacc,
        zdRaw: pair.zd_raw,
        vaccRaw: pair.vacc_raw,
        gap,
      })
    }
    items.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))

    const scopeLabel =
      level === 'zone'
        ? zoneRow!.displayName
        : level === 'province'
        ? selectedProvince ?? '—'
        : 'National'

    return { scopeLabel, scopeLevel: level, requestedLevel, items }
  }, [profile, zones, selectedProvince, selectedZoneId, selectedYear])
}
