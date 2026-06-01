import { useMemo } from 'react'
import { useData } from '@/context/DataContext'
import { useDashboardStore } from '@/store/dashboardStore'
import type {
  AccessibilityEntry,
  AccessibilityYear,
  ProfileScopeLevel,
} from '@/types'

export interface AccessibilityProfile {
  scopeLabel: string
  scopeLevel: ProfileScopeLevel
  // Resolved scope may not equal the user's selection if the deeper level had
  // no data (e.g. a zone with no survey row falls back to its province). The
  // `requested` field is what the user picked.
  requestedLevel: ProfileScopeLevel
  total: number
  thresholds: number[]
  counts: number[]
  cumulativePct: number[]
}

function pickEntry(
  yearBlock: AccessibilityYear | undefined,
  province: string | null,
  zoneName: string | null,
): { entry: AccessibilityEntry | null; level: ProfileScopeLevel } {
  if (!yearBlock) return { entry: null, level: 'national' }
  if (zoneName) {
    const zoneEntry = yearBlock.zones[zoneName]
    if (zoneEntry) return { entry: zoneEntry, level: 'zone' }
  }
  if (province) {
    const provEntry = yearBlock.provinces[province]
    if (provEntry) return { entry: provEntry, level: 'province' }
  }
  return { entry: yearBlock.national, level: 'national' }
}

export function useAccessibilityProfile(): AccessibilityProfile | null {
  const { profile, zones } = useData()
  const selectedProvince = useDashboardStore((s) => s.selectedProvince)
  const selectedZoneId = useDashboardStore((s) => s.selectedZoneId)
  const selectedYear = useDashboardStore((s) => s.selectedYear)

  return useMemo(() => {
    if (!profile) return null

    const yearBlock = profile.accessibility[String(selectedYear)]
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
    if (!entry || entry.n_0d == null || entry.n_0d === 0) return null

    if (level !== requestedLevel) {
      // Helpful breadcrumb during QA; harmless in production logs.
      console.warn(
        `[accessibility] no data at requested ${requestedLevel}, falling back to ${level}`,
      )
    }

    const thresholds = entry.isochrones.map((iso) => iso.min)
    const counts = entry.isochrones.map((iso) => iso.n_0d ?? 0)
    const cumulativePct = counts.map((c) => (entry.n_0d ? (c / entry.n_0d) * 100 : 0))

    const scopeLabel =
      level === 'zone'
        ? zoneRow!.displayName
        : level === 'province'
        ? selectedProvince ?? '—'
        : 'National'

    return {
      scopeLabel,
      scopeLevel: level,
      requestedLevel,
      total: entry.n_0d,
      thresholds,
      counts,
      cumulativePct,
    }
  }, [profile, zones, selectedProvince, selectedZoneId, selectedYear])
}
